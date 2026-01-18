import { getNSClient, NightscoutClient } from './ns-client';
import { Entry, Treatment, Profile, DeviceStatus, ComputedStatus } from '../db/models';
import { getStatus } from '../logic/status-logic';
import { configManager } from '../config/config-manager';

export class SyncWorker {
    private client: NightscoutClient | null = null;
    private pollInterval: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private readonly TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

    constructor() { }

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.error('SyncWorker: Starting...');

        // Initial attempt - this will trigger ensureInitialized which now awaits back-fill
        await this.syncRecent();

        // Set up Polling Fallback
        const frequency = configManager.getSystemConfig().sync_frequency_ms || 300000;
        this.pollInterval = setInterval(() => this.syncRecent(), frequency);
    }

    /**
     * Fetches historical data for a specified number of hours.
     */
    private async syncHistorical(hours: number) {
        if (!this.client) return;
        const sinceEpoch = Date.now() - hours * 60 * 60 * 1000;
        console.error(`SyncWorker: Fetching data since ${new Date(sinceEpoch).toISOString()}...`);

        try {
            const [entries, treatments, devicestatus] = await Promise.all([
                this.client.fetchRest('entries', { 'date$gte': sinceEpoch, limit: 1000 }),
                this.client.fetchRest('treatments', { 'created_at$gte': new Date(sinceEpoch).toISOString(), limit: 1000 }),
                this.client.fetchRest('devicestatus', { 'created_at$gte': new Date(sinceEpoch).toISOString(), limit: 1000 })
            ]);

            console.error(`SyncWorker: Received ${entries.length} entries, ${treatments.length} treatments, and ${devicestatus.length} device statuses.`);

            for (const entry of entries) await this.upsertToCache('entries', entry);
            for (const treatment of treatments) await this.upsertToCache('treatments', treatment);
            for (const status of devicestatus) await this.upsertToCache('devicestatus', status);

            console.error('SyncWorker: Historical back-fill complete.');
        } catch (error) {
            console.error('SyncWorker: Historical back-fill failed:', error);
        }
    }

    private isHistoricalSynced = false;
    private async ensureInitialized(): Promise<boolean> {
        if (this.client) return true;

        this.client = getNSClient();
        if (!this.client) {
            console.error('SyncWorker: No NS client available yet. Waiting for configuration...');
            return false;
        }

        // Trigger historical back-fill if not already done
        if (!this.isHistoricalSynced) {
            this.isHistoricalSynced = true;
            console.error('SyncWorker: Initializing 24h back-fill...');
            try {
                // Await historical back-fill BEFORE enabling WebSocket to prevent cache poisoning race
                await this.syncHistorical(24);
                console.error('SyncWorker: Historical back-fill finished. Enabling real-time sync...');
            } catch (err) {
                console.error('SyncWorker: Historical back-fill failed:', err);
                this.isHistoricalSynced = false; // Allow retry on next poll
            }
        }

        console.error('SyncWorker: Connecting WebSocket...');
        await this.client.connectWebSocket(this.handleNSEvent.bind(this));

        return true;
    }

    public stop() {
        this.isRunning = false;
        if (this.pollInterval) clearInterval(this.pollInterval);
        if (this.client) this.client.disconnectWebSocket();
    }

    /**
     * Handle real-time events from Nightscout.
     */
    private async handleNSEvent(event: string, data: any) {
        if (!['create', 'update'].includes(event)) return;

        const { colName, doc } = data;
        console.error(`SyncWorker: Received ${event} for ${colName}`);

        try {
            await this.upsertToCache(colName, doc);

            // Trigger status re-calculation if it's a recent glucose or treatment event
            // Skip activity-only updates (HR/Steps) to reduce database overhead
            if (colName === 'treatments') {
                const docDate = new Date(doc.created_at || Date.now());
                const now = new Date();

                // Only re-calculate if within last 15 mins to avoid backlog floods
                if (now.getTime() - docDate.getTime() < 15 * 60 * 1000) {
                    await getStatus(docDate, true, true, true); // bypassCache=true to ensure we overwrite poisoned/stale cache
                }
            } else if (colName === 'entries' && doc.type === 'sgv') {
                // Only trigger for glucose readings, not activity data
                const docDate = new Date(doc.date || Date.now());
                const now = new Date();

                if (now.getTime() - docDate.getTime() < 15 * 60 * 1000) {
                    await getStatus(docDate, true, true, true);
                }
            }
        } catch (error) {
            console.error(`SyncWorker: Error handling event:`, error);
        }
    }

    /**
     * Periodic sync to ensure we haven't missed anything (and for writers not using API V3).
     */
    private async syncRecent() {
        if (!await this.ensureInitialized()) return;

        console.error('SyncWorker: Polling for recent data...');
        try {
            // Fetch last 30 mins of entries and treatments
            const sinceEpoch = Date.now() - 30 * 60 * 1000;
            const sinceISO = new Date(sinceEpoch).toISOString();

            const [entries, treatments, profiles, devicestatus] = await Promise.all([
                this.client.fetchRest('entries', { 'date$gte': sinceEpoch }),
                this.client.fetchRest('treatments', { 'created_at$gte': sinceISO }),
                this.client.fetchRest('profile', { limit: 1 }), // Get current profile
                this.client.fetchRest('devicestatus', { 'created_at$gte': sinceISO, limit: 100 })
            ]);

            for (const entry of entries) await this.upsertToCache('entries', entry);
            for (const treatment of treatments) await this.upsertToCache('treatments', treatment);
            for (const profile of profiles) await this.upsertToCache('profile', profile);
            for (const status of devicestatus) await this.upsertToCache('devicestatus', status);

            // Trigger a fresh status calculation
            await getStatus(new Date(), true, true, true); // bypassCache=true to force update
        } catch (error) {
            console.error('SyncWorker: Polling failed:', error);
        }
    }

    private async upsertToCache(colName: string, doc: any) {
        const expireAt = new Date(Date.now() + this.TTL_MS);
        const dataWithTTL = { ...doc, expireAt };

        switch (colName) {
            case 'entries':
                await Entry.updateOne({ date: doc.date }, { $set: dataWithTTL }, { upsert: true });
                break;
            case 'treatments':
                await Treatment.updateOne({ created_at: doc.created_at }, { $set: dataWithTTL }, { upsert: true });
                break;
            case 'profile':
                await Profile.updateOne({ startDate: doc.startDate }, { $set: dataWithTTL }, { upsert: true });
                break;
            case 'devicestatus':
                await DeviceStatus.updateOne({ created_at: doc.created_at }, { $set: dataWithTTL }, { upsert: true });
                break;
        }
    }
}

// Singleton worker
let workerInstance: SyncWorker | null = null;
export function getSyncWorker() {
    if (!workerInstance) workerInstance = new SyncWorker();
    return workerInstance;
}
