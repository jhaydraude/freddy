import { getStatus } from './status-logic';
import type { IStatusResult } from './types';

/**
 * Options for fetching status history.
 */
export interface IStatusHistoryOptions {
    startTime?: string | Date | undefined;
    windowSize?: number | undefined;
    bucketSize?: number | undefined;
    bypassCache?: boolean | undefined;
}

export async function getStatusHistory(options: IStatusHistoryOptions = {}): Promise<IStatusResult[]> {
    const {
        startTime = new Date().toISOString(),
        windowSize = 60,
        bucketSize = 5,
        bypassCache = false
    } = options;

    const endTs = new Date(startTime).getTime();
    const startTs = endTs - (windowSize * 60 * 1000);
    const stepMs = bucketSize * 60 * 1000;

    const timestamps: number[] = [];
    for (let currentTs = startTs; currentTs <= endTs; currentTs += stepMs) {
        timestamps.push(currentTs);
    }

    // 1. Bulk Cache Lookup
    let cachedResultsMap: Map<number, IStatusResult> = new Map();
    const { floorToInterval, isCacheValid } = await import('./cache-utils');
    const { ComputedStatus } = await import('../db/models');

    if (!bypassCache) {
        try {
            // Find all rounded bucket times
            const bucketKeys = timestamps.map(ts => floorToInterval(new Date(ts), bucketSize));

            const cachedDocs = await ComputedStatus.find({
                timestamp: { $in: bucketKeys }
            }).lean() as any[];

            for (const doc of cachedDocs) {
                if (isCacheValid(doc, 7)) {
                    const status = doc.status as IStatusResult;
                    // Self-healing check
                    if (status.glucose?.current?.sgv === null || isNaN(status.glucose?.current?.sgv as any)) {
                        console.warn(`getStatusHistory: Cached status for ${doc.timestamp} is poisoned. Bypassing cache...`);
                    } else {
                        cachedResultsMap.set(new Date(doc.timestamp).getTime(), status);
                    }
                }
            }
        } catch (error) {
            console.warn('getStatusHistory: Bulk cache read failed:', error);
        }
    }

    // 2. Identify Misses & Compute
    const results: IStatusResult[] = [];
    const missingTimestamps: number[] = [];

    for (const ts of timestamps) {
        const bucketTime = floorToInterval(new Date(ts), bucketSize).getTime();
        if (cachedResultsMap.has(bucketTime)) {
            results.push(cachedResultsMap.get(bucketTime)!);
        } else {
            missingTimestamps.push(ts);
        }
    }

    // 3. Process misses in chunks to avoid DB connection pool exhaustion (N+1 queries inside getStatus)
    // Future optimization: Pass a global IStatusContext to getStatus to avoid redudant profile/treatment fetches
    if (missingTimestamps.length > 0) {
        console.log(`getStatusHistory: Bulk cache retrieved ${results.length}, processing ${missingTimestamps.length} misses...`);
        const CHUNK_SIZE = 10;
        for (let i = 0; i < missingTimestamps.length; i += CHUNK_SIZE) {
            const chunk = missingTimestamps.slice(i, i + CHUNK_SIZE);
            const chunkResults = await Promise.all(
                chunk.map(ts => getStatus(new Date(ts), true, false, bypassCache))
            );
            results.push(...chunkResults);
        }
    }

    // 4. Return sorted results
    return results.sort((a, b) => new Date(a.meta.status_date).getTime() - new Date(b.meta.status_date).getTime());
}

