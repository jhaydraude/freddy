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
    private patternTimer: NodeJS.Timeout | null = null;

    constructor() { }

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.error('SyncWorker: Starting in Invalidation Mode...');

        await this.initializeWebSocket();

        // Run pattern detection 10 seconds after startup, then every 6 hours
        this.patternTimer = setTimeout(async () => {
            await this.runPatternDetector();
            this.patternTimer = setInterval(() => this.runPatternDetector(), 6 * 60 * 60 * 1000);
        }, 10000);
    }

    private async runPatternDetector() {
        try {
            console.error('SyncWorker: Running background pattern detection...');
            const { detectRecurringPatterns } = await import('../logic/pattern-detector');
            const result = await detectRecurringPatterns();
            console.error(`SyncWorker: Pattern detection complete. Scanned ${result.scannedDays} days, found ${result.patternsFound} blocks with data, upserted ${result.upsertedCount} active patterns.`);
        } catch (err) {
            console.error('SyncWorker: Background pattern detection failed:', err);
        }
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
        if (this.patternTimer) {
            clearTimeout(this.patternTimer);
            clearInterval(this.patternTimer);
            this.patternTimer = null;
        }
    }

    /**
     * Handle real-time events from Nightscout.
     * We don't save the data, we just invalidate the computed cache.
     * For activity HR entries, we also detect stale readings in real-time.
     */
    private async handleNSEvent(event: string, data: any) {
        if (!['create', 'update', 'delete'].includes(event)) return;

        const { colName, doc } = data;

        try {
            // Real-time stale HR detection for new activity entries
            if (colName === 'entries' && doc.type === 'activity' && doc.heartrate != null && event === 'create') {
                await this.checkAndFlagStaleHR(doc);
            }

            // Trigger status re-calculation if it's a recent glucose or treatment event
            if (colName === 'treatments' || (colName === 'entries' && doc.type === 'sgv')) {
                const docDate = new Date(doc.created_at || doc.date || Date.now());
                const now = new Date();

                // Only re-calculate if within last 15 mins (recent data, not historical backfill)
                if (now.getTime() - docDate.getTime() < 15 * 60 * 1000) {
                    console.error(`SyncWorker: Invalidating cache due to ${event} in ${colName}`);

                    // 1. Delete the bad / stale cache
                    await this.invalidateCache(docDate);

                    // 2. Fire and forget a background recomputation job!
                    // This ensures the dashboard loads instantly (hitting prepopulated cache) next time.
                    const { recalculateStatusRange } = await import('../logic/cache-logic');

                    // Use setImmediate to detach from the current WebSocket event processing loop
                    setImmediate(async () => {
                        try {
                            console.error(`SyncWorker: Starting background recomputation from ${docDate.toISOString()} to ${now.toISOString()}`);
                            await recalculateStatusRange(docDate, now);
                            console.error(`SyncWorker: Background recomputation complete.`);
                        } catch (err) {
                            console.error('SyncWorker: Background recomputation failed:', err);
                        }
                    });
                }
            }
        } catch (error) {
            console.error(`SyncWorker: Error handling event:`, error);
        }
    }

    /**
     * Real-time stale HR detection.
     * When a new HR record arrives, check if it and the last 2 records form a
     * low-variance cluster (≤3 BPM range) with no concurrent step activity.
     * This catches off-body phantom readings from the optical sensor, which vary
     * slightly (~1-3 BPM) rather than matching exactly.
     *
     * We preserve the FIRST record in a stale run (may be the last real reading)
     * and flag the duplicates that follow it.
     *
     * Example: 2:59=85(real), 3:00=86(stale), 3:01=85(stale)
     * When 3:01 arrives: range=1≤3, no steps → flag 3:01 and 3:00, keep 2:59.
     */
    private async checkAndFlagStaleHR(doc: any) {
        try {
            const { Entry } = await import('../db/models');

            // Find the last 2 HR records before this one
            const recentHR = await Entry.find({
                type: 'activity',
                heartrate: { $exists: true },
                date: { $lt: doc.date }
            }).sort({ date: -1 }).limit(2).select('_id heartrate stale date').lean();

            if (recentHR.length < 2) return;

            // Use a ≤3 BPM range instead of exact equality — off-body phantom
            // readings are nearly flat but rarely produce perfectly identical integers.
            const allBpms = [
                (recentHR[1] as any).heartrate,
                (recentHR[0] as any).heartrate,
                doc.heartrate
            ];
            const bpmRange = Math.max(...allBpms) - Math.min(...allBpms);
            if (bpmRange > 3) return;

            // Only flag when there's no concurrent step activity. A resting person
            // sitting still may also have low HR variance, but the watch will still
            // record steps=0 in separate step-type records. HR records don't carry
            // steps themselves, so we look at step records in the same time window.
            const windowStart = (recentHR[1] as any).date;
            const hasRecentSteps = await Entry.exists({
                type: 'activity',
                steps: { $gt: 0 },
                date: { $gte: windowStart, $lte: doc.date }
            });
            if (hasRecentSteps) return;

            // Low-variance HR + no steps → likely off-body phantom readings.
            await Entry.updateOne(
                { _id: doc._id },
                { $set: { stale: true } }
            );

            // Flag the immediate predecessor if not already stale.
            // Do NOT flag recentHR[1] — it is either the last legitimate reading
            // or already flagged from a prior check.
            if (!(recentHR[0] as any).stale) {
                await Entry.updateOne(
                    { _id: (recentHR[0] as any)._id },
                    { $set: { stale: true } }
                );
            }
        } catch (error) {
            // Non-critical — don't let stale detection break the event pipeline
            console.warn('SyncWorker: Stale HR check failed:', error);
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
