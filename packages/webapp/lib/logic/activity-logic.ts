import { Entry } from '../db/models';
import { connectToDatabase } from '../db/connection';

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

    const records = await Entry.find({
        type: 'activity',
        date: { $gte: start.getTime(), $lte: end.getTime() }
    }).sort({ date: 1 }).lean();

    const bucketMs = bucketSizeMin * 60 * 1000;
    const buckets: Map<number, IActivityPoint> = new Map();

    const getBucketStart = (ts: number) => Math.floor(ts / bucketMs) * bucketMs;

    for (const r of records) {
        const ts = r.date;
        const bStart = getBucketStart(ts);

        if (!buckets.has(bStart)) {
            buckets.set(bStart, {
                timestamp: new Date(bStart).toISOString()
            });
        }

        const b = buckets.get(bStart)!;

        // Handle Steps
        if (r.steps != null) {
            if (!b.steps) b.steps = { count: 0 };
            b.steps.count += (r.steps || 0);
        }

        // Handle Heart Rate
        if (r.heartrate != null) {
            const bpm = r.heartrate;
            if (!b.heartRate) {
                b.heartRate = { bpm: bpm, bpm_avg: bpm, bpm_min: bpm, bpm_max: bpm };
                (b as any)._hrSum = bpm;
                (b as any)._hrCount = 1;
            } else {
                (b as any)._hrSum += bpm;
                (b as any)._hrCount += 1;
                b.heartRate.bpm_avg = Math.round((b as any)._hrSum / (b as any)._hrCount);
                b.heartRate.bpm = b.heartRate.bpm_avg;
                b.heartRate.bpm_min = Math.min(b.heartRate.bpm_min!, bpm);
                b.heartRate.bpm_max = Math.max(b.heartRate.bpm_max!, bpm);
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
    const stepRecords = await Entry.find({
        type: 'activity',
        steps: { $exists: true },
        date: { $gte: startOfToday.getTime() }
    }).lean();

    const stepsToday = stepRecords.reduce((sum, r) => sum + (r.steps || 0), 0);

    // Latest heart rate
    const latestHR = await Entry.findOne({
        type: 'activity',
        heartrate: { $exists: true }
    }).sort({ date: -1 }).lean();

    const latestHeartRate = latestHR ? {
        bpm: latestHR.heartrate!,
        timestamp: new Date(latestHR.date).toISOString()
    } : null;

    // Heart rate stats for the last 24 hours
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const hrRecords = await Entry.find({
        type: 'activity',
        heartrate: { $exists: true },
        date: { $gte: last24h.getTime() }
    }).lean();

    let heartRateStats;
    if (hrRecords.length > 0) {
        const bpms = hrRecords.map(r => r.heartrate).filter((b): b is number => b != null);
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
