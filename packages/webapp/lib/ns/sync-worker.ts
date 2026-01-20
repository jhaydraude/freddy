import { getNSClient, NightscoutClient } from './ns-client';
import { getStatus } from '../logic/status-logic';
import { ComputedStatus } from '../db/models';

/**
 * SyncWorker (Repurposed as Cache Invalidator)
 * 
 * In Direct Connection mode, we don't need to poll or sync data from Nightscout.
 * The raw data models (Entry, Treatment, etc.) directly query the NS database.
 * 
 * This worker now only uses the WebSocket to listen for real-time updates and
 * invalidate/recalculate the Freddy ComputedStatus cache.
 */
export class SyncWorker {
    private client: NightscoutClient | null = null;
    private isRunning: boolean = false;

    constructor() { }

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.error('SyncWorker: Starting in Invalidation Mode...');

        await this.initializeWebSocket();
    }

    private async initializeWebSocket(): Promise<boolean> {
        this.client = getNSClient();
        if (!this.client) {
            console.error('SyncWorker: No NS client available. WebSocket disabled.');
            return false;
        }

        console.error('SyncWorker: Connecting WebSocket for real-time invalidation...');
        try {
            await this.client.connectWebSocket(this.handleNSEvent.bind(this));
            return true;
        } catch (err) {
            console.error('SyncWorker: WebSocket connection failed:', err);
            return false;
        }
    }

    public stop() {
        this.isRunning = false;
        if (this.client) this.client.disconnectWebSocket();
    }

    /**
     * Handle real-time events from Nightscout.
     * We don't save the data, we just invalidate the computed cache.
     */
    private async handleNSEvent(event: string, data: any) {
        if (!['create', 'update', 'delete'].includes(event)) return;

        const { colName, doc } = data;

        try {
            // Trigger status re-calculation if it's a recent glucose or treatment event
            if (colName === 'treatments') {
                const docDate = new Date(doc.created_at || Date.now());
                const now = new Date();

                // Only re-calculate if within last 15 mins
                if (now.getTime() - docDate.getTime() < 15 * 60 * 1000) {
                    console.error(`SyncWorker: Invalidating cache due to ${event} in ${colName}`);
                    await this.invalidateCache(docDate);
                    // Force a recalculation for the current time
                    await getStatus(new Date(), true, true, true);
                }
            } else if (colName === 'entries' && doc.type === 'sgv') {
                const docDate = new Date(doc.date || Date.now());
                const now = new Date();

                if (now.getTime() - docDate.getTime() < 15 * 60 * 1000) {
                    console.error(`SyncWorker: Invalidating cache due to ${event} in ${colName}`);
                    await this.invalidateCache(docDate);
                    await getStatus(new Date(), true, true, true);
                }
            }
        } catch (error) {
            console.error(`SyncWorker: Error handling event:`, error);
        }
    }

    /**
     * Clears ComputedStatus records from the given timestamp onwards.
     */
    private async invalidateCache(since: Date) {
        try {
            // Round down to the nearest 5-minute bucket (matching getStatus logic)
            const bucket = new Date(Math.floor(since.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000));
            const result = await ComputedStatus.deleteMany({ timestamp: { $gte: bucket } });
            if (result.deletedCount > 0) {
                console.error(`SyncWorker: Invalidated ${result.deletedCount} cached status records since ${bucket.toISOString()}`);
            }
        } catch (err) {
            console.error('SyncWorker: Invalidation failed:', err);
        }
    }

    /**
     * Keep for interface compatibility if needed by other services.
     */
    public async syncHistorical(hours: number, tuningId?: string, tuningType?: string) {
        console.error('SyncWorker: Historical sync requested but disabled in Direct Connection mode.');
        return Promise.resolve();
    }
}

// Singleton worker
let workerInstance: SyncWorker | null = null;
export function getSyncWorker() {
    if (!workerInstance) workerInstance = new SyncWorker();
    return workerInstance;
}
