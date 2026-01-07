import { ComputedStatus } from '../db/models.js';
import { getStatus } from './status-logic.js';
import { floorToInterval } from './cache-utils.js';

/**
 * Recalculates and caches computed statuses for a given time range.
 */
export async function recalculateStatusRange(
    start: Date,
    end: Date,
    bucketSize: number = 5,
    includeAttribution: boolean = true
) {
    const bucketMs = bucketSize * 60 * 1000;
    const timestamps: Date[] = [];

    // Ensure we start at a bucket boundary
    const rangeStart = floorToInterval(start, bucketSize);
    const rangeEnd = floorToInterval(end, bucketSize);

    for (let ts = rangeStart.getTime(); ts <= rangeEnd.getTime(); ts += bucketMs) {
        timestamps.push(new Date(ts));
    }

    // Delete existing cached statuses in this range
    await ComputedStatus.deleteMany({
        timestamp: {
            $gte: rangeStart,
            $lte: rangeEnd
        }
    });

    let calculated = 0;
    let failed = 0;

    for (const timestamp of timestamps) {
        try {
            // Force recalculation by calling getStatus with bypassCache=true
            await getStatus(timestamp, true, includeAttribution, true);
            calculated++;
        } catch (error) {
            console.error(`Failed to calculate status for ${timestamp.toISOString()}:`, error);
            failed++;
        }
    }

    return {
        total: timestamps.length,
        calculated,
        failed
    };
}
