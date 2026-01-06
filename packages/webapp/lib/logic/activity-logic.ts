import { ActivityRecord } from '../db/models.js';
import { connectToDatabase } from '../db/connection.js';

export interface IActivityPoint {
    timestamp: string;
    steps?: {
        count: number;
        distance?: number;
        calories?: number;
        floors?: number;
    };
    heartRate?: {
        bpm: number;
        bpm_avg?: number;
        bpm_min?: number;
        bpm_max?: number;
    };
}

export interface IActivitySummary {
    stepsToday: number;
    latestHeartRate: {
        bpm: number;
        timestamp: string;
    } | null;
    heartRateStats?: {
        avg: number;
        min: number;
        max: number;
    };
}

/**
 * Fetches and aggregates activity data for a given time window.
 */
export async function getActivityHistory(start: Date, end: Date, bucketSizeMin: number = 5): Promise<IActivityPoint[]> {
    await connectToDatabase();

    const records = await ActivityRecord.find({
        $or: [
            { timestamp: { $gte: start.getTime(), $lte: end.getTime() } },
            { startTime: { $gte: start.getTime(), $lte: end.getTime() } },
            { endTime: { $gte: start.getTime(), $lte: end.getTime() } }
        ]
    }).sort({ startTime: 1, timestamp: 1 }).lean();

    const bucketMs = bucketSizeMin * 60 * 1000;
    const buckets: Map<number, IActivityPoint> = new Map();

    const getBucketStart = (ts: number) => Math.floor(ts / bucketMs) * bucketMs;

    for (const r of records) {
        const ts = r.startTime || r.timestamp || r.created_at.getTime();
        const bStart = getBucketStart(ts);

        if (!buckets.has(bStart)) {
            buckets.set(bStart, {
                timestamp: new Date(bStart).toISOString()
            });
        }

        const b = buckets.get(bStart)!;

        if (r.type === 'steps') {
            if (!b.steps) b.steps = { count: 0 };
            b.steps.count += (r.data.count || 0);
            if (r.data.distance_meters) b.steps.distance = (b.steps.distance || 0) + r.data.distance_meters;
            if (r.data.calories_kcal) b.steps.calories = (b.steps.calories || 0) + r.data.calories_kcal;
            if (r.data.floors_climbed_total) b.steps.floors = (b.steps.floors || 0) + r.data.floors_climbed_total;
        } else if (r.type === 'heart_rate') {
            const bpm = r.data.bpm || r.data.bpm_avg;
            if (bpm == null) continue;

            const min = r.data.bpm_min ?? bpm;
            const max = r.data.bpm_max ?? bpm;

            if (!b.heartRate) {
                b.heartRate = { bpm: bpm, bpm_avg: bpm, bpm_min: min, bpm_max: max };
                // Internal counters for averaging multiple point readings in a bucket
                (b as any)._hrSum = bpm;
                (b as any)._hrCount = 1;
            } else {
                (b as any)._hrSum += bpm;
                (b as any)._hrCount += 1;
                b.heartRate.bpm_avg = Math.round((b as any)._hrSum / (b as any)._hrCount);
                b.heartRate.bpm = b.heartRate.bpm_avg;
                b.heartRate.bpm_min = Math.min(b.heartRate.bpm_min!, min);
                b.heartRate.bpm_max = Math.max(b.heartRate.bpm_max!, max);
            }
        }
    }

    return Array.from(buckets.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * Gets a summary of activity for the current day.
 */
export async function getActivitySummary(): Promise<IActivitySummary> {
    await connectToDatabase();

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // Sum steps for today
    const stepRecords = await ActivityRecord.find({
        type: 'steps',
        startTime: { $gte: startOfToday.getTime() }
    }).lean();

    const stepsToday = stepRecords.reduce((sum, r) => sum + (r.data.count || 0), 0);

    // Latest heart rate
    const latestHR = await ActivityRecord.findOne({
        type: 'heart_rate'
    }).sort({ timestamp: -1, startTime: -1 }).lean();

    const latestHeartRate = latestHR ? {
        bpm: latestHR.data.bpm || latestHR.data.bpm_avg,
        timestamp: new Date(latestHR.timestamp || latestHR.startTime || latestHR.created_at).toISOString()
    } : null;

    // Heart rate stats for the last 24 hours
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const hrRecords = await ActivityRecord.find({
        type: 'heart_rate',
        startTime: { $gte: last24h.getTime() }
    }).lean();

    let heartRateStats;
    if (hrRecords.length > 0) {
        const bpms = hrRecords.map(r => r.data.bpm || r.data.bpm_avg).filter(b => b != null);
        if (bpms.length > 0) {
            heartRateStats = {
                avg: Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length),
                min: Math.min(...bpms),
                max: Math.max(...bpms)
            };
        }
    }

    return {
        stepsToday,
        latestHeartRate,
        heartRateStats
    };
}
