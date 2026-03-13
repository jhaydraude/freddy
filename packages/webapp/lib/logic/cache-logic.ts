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
    
    // For sensor, calibration, device status we want to be sure we find the *last* one before the window starts
    const maxGlobalLookback = new Date(rangeStart.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString();
    
    // For entries and activities, we look back a bit further than range start for deltas
    const maxEntryLookback = new Date(rangeStart.getTime() - (2 * 60 * 60 * 1000)).getTime();
    const endTsNumber = rangeEnd.getTime();

    console.log(`[Cache Recalc] Building global context from ${maxTreatmentLookback} to ${tsEndStr} ...`);

    const { getBaseline } = await import('./baseline-logic');
    const { Entry } = await import('../db/models');

    // We fetch the profile for the end of the range, assuming it doesn't change wildly in the span
    // For perfect historical accuracy, getIOB/getBasal resolves profile internally per segment anyway.
    const [profileInfo, sysConfig, allTreatments, deviceStatuses, sgvEntries, activityEntries, sensorChanges, calibrations, baselineData] = await Promise.all([
        resolveActiveProfile(rangeEnd, true) as Promise<any>,
        SystemConfig.find().lean() as Promise<any[]>,
        Treatment.find({
            created_at: { $gte: maxTreatmentLookback, $lte: tsEndStr },
            $or: [
                { insulin: { $exists: true, $gte: 0.1 } },
                { carbs: { $exists: true, $gt: 0 } },
                { eventType: { $in: ["Temp Basal", "Profile Switch", "Site Change"] } }
            ]
        }).sort({ created_at: 1 }).lean() as Promise<any[]>,
        DeviceStatus.find({
            created_at: { $gte: maxGlobalLookback, $lte: tsEndStr }
        }).sort({ created_at: -1 }).lean() as Promise<any[]>,
        Entry.find({
            type: 'sgv',
            date: { $gte: maxEntryLookback, $lte: endTsNumber }
        }).sort({ date: -1 }).lean() as Promise<any[]>,
        Entry.find({
            type: 'activity',
            stale: { $ne: true },
            date: { $gte: maxEntryLookback, $lte: endTsNumber }
        }).sort({ date: 1 }).lean() as Promise<any[]>,
        Treatment.find({
            eventType: "Sensor Change",
            created_at: { $gte: maxGlobalLookback, $lte: tsEndStr }
        }).sort({ created_at: -1 }).lean() as Promise<any[]>,
        Treatment.find({
            eventType: "BG Check",
            mbg: { $exists: true },
            created_at: { $gte: maxGlobalLookback, $lte: tsEndStr }
        }).sort({ created_at: -1 }).lean() as Promise<any[]>,
        getBaseline() as Promise<any>
    ]);

    const globalContext: IStatusContext = {
        profileInfo,
        sysConfig,
        treatments: allTreatments,
        glucoseEntries: sgvEntries,
        activityEntries,
        sensorChanges,
        calibrations,
        baselineData
    };

    console.log(`[Cache Recalc] Context built. Processing ${timestamps.length} buckets...`);

    // 2. Process in chunks to prevent DB connection pool exhaustion
    const CHUNK_SIZE = 10;
    for (let i = 0; i < timestamps.length; i += CHUNK_SIZE) {
        const chunk = timestamps.slice(i, i + CHUNK_SIZE);

        await Promise.all(chunk.map(async (timestamp) => {
            try {
                const bucketIso = timestamp.toISOString();
                // Find latest device status for this bucket timestamp (they are sorted desc)
                const deviceStatus = deviceStatuses.find(ds => ds.created_at <= bucketIso);
                const localContext: IStatusContext = {
                    ...globalContext,
                    deviceStatus
                };

                // Force recalculation by calling getStatus with bypassCache=true and our local context
                await getStatus(timestamp, true, includeAttribution, true, localContext);
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
