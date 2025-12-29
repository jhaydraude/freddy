import { Entry, Treatment } from '../db/models.js';
import { resolveActiveProfile, getProfileStore, getValueAtTime } from './profile-logic.js';
import { getBolusAbsorption } from './cob-logic.js';

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

    // Context
    hour_of_day: number;  // 0-23 for start hour
    is_stable: boolean;   // Glucose relatively flat
    has_meals: boolean;
    has_corrections: boolean;
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

    const [glucoseEntries, treatments] = await Promise.all([
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
        }).sort({ created_at: 1 }).lean()
    ]);

    console.log(`  Loaded ${glucoseEntries.length} glucose readings`);
    console.log(`  Loaded ${treatments.length} treatments (including tails)`);

    // === FETCH ACTIVE PROFILE ===
    console.log('  Fetching active profile for basal rates...');
    const profileInfo = await resolveActiveProfile(startDate);
    const profileData = profileInfo?.profileData ||
        (profileInfo?.doc ? getProfileStore(profileInfo.doc, profileInfo.activeProfileName) : null);

    let dia = 5;
    let peak = 45;
    if (profileData) {
        dia = profileData.dia || 5;
        // Peak heuristic
        const curveType = (profileData as any).curve || 'ultra-rapid';
        peak = curveType === 'rapid-acting' ? 55 : 45;
    }

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
                    bolusInsulin += t.insulin;
                    if (t.carbs && t.carbs > 0) hasMeals = true;
                    else hasCorrections = true;
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
            const basalDeilveredRaw = basalRate * windowHours;

            // Simplified Basal Activity implementation: 
            // In a steady state (unchanged basal for > DIA), Activity == Delivery.
            insulinActivity += basalDeilveredRaw;

            const totalInsulin = bolusInsulin + basalDeilveredRaw;
            const glucoseChange = glucoseAtEnd.sgv - glucoseAtStart.sgv;
            const isStable = Math.abs(glucoseChange) < 20;

            windows.push({
                start: windowStart,
                end: windowEnd,
                duration_hours: windowHours,

                glucose_start: glucoseAtStart.sgv,
                glucose_end: glucoseAtEnd.sgv,
                glucose_change: glucoseChange,
                glucose_readings_count: glucoseEntries.filter(e => e.date >= windowStart.getTime() && e.date <= windowEnd.getTime()).length,

                bolus_insulin: bolusInsulin,
                basal_insulin_delivered: basalDeilveredRaw,
                total_insulin: totalInsulin,
                insulin_activity: Math.round(insulinActivity * 1000) / 1000,

                carbs_consumed: carbsConsumed,
                carb_events_count: carbEvents,
                carb_absorption: Math.round(carbAbsorption * 100) / 100,

                hour_of_day: windowStart.getHours(),
                is_stable: isStable,
                has_meals: hasMeals,
                has_corrections: hasCorrections
            });

        } catch (error) {
            console.error(`Error processing window starting at ${windowStart.toISOString()}:`, error);
        }

        currentTime += windowMs;
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
