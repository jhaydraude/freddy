import { Entry, Treatment, SystemConfig, DeviceStatus } from '../db/models';
import { resolveActiveProfile, getProfileStore, getValueAtTime } from './profile-logic';
import { getBolusAbsorption } from './cob-logic';
import { getActivityHistory } from './activity-logic';
import { calculateActivityImpact, DEFAULT_ACTIVITY_COEFFICIENTS, ActivityCoefficients } from './activity-impact';
import { normalizeISF } from './unit-conversion';

/**
 * Time window for holistic profile analysis
 */
export interface ITimeWindow {
    start: Date;
    end: Date;
    duration_hours: number;

    // Glucose metrics
    glucose_start: number;
    glucose_end: number;
    glucose_change: number;
    glucose_readings_count: number;

    // Insulin metrics
    bolus_insulin: number;           // Raw delivery
    basal_insulin_delivered: number; // Raw delivery
    total_insulin: number;           // Raw delivery
    insulin_activity: number;        // Physiological activity (units absorbed in window)

    // Carb metrics
    carbs_consumed: number;          // Raw total
    carb_events_count: number;
    carb_absorption: number;         // Physiological absorption (grams absorbed in window)

    // Activity metrics
    activity_steps: number;
    activity_calories: number;       // Calories from steps data
    activity_floors: number;         // Stairs from steps data
    activity_heart_rate: number;     // Average HR
    activity_hr_elevation: number;   // Raw HR elevation percentage (0-1+)
    activity_impact: number;         // Calculated glucose impact (mg/dL) in window
    activity_impact_components: {
        steps: number;
        calories: number;
        stairs: number;
        heartRate: number;
        stressHeartRate: number;
    };
    activity_intensity: string;

    // Context
    hour_of_day: number;  // 0-23 for start hour
    is_stable: boolean;   // Glucose relatively flat
    has_meals: boolean;
    has_corrections: boolean;

    // Data Quality
    data_quality: {
        has_activity_data: boolean;
        readings_count: number;
    };

    // Phase classification
    phase_category: 'Fasting' | 'Fed' | 'Active';

    // Accuracy Metrics
    unexplained_residual?: number;  // Actual Change - Predicted Change
    total_predicted_impact?: number;

    // Basal specific
    autosens_ratio?: number;
    basal_drift?: number;
    isolation_confidence?: number;
}


/**
 * Options for generating time windows
 */
export interface ITimeWindowOptions {
    endDate?: Date;         // Default: now
    daysBack?: number;      // Default: 30
    windowHours?: number;   // Default: 2
}

/**
 * Generate time windows for holistic profile analysis.
 * 
 * Divides the time period into fixed windows and calculates
 * all relevant metrics for each window.
 */
export async function generateTimeWindows(
    options: ITimeWindowOptions = {}
): Promise<ITimeWindow[]> {
    const {
        endDate = new Date(),
        daysBack = 30,
        windowHours = 2
    } = options;

    // Calculate start date from end date and days back
    const startDate = new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);

    console.log(`\n📊 Generating ${windowHours}-hour time windows...`);
    console.log(`Period: ${startDate.toISOString()} to ${endDate.toISOString()} (${daysBack} days)`);

    const windows: ITimeWindow[] = [];
    const windowMs = windowHours * 60 * 60 * 1000;

    // === BATCH FETCH ALL DATA ===
    console.log('\n📦 Fetching all data...');

    // We need a larger window for treatments to account for activity tails
    const diaHours = 7; // Safety margin for rapid-acting insulin
    const lookbackHours = 24; // Margin for carbs/basal
    const treatmentsStartDate = new Date(startDate.getTime() - Math.max(diaHours, lookbackHours) * 60 * 60 * 1000);

    const [glucoseEntries, treatments, activityData, sysConfig, statusDocs] = await Promise.all([
        Entry.find({
            type: 'sgv',
            date: {
                $gte: startDate.getTime(),
                $lte: endDate.getTime()
            }
        }).sort({ date: 1 }).lean(),

        Treatment.find({
            created_at: {
                $gte: treatmentsStartDate.toISOString(),
                $lte: endDate.toISOString()
            }
        }).sort({ created_at: 1 }).lean(),

        getActivityHistory(startDate, endDate),

        SystemConfig.findOne({ key: 'smb_threshold' }).lean(),

        DeviceStatus.find({
            "openaps.suggested.sensitivityRatio": { $exists: true },
            created_at: {
                $gte: startDate.toISOString(),
                $lte: endDate.toISOString()
            }
        }).sort({ created_at: 1 }).lean()
    ]);

    console.log(`  Loaded ${glucoseEntries.length} glucose readings`);
    console.log(`  Loaded ${treatments.length} treatments (including tails)`);
    console.log(`  Loaded ${activityData.length} activity points`);

    // === FETCH ACTIVE PROFILE ===
    console.log('  Fetching active profile for basal rates...');
    const profileInfo = await resolveActiveProfile(startDate);
    const profileData = profileInfo?.profileData ||
        (profileInfo?.doc ? getProfileStore(profileInfo.doc, profileInfo.activeProfileName) : null);

    let dia = 5;
    let peak = 45;
    let activityCoefficients: ActivityCoefficients = DEFAULT_ACTIVITY_COEFFICIENTS;

    if (profileData) {
        dia = profileData.dia || 5;
        // Peak heuristic
        const curveType = (profileData as any).curve || 'ultra-rapid';
        peak = curveType === 'rapid-acting' ? 55 : 45;

        // Activity Coefficients
        if (profileData.activity_coefficients) {
            activityCoefficients = {
                STEPS_PER_MINUTE: profileData.activity_coefficients.steps_per_minute ?? DEFAULT_ACTIVITY_COEFFICIENTS.STEPS_PER_MINUTE,
                HR_SPIKE: profileData.activity_coefficients.hr_spike ?? DEFAULT_ACTIVITY_COEFFICIENTS.HR_SPIKE,
                STRESS_HR: profileData.activity_coefficients.stress_hr ?? DEFAULT_ACTIVITY_COEFFICIENTS.STRESS_HR,
                POST_MEAL_MULTIPLIER: profileData.activity_coefficients.post_meal_multiplier ?? DEFAULT_ACTIVITY_COEFFICIENTS.POST_MEAL_MULTIPLIER
            };
        }
    }

    const smbThreshold = sysConfig?.value !== undefined ? Number(sysConfig.value) : 1.0;
    const utcOffset = (profileInfo as any)?.utcOffset !== undefined ? (profileInfo as any).utcOffset : 0;

    // === GENERATE WINDOWS ===
    let currentTime = startDate.getTime();
    const endTime = endDate.getTime();
    let windowCount = 0;

    while (currentTime < endTime) {
        const windowStart = new Date(currentTime);
        const windowEnd = new Date(Math.min(currentTime + windowMs, endTime));

        windowCount++;
        if (windowCount % 24 === 0) {
            console.log(`Processing window ${windowCount}...`);
        }

        try {
            // Find glucose at start and end
            const glucoseAtStart = findClosestGlucose(glucoseEntries, windowStart);
            const glucoseAtEnd = findClosestGlucose(glucoseEntries, windowEnd);

            if (!glucoseAtStart || !glucoseAtEnd) {
                currentTime += windowMs;
                continue; // Skip if no glucose data
            }

            // Calculate Metrics
            let bolusInsulin = 0;
            let smbInsulin = 0;
            let carbsConsumed = 0;
            let carbEvents = 0;
            let hasMeals = false;
            let hasCorrections = false;

            // Activity / Absorption Accumulators
            let insulinActivity = 0;
            let carbAbsorption = 0;

            // 1. Process Raw Totals
            const treatmentsInWindow = treatments.filter(t => {
                const tTime = new Date(t.created_at).getTime();
                return tTime >= windowStart.getTime() && tTime <= windowEnd.getTime();
            });

            for (const t of treatmentsInWindow) {
                if (t.insulin && t.insulin > 0 && (t.eventType === 'Meal Bolus' || t.eventType === 'Correction Bolus')) {
                    if (t.carbs && t.carbs > 0) {
                        bolusInsulin += t.insulin;
                        hasMeals = true;
                    } else if (t.insulin <= smbThreshold) {
                        smbInsulin += t.insulin;
                    } else {
                        bolusInsulin += t.insulin;
                        hasCorrections = true; // large boluses act as corrections
                    }
                }

                if (t.carbs && t.carbs > 0) {
                    carbsConsumed += t.carbs;
                    carbEvents++;
                    hasMeals = true;
                }
            }

            // 2. Calculate Physiological Curves for ALL relevant treatments
            // We look back by DIA for insulin and by max absorption for carbs

            // --- INSULIN ACTIVITY ---
            for (const t of treatments) {
                if (t.insulin && t.insulin > 0 && (t.eventType === 'Meal Bolus' || t.eventType === 'Correction Bolus')) {
                    const tTime = new Date(t.created_at).getTime();
                    insulinActivity += calculateActivityInWindow(t.insulin, tTime, windowStart.getTime(), windowEnd.getTime(), dia, peak);
                }
            }

            // --- CARB ABSORPTION (Using S-Curve Math) ---
            for (const t of treatments) {
                if (t.carbs && t.carbs > 0) {
                    const tTime = new Date(t.created_at).getTime();
                    const duration = t.duration ? t.duration / 60000 : 0;
                    const rate = 30 / 60 * 5; // Base Rate: 30g/hr -> 2.5g/5min

                    carbAbsorption += calculateCarbAbsorptionInWindow(
                        t.carbs,
                        tTime,
                        windowStart.getTime(),
                        windowEnd.getTime(),
                        duration,
                        rate
                    );
                }
            }

            // 3. Basal Contribution
            // Get actual basal rate from profile for this window's time
            const basalRate = profileData?.basal
                ? getValueAtTime(profileData.basal, windowStart)
                : 1.0;
            const scheduledBasal = basalRate * windowHours;
            const basalDeilveredRaw = scheduledBasal + smbInsulin;

            // Simplified Basal Activity implementation: 
            // In a steady state (unchanged basal for > DIA), Activity == Delivery.
            // Note: SMB activity was precisely calculated and added above, so we only add scheduled basal here.
            insulinActivity += scheduledBasal;

            const totalInsulin = bolusInsulin + basalDeilveredRaw;
            const glucoseChange = glucoseAtEnd.sgv - glucoseAtStart.sgv;
            const isStable = Math.abs(glucoseChange) < 20;

            // --- ACTIVITY IMPACT ---
            const windowActivity = activityData.filter(p => {
                const pTime = new Date(p.timestamp).getTime();
                return pTime >= windowStart.getTime() && pTime <= windowEnd.getTime();
            });
            const activityImpact = calculateActivityImpact(windowActivity, windowHours * 60, undefined, activityCoefficients);

            const windowSteps = windowActivity.reduce((sum, p) => sum + (p.steps?.count || 0), 0);

            // Calculate raw HR elevation percentage
            const restingHR = 70; // Default fallback
            const avgHR = activityImpact.components.heartRate || 0;
            const hrElevation = avgHR > 0 ? (avgHR - restingHR) / restingHR : 0;

            const readingCount = glucoseEntries.filter(e => e.date >= windowStart.getTime() && e.date <= windowEnd.getTime()).length;

            // Resolve autosens ratio for this window (find closest devicestatus point prior to start, or default to 1.0)
            let autosensRatio = 1.0;
            const statusMatch = statusDocs.slice().reverse().find(s => new Date(s.created_at).getTime() <= windowStart.getTime());
            if (statusMatch && statusMatch.openaps?.suggested?.sensitivityRatio) {
                autosensRatio = statusMatch.openaps.suggested.sensitivityRatio;
            }

            // Calculate basal drift and isolation confidence
            let basal_drift: number | undefined;
            let isolation_confidence: number | undefined;
            let unexplained_residual: number | undefined;
            let total_predicted_impact: number | undefined;

            if (readingCount >= 6) {
                let isf = profileData?.sens ? getValueAtTime(profileData.sens, windowStart) : 50;
                const icr = profileData?.carbratio ? getValueAtTime(profileData.carbratio, windowStart) : 15;

                isf = normalizeISF(isf, profileData?.units || 'mg/dL');

                // To calculate unexplained residual, we must only look at DEVIATIONS from the steady state.
                // In a steady state, scheduledBasal perfectly counteracts Endogenous Glucose Production (EGP).
                // Therefore, the "insulin force" that changes blood sugar is only the insulin active ABOVE scheduled basal.
                const activeInsulinDevation = insulinActivity - scheduledBasal;

                const insulinImpact = -(activeInsulinDevation * isf * autosensRatio);
                const carbImpact = (carbAbsorption * isf * autosensRatio) / icr;
                const totalImpact = insulinImpact + carbImpact + activityImpact.totalImpact;

                console.log(`[DEBUG] Window ${windowStart.toISOString()}:`);
                console.log(`  ISF: ${isf}, ICR: ${icr}, Autosens: ${autosensRatio}`);
                console.log(`  Insulin Deviation: ${activeInsulinDevation} U (Total: ${insulinActivity}, Basal: ${scheduledBasal}) -> Impact: ${insulinImpact} mg/dL`);
                console.log(`  Carb Absorption: ${carbAbsorption} g -> Impact: ${carbImpact} mg/dL`);
                console.log(`  Total Impact: ${totalImpact} mg/dL, Actual Change: ${glucoseChange} mg/dL`);
                console.log(`  => Unexplained Residual: ${glucoseChange - totalImpact} mg/dL`);

                total_predicted_impact = totalImpact;
                unexplained_residual = glucoseChange - totalImpact;

                // basal_drift for the optimizer is the theoretical required basal equivalent to cover the background drift
                // calculated using the RAW insulin activity (including basal) to determine total background glucose production.
                const totalRawInsulinImpact = -(insulinActivity * isf * autosensRatio);
                basal_drift = glucoseChange - (carbImpact + totalRawInsulinImpact + activityImpact.totalImpact);

                // Threshold for "Impossible" or "Unexplained" residuals (likely sensor error or massive unlogged carbs)
                // 100 mg/dL (5.5 mmol/L) over 2 hours is a massive deviation not attributable to simple parameter mismatch
                if (Math.abs(unexplained_residual) > 150) {
                    console.log(`⚠️ Discarding window at ${windowStart.toISOString()} due to massive unexplained residual: ${Math.round(unexplained_residual)} mg/dL`);
                    const stepMs = (windowMs / 2);
                    currentTime += stepMs;
                    continue;
                }

                basal_drift = glucoseChange - (carbImpact + insulinImpact + activityImpact.totalImpact);

                if (hasMeals || hasCorrections || carbAbsorption > 1.0) {
                    isolation_confidence = 0.0;
                } else {
                    isolation_confidence = 1.0;
                }
            }

            let phaseCategory: 'Fasting' | 'Fed' | 'Active' = 'Fasting';
            if (activityImpact.totalImpact < -5 || (activityImpact.dataAvailable && (windowSteps > 500 || hrElevation > 0.1))) {
                phaseCategory = 'Active';
            } else if (hasMeals || carbAbsorption > 1.0) {
                phaseCategory = 'Fed';
            }

            windows.push({
                start: windowStart,
                end: windowEnd,
                duration_hours: windowHours,

                glucose_start: glucoseAtStart.sgv,
                glucose_end: glucoseAtEnd.sgv,
                glucose_change: glucoseChange,
                glucose_readings_count: readingCount,

                bolus_insulin: bolusInsulin,
                basal_insulin_delivered: basalDeilveredRaw,
                total_insulin: totalInsulin,
                insulin_activity: Math.round(insulinActivity * 1000) / 1000,

                carbs_consumed: carbsConsumed,
                carb_events_count: carbEvents,
                carb_absorption: Math.round(carbAbsorption * 100) / 100,

                // Only report activity metrics if the device was actually collecting data (HR present)
                activity_steps: activityImpact.dataAvailable ? windowSteps : 0,
                activity_calories: 0,
                activity_floors: 0,
                activity_heart_rate: activityImpact.dataAvailable ? avgHR : 0,
                activity_hr_elevation: activityImpact.dataAvailable ? (Math.round(hrElevation * 1000) / 1000) : 0,
                activity_impact: activityImpact.totalImpact,
                activity_impact_components: activityImpact.components,
                activity_intensity: activityImpact.intensity,

                hour_of_day: new Date(windowStart.getTime() + (utcOffset * 60 * 1000)).getUTCHours(),
                is_stable: isStable,
                has_meals: hasMeals,
                has_corrections: hasCorrections,

                data_quality: {
                    has_activity_data: activityImpact.dataAvailable,
                    readings_count: readingCount
                },

                phase_category: phaseCategory,

                autosens_ratio: autosensRatio,
                basal_drift: basal_drift,
                isolation_confidence: isolation_confidence,
                unexplained_residual: unexplained_residual,
                total_predicted_impact: total_predicted_impact
            });

        } catch (error) {
            console.error(`Error processing window starting at ${windowStart.toISOString()}:`, error);
        }

        // Use a 1-hour sliding step instead of a fixed 2-hour jump for 2x coverage
        const stepMs = (windowMs / 2);
        currentTime += stepMs;
    }

    console.log(`\n✅ Generated ${windows.length} time windows`);
    console.log(`  Stable windows: ${windows.filter(w => w.is_stable).length}`);
    console.log(`  Windows with meals: ${windows.filter(w => w.has_meals).length}`);
    console.log(`  Average Activity: ${windows.reduce((sum, w) => sum + w.insulin_activity, 0) / windows.length} U/window\n`);

    return windows;
}

/**
 * Calculates insulin activity absorbed within a specific time window.
 */
function calculateActivityInWindow(
    amount: number,
    eventMs: number,
    windowStartMs: number,
    windowEndMs: number,
    dia: number,
    peak: number
): number {
    const diaMin = dia * 60;
    const tau = peak;

    const activityIntegral = (tMin: number) => {
        if (tMin <= 0) return 0;
        if (tMin >= diaMin) return 1.0;
        // 1 - (1 + t/tau) * exp(-t/tau)
        return 1 - (1 + tMin / tau) * Math.exp(-tMin / tau);
    };

    const normalization = 1 / activityIntegral(diaMin);

    const t1 = Math.max(0, (windowStartMs - eventMs) / 60000);
    const t2 = Math.min(diaMin, (windowEndMs - eventMs) / 60000);

    if (t2 <= t1) return 0;

    const absorbed = (activityIntegral(t2) - activityIntegral(t1)) * normalization;
    return amount * absorbed;
}

/**
 * Calculates carb absorption within a specific time window.
 * Uses cumulative absorbed amount from S-curve model.
 */
function calculateCarbAbsorptionInWindow(
    carbs: number,
    eventMs: number,
    windowStartMs: number,
    windowEndMs: number,
    durationMin: number,
    rateGPer5Min: number
): number {
    const tStartMin = (windowStartMs - eventMs) / 60000;
    const tEndMin = (windowEndMs - eventMs) / 60000;

    // Optimization: If window is entirely before event, result is 0
    if (tEndMin <= 0) return 0;

    // getBolusAbsorption returns { rate, absorbed }
    // We want the cumulative absorbed amount at time t
    const absStart = getBolusAbsorption(tStartMin, carbs, durationMin, rateGPer5Min).absorbed;
    const absEnd = getBolusAbsorption(tEndMin, carbs, durationMin, rateGPer5Min).absorbed;

    return Math.max(0, absEnd - absStart);
}

/**
 * Helper: Find closest glucose reading to a timestamp
 */
function findClosestGlucose(
    glucoseEntries: any[],
    timestamp: Date,
    maxDeltaMinutes: number = 15
): { sgv: number, date: number } | null {
    const targetMs = timestamp.getTime();
    const maxDeltaMs = maxDeltaMinutes * 60 * 1000;

    let closest: any = null;
    let closestDelta = Infinity;

    for (const entry of glucoseEntries) {
        if (!entry.sgv) continue;

        const delta = Math.abs(entry.date - targetMs);
        if (delta < closestDelta && delta <= maxDeltaMs) {
            closestDelta = delta;
            closest = entry;
        }
    }

    return closest ? { sgv: closest.sgv, date: closest.date } : null;
}
