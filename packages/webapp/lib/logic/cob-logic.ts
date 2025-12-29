import { Treatment, Entry, DeviceStatus } from '../db/models.js';
import { resolveActiveProfile, getProfileStore, getValueAtTime } from './profile-logic.js';
import { getIOB, calculateInsulinActivityRate } from './iob-logic.js';
import { ICOBResult } from './types.js';

/** Result for a single carb event's absorption curve */
export interface ICarbEventCurve {
    carbEventTime: Date;
    initialCarbs: number;
    cobAtInterval: number[];
    carbAbsorptionAtInterval: number[];
    nowIndex: number;
}

/** Constants */
const DEFAULT_ABSORPTION_RATE_G_PER_HOUR = 30;
const INTERVAL_MINUTES = 5;
const MAX_LOOKBACK_HOURS = 12; // Extended lookback window for long distributed meals

/**
 * Calculates the minimum absorption rate (g/5min) based on settings.
 */
export function calculateMinAbsorptionRate(isf: number, cr: number, minCarbImpact: number, units: string = 'mg/dL'): number {
    if (!isf || !cr || isf <= 0 || cr <= 0) {
        return (DEFAULT_ABSORPTION_RATE_G_PER_HOUR / 60) * INTERVAL_MINUTES;
    }
    let isfMgdl = isf;
    if (units.toLowerCase().includes('mmol')) {
        isfMgdl = isf * 18.01559;
    }
    const sensitivity = isfMgdl / cr;
    if (sensitivity <= 0) return (DEFAULT_ABSORPTION_RATE_G_PER_HOUR / 60) * INTERVAL_MINUTES;
    return minCarbImpact / sensitivity;
}

/**
 * MATH ENGINE: TRIANGLE S-CURVE PARAMETERS
 */
function getTriangleParameters(carbs: number, absorbRateGPer5Min: number) {
    const linearDurationMin = (carbs / absorbRateGPer5Min) * 5;
    // Faster absorption: Reduce duration multiplier from 1.5 to 1.2
    const durationMin = Math.max(60, linearDurationMin * 1.2);
    // Move peak earlier: Shift from 0.3 to 0.25
    const peakTimeMin = Math.max(15, durationMin * 0.25);
    return { durationMin, peakTimeMin };
}

/**
 * MATH ENGINE: INSTANT BOLUS DYNAMICS
 */
function getInstantBolusDynamics(t_min: number, carbs: number, durationMin: number, peakTimeMin: number): { rate: number, absorbed: number } {
    if (t_min < 0) return { rate: 0, absorbed: 0 };
    if (t_min >= durationMin) return { rate: 0, absorbed: carbs };

    const peakRate = (2 * carbs) / durationMin;
    let rate = 0;
    let absorbed = 0;

    if (t_min < peakTimeMin) {
        // Ramp up
        rate = peakRate * (t_min / peakTimeMin);
        absorbed = 0.5 * t_min * rate;
    } else {
        // Decay
        const timeInDecay = t_min - peakTimeMin;
        const decayDuration = durationMin - peakTimeMin;
        rate = peakRate * ((durationMin - t_min) / decayDuration);

        const absorbedAtPeak = 0.5 * peakTimeMin * peakRate;
        const areaDecay = (peakRate + rate) * timeInDecay / 2;
        absorbed = absorbedAtPeak + areaDecay;
    }
    return { rate, absorbed };
}

/**
 * MATH ENGINE: GENERAL BOLUS ABSORPTION (Supports Distributed/Extended)
 */
export function getBolusAbsorption(t_min: number, carbs: number, distributionDurationMin: number, absorbRate: number): { rate: number, absorbed: number } {
    // If instant (or near instant), use analytic function
    if (!distributionDurationMin || distributionDurationMin < 5) {
        const params = getTriangleParameters(carbs, absorbRate);
        const res = getInstantBolusDynamics(t_min, carbs, params.durationMin, params.peakTimeMin);
        // Rate from dynamics is g/min. We want g/5min.
        return { rate: res.rate * 5, absorbed: res.absorbed };
    }

    // Distributed: Numerical Superposition
    const steps = Math.floor(distributionDurationMin); // 1 step per minute
    const stepSize = 1;
    const carbsPerStep = carbs / steps;
    const kernelParams = getTriangleParameters(carbs, absorbRate);

    let totalRate = 0; // g/min
    let totalAbsorbed = 0;

    for (let i = 0; i < steps; i++) {
        const entryTime = i * stepSize;
        if (t_min >= entryTime) {
            const dynamics = getInstantBolusDynamics(
                t_min - entryTime,
                carbsPerStep,
                kernelParams.durationMin,
                kernelParams.peakTimeMin
            );
            totalRate += dynamics.rate;
            totalAbsorbed += dynamics.absorbed;
        }
    }

    return { rate: totalRate * 5, absorbed: totalAbsorbed };
}


/**
 * Analyses recent glucose/insulin data to estimate actual carb absorption.
 */
async function calculateDynamicAbsorption(
    timestamp: Date,
    isf: number,
    cr: number,
    units: string
): Promise<{ deviation: number, estimatedCarbs: number }> {
    const windowStart = new Date(timestamp.getTime() - 20 * 60 * 1000);
    const minEpoch = windowStart.getTime();

    const entries = await Entry.find({
        date: { $gte: minEpoch, $lte: timestamp.getTime() },
        sgv: { $exists: true }
    }).sort({ date: -1 }).limit(2).lean();

    if (entries.length < 2) return { deviation: 0, estimatedCarbs: 0 };

    const curr = entries[0]!;
    const prev = entries[1]!;
    const timeDiff = (curr.date - prev.date) / (1000 * 60);

    if (timeDiff < 3 || timeDiff > 12) return { deviation: 0, estimatedCarbs: 0 };

    const delta = curr.sgv - prev.sgv;

    let dia = 5;
    const profile = await resolveActiveProfile(timestamp);
    if (profile) {
        const store = getProfileStore(profile.doc || undefined, profile.activeProfileName, profile.profileData || undefined);
        if (store) dia = store.dia;
    }

    const activity = await calculateInsulinActivityRate(timestamp, dia);
    const expectedDrop = activity * isf;
    const deviation = delta + expectedDrop;

    const sensitivity = isf / cr;
    let estimatedCarbs = 0;
    if (deviation > 0 && sensitivity > 0) {
        estimatedCarbs = deviation / sensitivity;
    }

    return { deviation, estimatedCarbs };
}


/**
 * Calculates COB at a specific time (Snapshot).
 */
export function calculateCOB(treatments: any[], atTime: Date, isf: number, cr: number, absorptionRate?: number): {
    cob: number;
    pendingCOB: number;
    activeCOB: number;
    glucoseImpact: number;
    eventCount: number;
    avgEventSize: number;
    observedDeviation: number;
    estimatedAbsorption: number;
} {
    let totalCOB = 0;
    let pendingCOB = 0;
    let activeCOB = 0;
    let totalCarbAbsorption = 0; // g/5min

    const atTimeMs = atTime.getTime();
    const rate = absorptionRate || calculateMinAbsorptionRate(isf, cr, 8); // Default fallback

    for (const t of treatments) {
        if (!t.carbs) continue;

        const eventTime = new Date(t.created_at).getTime();
        const duration = t.duration ? t.duration / (1000 * 60) : 0; // min
        const timeSinceEventMin = (atTimeMs - eventTime) / (1000 * 60);

        // Get absorption status
        const abs = getBolusAbsorption(timeSinceEventMin, t.carbs, duration, rate);

        const remaining = Math.max(0, t.carbs - abs.absorbed);

        totalCOB += remaining;
        totalCarbAbsorption += abs.rate;

        // Pending vs Active Logic for S-Curve/Distributed:
        // "Pending" = The part of the distributed meal that hasn't even entered the system?
        // In the virtual packet model, pending was "future packets".
        // In the integral model, "Pending" is simply (TotalCarbs * Fraction_Time_Remaining_in_Distribution)?
        // 
        // Let's define:
        // Active COB = Carbs that have "entered" the absorption buffer but not yet cleared.
        // Pending COB = Carbs waiting to "enter" (i.e., remaining duration of the meal entry).
        // 
        // If duration=0 (instant), Pending is always 0.
        // If duration=60, and t=30. Half the meal has "entered".
        // So Pending = Carbs * (1 - t/Duration) (clamped).

        let pending = 0;
        if (duration > 0 && timeSinceEventMin < duration) {
            // Linearly remaining portion of the meal
            // If t < 0 (future meal), pending = carbs.
            if (timeSinceEventMin < 0) pending = t.carbs;
            else pending = t.carbs * (1 - timeSinceEventMin / duration);
        } else if (duration > 0 && timeSinceEventMin < 0) {
            pending = t.carbs;
        }

        // Active = TotalRemaining - Pending
        // (Because TotalCOB is the physically remaining unabsorbed carbs. Some are in stomach (pending), some in gut (active)?)
        // Actually, normally COB implies anything in the body.
        // But for display "Pending" is useful.

        const active = Math.max(0, remaining - pending);

        pendingCOB += pending;
        activeCOB += active;
    }

    const glucoseImpact = totalCarbAbsorption * (isf / cr);

    const eventCount = treatments.length;
    const avgEventSize = eventCount > 0
        ? treatments.reduce((a, b) => a + b.carbs, 0) / eventCount
        : 0;

    return {
        cob: Math.round(totalCOB * 10) / 10,
        pendingCOB: Math.round(pendingCOB * 10) / 10,
        activeCOB: Math.round(activeCOB * 10) / 10,
        glucoseImpact: Math.round(glucoseImpact * 100) / 100,
        eventCount,
        avgEventSize: Math.round(avgEventSize * 10) / 10,
        observedDeviation: 0, // Filled by caller via dynamic
        estimatedAbsorption: 0 // Filled by caller
    };
}


/**
 * Main Service: Get COB + Timeseries
 */
export async function getCOB(timestamp: string | Date, includeTimeseries: boolean = true): Promise<ICOBResult> {
    const date = new Date(timestamp);
    const lookbackMs = MAX_LOOKBACK_HOURS * 60 * 60 * 1000;

    const profileInfo = await resolveActiveProfile(date);
    let isf = 50;
    let cr = 10;
    let units = 'mg/dL';
    let minCarbImpact = 8;

    const configDoc = await DeviceStatus.findOne({
        "configuration.sensitivityConfiguration.openaps_smb_min_5m_carbimpact": { $exists: true },
        "created_at": { $lte: date.toISOString() }
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

    // Extended lookback query
    // We fetch a wide window to account for long durations
    // Start lookback = MAX_LOOKBACK (12h)
    const treatments = await Treatment.find({
        eventType: { $in: ['Meal Bolus', 'Carb Correction'] },
        carbs: { $exists: true, $gt: 0 },
        created_at: {
            $lte: date.toISOString(),
            $gte: new Date(date.getTime() - lookbackMs).toISOString()
        }
    });

    // Use consistent absorption rate based on profile settings
    // Note: Dynamic absorption adjustment removed to prevent COB oscillations
    // The rate was varying wildly (e.g., 13.393 → 1.717 → 0.463 g/5min) based on
    // momentary glucose trends, causing absorption curves to recalculate inconsistently
    const absorptionRate = calculateMinAbsorptionRate(isf, cr, minCarbImpact, units);

    const baseResult = calculateCOB(treatments, date, isf, cr, absorptionRate);


    // Get Reported COB
    const latestStatus = await DeviceStatus.findOne({
        "openaps.suggested": { $exists: true },
        "created_at": { $lte: date.toISOString() }
    }).sort({ created_at: -1 });
    const reportedCOB = latestStatus?.openaps?.suggested?.COB || 0;
    const reportedTime = latestStatus?.created_at || '';

    const result: ICOBResult = {
        timestamp: date.toISOString(),
        units,
        lookbackMinutes: MAX_LOOKBACK_HOURS * 60,
        settings: {
            isf, cr, minCarbImpact, absorptionRate
        },
        calculated: {
            ...baseResult,
            observedDeviation: 0,  // Dynamic absorption removed for consistency
            estimatedAbsorption: 0 // Dynamic absorption removed for consistency
        },
        reported: {
            cob: reportedCOB,
            timestamp: reportedTime
        }
    };

    if (includeTimeseries) {
        // Generate Timeseries (Past + Future)
        // From -4h to +6h?
        // Let's align with the dashboard window usually requested, or standard prediction (4h).
        // Let's do -4h to +4h.
        const pastMinutes = 240;
        const futureMinutes = 240;

        const data = [];

        // Optimize: Pre-calculate per-treatment parameters? 
        // getBolusAbsorption does that internally. 
        // We'll iterate time t, and inside iterate treatments.

        const startTime = date.getTime() - pastMinutes * 60000;
        const endTime = date.getTime() + futureMinutes * 60000;

        for (let t = startTime; t <= endTime; t += INTERVAL_MINUTES * 60000) {
            const timeDate = new Date(t);
            // This is "calculateCOB" for this specific time slice
            // but simplified locally for speed/structure
            let totalCOB = 0;
            let totalAbs = 0;
            let pendingCOB = 0;
            let activeCOB = 0;

            for (const treat of treatments) {
                const tEvent = new Date(treat.created_at).getTime();
                const duration = treat.duration ? treat.duration / 60000 : 0;
                const dtMin = (t - tEvent) / 60000;

                const res = getBolusAbsorption(dtMin, treat.carbs, duration, absorptionRate);
                const remaining = Math.max(0, treat.carbs - res.absorbed);

                totalCOB += remaining;
                totalAbs += res.rate;

                // Pending logic
                let pending = 0;
                if (duration > 0 && dtMin < duration) {
                    if (dtMin < 0) pending = treat.carbs;
                    else pending = treat.carbs * (1 - dtMin / duration);
                } else if (duration > 0 && dtMin < 0) {
                    pending = treat.carbs;
                }
                const active = Math.max(0, remaining - pending);

                pendingCOB += pending;
                activeCOB += active;
            }

            data.push({
                timestamp: timeDate.toISOString(),
                cob: Math.round(totalCOB * 10) / 10,
                pendingCOB: Math.round(pendingCOB * 10) / 10,
                activeCOB: Math.round(activeCOB * 10) / 10,
                absorption: Math.round(totalAbs * 100) / 100,
                glucoseImpact: Math.round((totalAbs * (isf / cr)) * 100) / 100
            });
        }

        result.timeseries = {
            intervalMinutes: INTERVAL_MINUTES,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            length: data.length,
            nowIndex: Math.floor(pastMinutes / INTERVAL_MINUTES),
            data
        };
    }

    return result;
}
