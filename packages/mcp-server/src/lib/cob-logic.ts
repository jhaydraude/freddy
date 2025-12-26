import { Treatment, Entry, DeviceStatus } from '../db/models.js';
import { resolveActiveProfile, getProfileStore, getValueAtTime } from './profile-logic.js';
import { getIOB, calculateInsulinActivityRate } from './iob-logic.js';

/** Result for a single carb event's absorption curve */
export interface ICarbEventCurve {
    carbEventTime: Date;      // When the carb event occurred
    initialCarbs: number;     // Original carb amount
    cobAtInterval: number[];  // COB at each 5-min interval (index 0 = target time)
    carbAbsorptionAtInterval: number[]; // Carbs absorbing (g/5min) at each interval
    nowIndex: number;          // Index in array that represents "target time" (NOW)
}

/** Extended COB result with detailed metrics */
export interface ICOBResult {
    timestamp: string;
    units: string;
    lookbackMinutes: number;

    settings: {
        isf: number;
        cr: number;
        minCarbImpact: number;
        absorptionRate?: number;
    };

    calculated: {
        cob: number;
        glucoseImpact: number;
        eventCount: number;
        avgEventSize: number;
        observedDeviation: number;
        estimatedAbsorption: number;
    };

    reported: {
        cob: number;
        timestamp: string;
    };

    // Optional timeseries data
    timeseries?: {
        intervalMinutes: 5;
        startTime: string;            // MAX_LOOKBACK_HOURS ago (4 hours)
        endTime: string;              // Current timestamp
        length: number;               // Array length

        timestamps: string[];         // ISO timestamps [oldest → newest]
        totalCOB: number[];           // Total COB at each interval
        carbAbsorption: number[];     // Carbs absorbed in NEXT 5 min (g/5min)
        glucoseImpact: number[];      // Expected BG rise (absorption × ISF/CR)
    };
}

/** Constants for carb absorption calculation */
const DEFAULT_ABSORPTION_RATE_G_PER_HOUR = 30; // Fallback linear absorption rate
const INTERVAL_MINUTES = 5;
const MAX_LOOKBACK_HOURS = 4; // Maximum time to look back (120g @ 30g/hr = 4hrs)

/**
 * Calculates the minimum absorption rate (g/5min) based on settings.
 * Rate = min_5m_carbimpact / (ISF / CR)
 * 
 * @param isf - Insulin Sensitivity Factor (mg/dL/U)
 * @param cr - Carb Ratio (g/U)
 * @param minCarbImpact - Minimum carb impact (mg/dL/5min)
 * @returns Rate in grams per 5 minutes
 */
export function calculateMinAbsorptionRate(isf: number, cr: number, minCarbImpact: number, units: string = 'mg/dL'): number {
    if (!isf || !cr || isf <= 0 || cr <= 0) {
        return (DEFAULT_ABSORPTION_RATE_G_PER_HOUR / 60) * INTERVAL_MINUTES;
    }
    // Normalize ISF to mg/dL for calculation because minCarbImpact is typically mg/dL
    let isfMgdl = isf;
    if (units.toLowerCase().includes('mmol')) {
        isfMgdl = isf * 18.01559;
    }

    const sensitivity = isfMgdl / cr; // Rise (mg/dL) per gram
    if (sensitivity <= 0) return (DEFAULT_ABSORPTION_RATE_G_PER_HOUR / 60) * INTERVAL_MINUTES;

    // grams = impact / sensitivity
    const rate = minCarbImpact / sensitivity;
    return rate;
}

/**
 * Calculates the absorption curve for a single carb event.
 * Creates arrays indexed at 5-minute intervals with COB and carb absorption rate.
 * 
 * @param initialCarbs - The initial carbs in grams
 * @param eventTime - When the carb event occurred
 * @param targetTime - The time to calculate from (this becomes the "now" point)
 * @param absorptionRate - Absorption rate in grams per 5 minutes (optional)
 * @param includeFuture - If true, also calculate into the future until COB is 0
 * @returns Curve with COB and carb absorption at each 5-min interval, and the index of "now"
 */
export function calculateCarbEventCurve(
    initialCarbs: number,
    eventTime: Date,
    targetTime: Date,
    absorptionRate?: number,
    includeFuture: boolean = false
): ICarbEventCurve {
    const targetMs = targetTime.getTime();
    const eventMs = eventTime.getTime();

    // Absorption per 5-minute interval
    const defaultRate = (DEFAULT_ABSORPTION_RATE_G_PER_HOUR / 60) * INTERVAL_MINUTES;
    const rate = absorptionRate && absorptionRate > 0 ? absorptionRate : defaultRate;

    // Time needed to fully absorb this carb event
    const totalAbsorptionMinutes = (initialCarbs / rate) * INTERVAL_MINUTES;
    const numIntervalsPast = Math.ceil((MAX_LOOKBACK_HOURS * 60) / INTERVAL_MINUTES) + 1;
    const numIntervalsFuture = includeFuture ? Math.ceil(totalAbsorptionMinutes / INTERVAL_MINUTES) : 0;

    const cobAtInterval: number[] = [];
    const carbAbsorptionAtInterval: number[] = [];

    // Build array from oldest (past) to newest (future)
    // Negative offset = past, positive offset = future
    for (let offset = -(numIntervalsPast - 1); offset <= numIntervalsFuture; offset++) {
        const intervalTargetMs = targetMs + (offset * INTERVAL_MINUTES * 60 * 1000);
        const ageMinutes = (intervalTargetMs - eventMs) / (1000 * 60);

        if (ageMinutes < 0) {
            // Carb event hasn't occurred yet at this interval
            cobAtInterval.push(0);
            carbAbsorptionAtInterval.push(0);
        } else {
            // Calculate absorbed carbs using linear model
            const intervalsPassed = ageMinutes / INTERVAL_MINUTES;
            const carbsAbsorbed = Math.min(initialCarbs, intervalsPassed * rate);
            const remaining = Math.max(0, initialCarbs - carbsAbsorbed);
            cobAtInterval.push(Math.round(remaining * 100) / 100);

            // Carb absorption: rate of absorption (g/5min) if still absorbing
            const isAbsorbing = remaining > 0;
            const absorption = isAbsorbing ? Math.min(rate, remaining) : 0;
            carbAbsorptionAtInterval.push(Math.round(absorption * 100) / 100);
        }
    }

    // The "now" index is where offset=0, which is at position (numIntervalsPast - 1)
    const nowIndex = numIntervalsPast - 1;

    return {
        carbEventTime: eventTime,
        initialCarbs,
        cobAtInterval,
        carbAbsorptionAtInterval,
        nowIndex
    };
}

/**
 * Analyses recent glucose/insulin data to estimate actual carb absorption.
 * Returns { deviation, estimatedCarbs } for the most recent interval.
 */
async function calculateDynamicAbsorption(
    timestamp: Date,
    isf: number,
    cr: number,
    units: string
): Promise<{ deviation: number, estimatedCarbs: number }> {
    // 1. Fetch last 2 glucose entries (to get delta)
    // We look back 20 mins to find a pair
    const windowStart = new Date(timestamp.getTime() - 20 * 60 * 1000);
    const minEpoch = windowStart.getTime();

    const entries = await Entry.find({
        date: { $gte: minEpoch, $lte: timestamp.getTime() },
        sgv: { $exists: true }
    }).sort({ date: -1 }).limit(2).lean();

    if (entries.length < 2) {
        return { deviation: 0, estimatedCarbs: 0 };
    }

    const curr = entries[0]!;
    const prev = entries[1]!;

    // Time diff in minutes
    const timeDiff = (curr.date - prev.date) / (1000 * 60);
    if (timeDiff < 3 || timeDiff > 12) {
        // Gap too large or small for reliable 5-min calc
        return { deviation: 0, estimatedCarbs: 0 };
    }

    const delta = curr.sgv - prev.sgv;

    // 2. Get Insulin Activity
    // Note: getProfileStore/resolveActiveProfile logic requires IOB, but we have ISF/CR passed in.
    // We need IOB activity rate. We'll use default DIA if not easily available, or fetch.
    // Since this is called from getCOB which resolved profile, we could pass DIA. 
    // For now, let's fetch profile inside IOB logic or reuse what we have. 
    // calculateInsulinActivityRate takes (timestamp, dia).
    // Let's resolve DIA again properly or default to 5h.
    let dia = 5;
    const profile = await resolveActiveProfile(timestamp);
    if (profile) {
        const store = getProfileStore(profile.doc || undefined, profile.activeProfileName, profile.profileData || undefined);
        if (store) dia = store.dia;
    }

    // Activity = units absorbing in next 5 min.
    // We want units absorged in LAST 5 min (approx same as next).
    const activity = await calculateInsulinActivityRate(timestamp, dia);

    // BGI = Activity * ISF (expected drop)
    // Actually activity is positive, so impact is Drop.
    // Glucose Impact (drop) = activity * ISF
    const expectedDrop = activity * isf;

    // Deviation = Actual Delta - (-Expected Drop) ??
    // If Insulin expects -5, and we got +5. Dev = 5 - (-5) = 10.
    // Deviation = Delta + ExpectedDrop
    const deviation = delta + expectedDrop;

    // Est Carbs = Deviation / (ISF / CR)
    // Sensitivity = Rise per gram
    const sensitivity = isf / cr;
    let estimatedCarbs = 0;

    if (deviation > 0 && sensitivity > 0) {
        estimatedCarbs = deviation / sensitivity;
    }

    return { deviation, estimatedCarbs };
}

/**
 * Calculates COB at a specific time by summing individual carb event curves.
 * For a set of carb treatments, creates absorption curves and sums them.
 * 
 * @param treatments - Array of carb treatments with carbs and created_at
 * @param atTime - The target time for COB calculation
 * @param isf - Insulin sensitivity factor (in user's preferred units)
 * @param cr - Carb ratio (grams per unit)
 * @param absorptionRate - Optional absorption rate (g/5min)
 * @returns Object containing calculated COB, glucose impact, event count, and avg size
 */
export function calculateCOB(treatments: any[], atTime: Date, isf: number, cr: number, absorptionRate?: number): {
    cob: number;
    glucoseImpact: number;
    eventCount: number;
    avgEventSize: number;
    relevantTreatments: any[];
} {
    const curves: ICarbEventCurve[] = [];
    const relevantTreatments: any[] = [];

    for (const t of treatments) {
        if (!t.carbs || t.carbs <= 0) continue;

        const eventTime = new Date(t.created_at);
        const curve = calculateCarbEventCurve(t.carbs, eventTime, atTime, absorptionRate);
        curves.push(curve);

        // Track events that still have COB at target time (index 0)
        if (curve.cobAtInterval[0] && curve.cobAtInterval[0] > 0) {
            relevantTreatments.push(t);
        }
    }

    // Sum all curves at index 0 (target time)
    let totalCOB = 0;
    let totalCarbAbsorption = 0;

    for (const curve of curves) {
        totalCOB += curve.cobAtInterval[0] || 0;
        totalCarbAbsorption += curve.carbAbsorptionAtInterval[0] || 0;
    }

    // Calculate glucose impact: carbAbsorption * (ISF / CR)
    // ISF is already in user's preferred units, CR = grams per unit
    // Result: glucose units per 5 minutes
    const glucoseImpact = totalCarbAbsorption * (isf / cr);

    const eventCount = relevantTreatments.length;
    const avgEventSize = eventCount > 0
        ? relevantTreatments.reduce((a, b) => a + b.carbs, 0) / eventCount
        : 0;

    return {
        cob: Math.round(totalCOB * 10) / 10,
        glucoseImpact: Math.round(glucoseImpact * 100) / 100,
        eventCount,
        avgEventSize: Math.round(avgEventSize * 10) / 10,
        relevantTreatments // Return relevant treatments for avgEventSize calculation in getCOB
    };
}

/**
 * Service to get detailed COB at a specific time.
 * Fetches carb treatments and calculates COB with glucose impact from profile.
 * 
 * @param timestamp - ISO timestamp or Date (defaults to now)
 * @param includeTimeseries - If true, include historical timeseries arrays
 * @returns Detailed COB result with cob, glucose impact, event count, and avg size
 */
export async function getCOB(timestamp: string | Date, includeTimeseries: boolean = true): Promise<ICOBResult> {
    const date = new Date(timestamp);
    const lookbackMs = MAX_LOOKBACK_HOURS * 60 * 60 * 1000;

    // Fetch profile to get ISF, CR, and units
    const profileInfo = await resolveActiveProfile(date);
    let isf = 50;  // Default ISF (mg/dL)
    let cr = 10;   // Default CR
    let units = 'mg/dL'; // Default units
    let minCarbImpact = 8; // Default floor (mg/dL/5min)

    // Lookup min_5m_carbimpact from devicestatus config
    const configDoc = await DeviceStatus.findOne({
        "configuration.sensitivityConfiguration.openaps_smb_min_5m_carbimpact": { $exists: true }
    }).sort({ created_at: -1 });

    if (configDoc?.configuration?.sensitivityConfiguration?.openaps_smb_min_5m_carbimpact) {
        minCarbImpact = configDoc.configuration.sensitivityConfiguration.openaps_smb_min_5m_carbimpact;
    }

    if (profileInfo) {
        const store = getProfileStore(
            profileInfo.doc || undefined,
            profileInfo.activeProfileName,
            profileInfo.profileData || undefined
        );
        if (store) {
            isf = getValueAtTime(store.sens, date);
            cr = getValueAtTime(store.carbratio, date);
            units = store.units || 'mg/dL';
        }
    }

    // Fetch treatments with carbs in the lookback window
    const treatments = await Treatment.find({
        eventType: { $in: ['Meal Bolus', 'Carb Correction'] },
        carbs: { $exists: true, $gt: 0 },
        created_at: {
            $lte: date.toISOString(),
            $gte: new Date(date.getTime() - lookbackMs).toISOString()
        }
    });

    // Calculate dynamic rate from settings
    const absorptionRate = calculateMinAbsorptionRate(isf, cr, minCarbImpact, units);

    const baseResult = calculateCOB(treatments, date, isf, cr, absorptionRate);

    // Calculate dynamic absorption
    const dyn = await calculateDynamicAbsorption(date, isf, cr, units);

    // Get Reported COB (Latest DeviceStatus)
    const latestStatus = await DeviceStatus.findOne({
        "openaps.suggested": { $exists: true }
    }).sort({ created_at: -1 });

    const reportedCOB = latestStatus?.openaps?.suggested?.COB || 0;
    const reportedTime = latestStatus?.created_at || '';

    const result: ICOBResult = {
        timestamp: date.toISOString(),
        units,
        lookbackMinutes: MAX_LOOKBACK_HOURS * 60,

        settings: {
            isf: Math.round(isf * 100) / 100,
            cr: Math.round(cr * 100) / 100,
            minCarbImpact,
            absorptionRate: Math.round(absorptionRate * 100) / 100 // g/5min
        },

        calculated: {
            cob: baseResult.cob,
            glucoseImpact: baseResult.glucoseImpact,
            eventCount: baseResult.eventCount,
            avgEventSize: baseResult.avgEventSize,
            observedDeviation: Math.round(dyn.deviation * 10) / 10,
            estimatedAbsorption: Math.round(dyn.estimatedCarbs * 10) / 10
        },

        reported: {
            cob: reportedCOB,
            timestamp: reportedTime
        }
    };

    // Build timeseries if requested (NOW WITH FUTURE PROJECTION!)
    if (includeTimeseries) {
        const numIntervalsPast = Math.ceil((MAX_LOOKBACK_HOURS * 60) / INTERVAL_MINUTES) + 1;
        const timestamps: string[] = [];
        const totalCOBArray: number[] = [];
        const carbAbsorptionArray: number[] = [];
        const glucoseImpactArray: number[] = [];

        // Create curves ONCE for all treatments with future projection
        const curves: ICarbEventCurve[] = [];
        for (const t of treatments) {
            if (!t.carbs || t.carbs <= 0) continue;
            const eventTime = new Date(t.created_at);
            const curve = calculateCarbEventCurve(t.carbs, eventTime, date, absorptionRate, true);
            curves.push(curve);
        }

        // Get the nowIndex from any curve (they all have the same structure)
        const nowIndex = curves.length > 0 ? curves[0].nowIndex : numIntervalsPast - 1;

        // Calculate how far into the future we need to go (until all carbs are absorbed)
        let maxFutureIndex = nowIndex;
        for (const curve of curves) {
            maxFutureIndex = Math.max(maxFutureIndex, curve.cobAtInterval.length - 1);
        }
        const totalIntervals = maxFutureIndex + 1;

        // Build arrays from oldest (past) to newest (future)
        for (let arrayIdx = 0; arrayIdx < totalIntervals; arrayIdx++) {
            // Convert arrayIdx to time offset from "now"
            const offsetFromNow = arrayIdx - nowIndex;
            const intervalTime = new Date(date.getTime() + (offsetFromNow * INTERVAL_MINUTES * 60 * 1000));
            timestamps.push(intervalTime.toISOString());

            // Sum COB from all curves at this interval index
            let totalCOBAtInterval = 0;
            let totalAbsorptionAtInterval = 0;

            for (const curve of curves) {
                totalCOBAtInterval += curve.cobAtInterval[arrayIdx] || 0;
                totalAbsorptionAtInterval += curve.carbAbsorptionAtInterval[arrayIdx] || 0;
            }

            totalCOBArray.push(Math.round(totalCOBAtInterval * 10) / 10);
            carbAbsorptionArray.push(Math.round(totalAbsorptionAtInterval * 100) / 100);

            const glucoseImpactAtInterval = totalAbsorptionAtInterval * (isf / cr);
            glucoseImpactArray.push(Math.round(glucoseImpactAtInterval * 100) / 100);
        }

        result.timeseries = {
            intervalMinutes: 5,
            startTime: timestamps[0] || date.toISOString(),
            endTime: timestamps[timestamps.length - 1] || date.toISOString(),
            length: timestamps.length,
            timestamps,
            totalCOB: totalCOBArray,
            carbAbsorption: carbAbsorptionArray,
            glucoseImpact: glucoseImpactArray
        };
    }

    return result;
}
