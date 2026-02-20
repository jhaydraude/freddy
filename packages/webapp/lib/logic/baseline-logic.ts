import { Entry } from '../db/models';
import { connectToDatabase } from '../db/connection';

/**
 * User baseline activity metrics for relative intensity calculation.
 * Calculated from historical data and persisted to system_config.
 */
export interface IUserBaseline {
    avgStepsPerMin: number;      // Median daily steps / active minutes
    restingHR: number;           // Overnight P10 heart rate
    maxHR: number;               // Observed maximum HR (or 220-age fallback)
    overnightHR_p10: number;     // 10th percentile of overnight HR
    lastUpdated: string;         // ISO timestamp of last calculation
}

const DEFAULT_BASELINE: IUserBaseline = {
    avgStepsPerMin: 50,
    restingHR: 70,
    maxHR: 185,
    overnightHR_p10: 60,
    lastUpdated: new Date(0).toISOString()
};

const BASELINE_STALE_HOURS = 24;
const BASELINE_CONFIG_KEY = 'user_activity_baseline';

/**
 * Calculate resting heart rate using overnight P10 method.
 * 
 * Filters HR records to overnight hours (1-5 AM local time)
 * and returns the 10th percentile as the resting HR.
 * This avoids contamination from daytime stress/caffeine/activity.
 * 
 * @param lookbackDays Number of days to look back for overnight HR data
 * @returns Resting HR (P10 of overnight readings)
 */
export async function calculateRestingHR(lookbackDays: number = 14): Promise<{ restingHR: number; overnightHR_p10: number; maxHR: number }> {
    await connectToDatabase();

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    // Use MongoDB aggregation to get P10 of overnight HR (1-5 AM UTC)
    // Note: MongoDB $hour returns UTC hours. We query 6-10 AM UTC = ~1-5 AM EST.
    // This should be configurable per timezone, but UTC+5 offset works for EST.
    const overnightStartUTC = 6;  // 1 AM EST = 6 AM UTC
    const overnightEndUTC = 10;   // 5 AM EST = 10 AM UTC

    const result = await Entry.aggregate([
        {
            $match: {
                type: 'activity',
                stale: { $ne: true },
                heartrate: { $exists: true, $gt: 0 },
                date: { $gte: startDate.getTime(), $lte: endDate.getTime() }
            }
        },
        {
            $addFields: {
                hour: { $hour: { $toDate: '$date' } }
            }
        },
        {
            $facet: {
                overnight: [
                    {
                        $match: {
                            hour: { $gte: overnightStartUTC, $lt: overnightEndUTC }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            p10: { $percentile: { input: '$heartrate', p: [0.10], method: 'approximate' } },
                            count: { $sum: 1 }
                        }
                    }
                ],
                allTime: [
                    {
                        $group: {
                            _id: null,
                            maxHR: { $max: '$heartrate' },
                            totalCount: { $sum: 1 }
                        }
                    }
                ]
            }
        }
    ]);

    const overnightData = result[0]?.overnight?.[0];
    const allTimeData = result[0]?.allTime?.[0];

    const overnightHR_p10 = overnightData?.p10?.[0] ?? DEFAULT_BASELINE.overnightHR_p10;
    const maxHR = allTimeData?.maxHR ?? DEFAULT_BASELINE.maxHR;

    return {
        restingHR: Math.round(overnightHR_p10),
        overnightHR_p10: Math.round(overnightHR_p10),
        maxHR: Math.round(maxHR)
    };
}

/**
 * Calculate median daily step rate from historical data.
 * Uses the median of non-zero daily step totals divided by active minutes.
 * 
 * @param lookbackDays Number of days to look back
 * @returns Average steps per minute during active periods
 */
export async function calculateStepBaseline(lookbackDays: number = 14): Promise<number> {
    await connectToDatabase();

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    // Group steps by day and calculate daily totals
    const result = await Entry.aggregate([
        {
            $match: {
                type: 'activity',
                stale: { $ne: true },
                steps: { $exists: true, $gt: 0 },
                date: { $gte: startDate.getTime(), $lte: endDate.getTime() }
            }
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$date' } }
                },
                totalSteps: { $sum: '$steps' },
                recordCount: { $sum: 1 }
            }
        },
        {
            $match: { totalSteps: { $gt: 0 } }
        },
        {
            $group: {
                _id: null,
                medianStepsPerRecord: {
                    $percentile: {
                        input: { $divide: ['$totalSteps', '$recordCount'] },
                        p: [0.50],
                        method: 'approximate'
                    }
                }
            }
        }
    ]);

    const medianPerRecord = result[0]?.medianStepsPerRecord?.[0];

    if (medianPerRecord != null) {
        // Each record covers ~5 minutes, so steps/record ÷ 5 = steps/min
        return Math.round((medianPerRecord / 5) * 10) / 10;
    }

    return DEFAULT_BASELINE.avgStepsPerMin;
}

/**
 * Calculate and persist the user's activity baseline.
 * Computes resting HR (overnight P10), observed maxHR, and median step rate.
 * Saves to system_config for reuse.
 */
export async function calculateAndPersistBaseline(): Promise<IUserBaseline> {
    await connectToDatabase();

    const [hrData, avgStepsPerMin] = await Promise.all([
        calculateRestingHR(14),
        calculateStepBaseline(14)
    ]);

    const baseline: IUserBaseline = {
        avgStepsPerMin,
        restingHR: hrData.restingHR,
        maxHR: hrData.maxHR,
        overnightHR_p10: hrData.overnightHR_p10,
        lastUpdated: new Date().toISOString()
    };

    // Persist to system_config
    const { SystemConfig } = await import('../db/models');
    await SystemConfig.updateOne(
        { key: BASELINE_CONFIG_KEY },
        { $set: { value: baseline, updated_at: new Date() } },
        { upsert: true }
    );

    console.log(`[baseline] Updated user baseline: restingHR=${baseline.restingHR}, maxHR=${baseline.maxHR}, overnightP10=${baseline.overnightHR_p10}, stepsPerMin=${baseline.avgStepsPerMin}`);

    return baseline;
}

/**
 * Get the user's activity baseline, recalculating if stale (>24h).
 * Returns cached baseline from system_config if fresh enough.
 */
export async function getBaseline(): Promise<IUserBaseline> {
    await connectToDatabase();

    try {
        const { SystemConfig } = await import('../db/models');
        const cached = await SystemConfig.findOne({ key: BASELINE_CONFIG_KEY }).lean();

        if (cached?.value) {
            const baseline = cached.value as IUserBaseline;
            const lastUpdated = new Date(baseline.lastUpdated);
            const ageHours = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);

            if (ageHours < BASELINE_STALE_HOURS) {
                return baseline;
            }
        }
    } catch (error) {
        console.warn('[baseline] Cache read failed:', error);
    }

    // Cache miss or stale — recalculate
    return calculateAndPersistBaseline();
}

/**
 * Calculate Heart Rate Reserve (HRR) — the gold standard for exercise intensity.
 * 
 * HRR = (currentHR - restingHR) / (maxHR - restingHR)
 * 
 * @returns Value between 0 and 1, where:
 *   < 0.30 = Low intensity
 *   0.30 - 0.50 = Moderate (aerobic, glucose-lowering)
 *   0.50 - 0.70 = High (mixed, significant glucose-lowering)
 *   > 0.70 = Very high (anaerobic dominance, potential spike then drop)
 */
export function calculateHRR(currentHR: number, restingHR: number, maxHR: number): number {
    const range = maxHR - restingHR;
    if (range <= 0) return 0;
    return Math.max(0, Math.min(1, (currentHR - restingHR) / range));
}
