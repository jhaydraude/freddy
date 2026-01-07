import { getStatus } from './status-logic.js';
import type { IStatusResult } from './types.js';

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

    // Process buckets in parallel for maximum speed
    // Keep timeseries enabled as it's needed by the dashboard and doesn't add significant overhead
    // Disable attribution as it's computationally expensive and not used by dashboard
    return Promise.all(timestamps.map(ts => getStatus(new Date(ts), true, false)));
}
