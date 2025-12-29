import { getStatus } from './status-logic.js';
import type { IStatusResult } from './status-logic.js';

/**
 * Options for fetching status history.
 */
export interface IStatusHistoryOptions {
    startTime?: string | Date | undefined;
    windowSize?: number | undefined;
    bucketSize?: number | undefined;
}

/**
 * Fetches system status at regular intervals over a historical window.
 * Returns an array of status reports.
 */
export async function getStatusHistory(options: IStatusHistoryOptions = {}): Promise<IStatusResult[]> {
    const {
        startTime = new Date().toISOString(),
        windowSize = 60,
        bucketSize = 5
    } = options;

    const endTs = new Date(startTime).getTime();
    const startTs = endTs - (windowSize * 60 * 1000);
    const stepMs = bucketSize * 60 * 1000;

    const timestamps: number[] = [];
    for (let currentTs = startTs; currentTs <= endTs; currentTs += stepMs) {
        timestamps.push(currentTs);
    }

    // Process buckets. Using Promise.all for performance, though getStatus is heavy.
    // Given typically < 20 buckets, this is manageable.
    // We disable attribution here as it's not used by the dashboard and is heavy.
    return Promise.all(timestamps.map(ts => getStatus(new Date(ts), true, false)));
}
