import { ComputedStatus, DeviceStatus, Treatment, SystemConfig } from '../db/models';
import { getStatus } from './status-logic';
import { floorToInterval } from './cache-utils';
import { resolveActiveProfile } from './profile-logic';
import type { IStatusContext } from './types';

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

    // 1. Build Global Context for the entire window to prevent N+1 queries during bulk recalculation
    const tsEndStr = rangeEnd.toISOString();
    // Treatments need a deep lookback (48h for profile switches, 12h for COB)
    const maxTreatmentLookback = new Date(rangeStart.getTime() - (48 * 60 * 60 * 1000)).toISOString();

    console.log(`[Cache Recalc] Building global context from ${maxTreatmentLookback} to ${tsEndStr} ...`);

    // We fetch the profile for the end of the range, assuming it doesn't change wildly in the span
    // For perfect historical accuracy, getIOB/getBasal resolves profile internally per segment anyway.
    const [profileInfo, sysConfig, allTreatments] = await Promise.all([
        resolveActiveProfile(rangeEnd, true) as Promise<any>,
        SystemConfig.find().lean() as Promise<any[]>,
        Treatment.find({
            created_at: { $gte: maxTreatmentLookback, $lte: tsEndStr },
            $or: [
                { insulin: { $exists: true, $gte: 0.1 } },
                { carbs: { $exists: true, $gt: 0 } },
                { eventType: { $in: ["Temp Basal", "Profile Switch", "Site Change"] } }
            ]
        }).sort({ created_at: 1 }).lean() as Promise<any[]>
    ]);

    // Pump status changes often (every 5 mins), so we can't easily use a global one for a giant range.
    // getStatus will query DeviceStatus internally if omitted from context.
    const globalContext: IStatusContext = {
        profileInfo,
        sysConfig,
        treatments: allTreatments
        // Omitting deviceStatus so getStatus finds the correct interpolated one per bucket
    };

    console.log(`[Cache Recalc] Context built. Processing ${timestamps.length} buckets...`);

    // 2. Process in chunks to prevent DB connection pool exhaustion
    const CHUNK_SIZE = 10;
    for (let i = 0; i < timestamps.length; i += CHUNK_SIZE) {
        const chunk = timestamps.slice(i, i + CHUNK_SIZE);

        await Promise.all(chunk.map(async (timestamp) => {
            try {
                // Force recalculation by calling getStatus with bypassCache=true and our global context
                await getStatus(timestamp, true, includeAttribution, true, globalContext);
                calculated++;
            } catch (error) {
                console.error(`Failed to calculate status for ${timestamp.toISOString()}:`, error);
                failed++;
            }
        }));
    }

    return {
        total: timestamps.length,
        calculated,
        failed
    };
}
