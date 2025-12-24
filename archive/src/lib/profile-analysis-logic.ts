import { Entry, Treatment } from '../db/models.js';
import { resolveActiveProfile, getProfileStore, getValueAtTime } from './profile-logic.js';

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

    // Insulin delivered
    bolus_insulin: number;
    basal_insulin_delivered: number;
    total_insulin: number;

    // Carbs consumed
    carbs_consumed: number;
    carb_events_count: number;

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
                $gte: startDate.toISOString(),
                $lte: endDate.toISOString()
            }
        }).sort({ created_at: 1 }).lean()
    ]);

    console.log(`  Loaded ${glucoseEntries.length} glucose readings`);
    console.log(`  Loaded ${treatments.length} treatments`);

    // === FETCH ACTIVE PROFILE ===
    console.log('  Fetching active profile for basal rates...');
    const profileInfo = await resolveActiveProfile(startDate);
    const profileData = profileInfo?.profileData ||
        (profileInfo?.doc ? getProfileStore(profileInfo.doc, profileInfo.activeProfileName) : null);

    if (!profileData?.basal) {
        console.warn('  ⚠️  No basal schedule found, using default 1.0 U/hr');
    } else {
        console.log(`  Loaded basal schedule with ${profileData.basal.length} entries\n`);
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

            // Count glucose readings in window
            const glucoseInWindow = glucoseEntries.filter(e =>
                e.date >= windowStart.getTime() && e.date <= windowEnd.getTime()
            );

            // Calculate insulin delivered
            const treatmentsInWindow = treatments.filter(t => {
                const tTime = new Date(t.created_at).getTime();
                return tTime >= windowStart.getTime() && tTime <= windowEnd.getTime();
            });

            let bolusInsulin = 0;
            let carbsConsumed = 0;
            let carbEvents = 0;
            let hasMeals = false;
            let hasCorrections = false;

            for (const t of treatmentsInWindow) {
                if (t.insulin && t.insulin > 0) {
                    bolusInsulin += t.insulin;

                    if (t.carbs && t.carbs > 0) {
                        hasMeals = true;
                    } else {
                        hasCorrections = true;
                    }
                }

                if (t.carbs && t.carbs > 0) {
                    carbsConsumed += t.carbs;
                    carbEvents++;
                    hasMeals = true;  // Mark as meal window if ANY carbs present
                }
            }

            // Get actual basal rate from profile for this window's time
            const basalRate = profileData?.basal
                ? getValueAtTime(profileData.basal, windowStart)
                : 1.0; // Fallback if no profile data
            const basalInsulin = basalRate * windowHours;

            const totalInsulin = bolusInsulin + basalInsulin;
            const glucoseChange = glucoseAtEnd.sgv - glucoseAtStart.sgv;

            // Determine if stable (glucose change < 20 mg/dL)
            const isStable = Math.abs(glucoseChange) < 20;

            windows.push({
                start: windowStart,
                end: windowEnd,
                duration_hours: windowHours,

                glucose_start: glucoseAtStart.sgv,
                glucose_end: glucoseAtEnd.sgv,
                glucose_change: glucoseChange,
                glucose_readings_count: glucoseInWindow.length,

                bolus_insulin: bolusInsulin,
                basal_insulin_delivered: basalInsulin,
                total_insulin: totalInsulin,

                carbs_consumed: carbsConsumed,
                carb_events_count: carbEvents,

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
    console.log(`  Windows with corrections: ${windows.filter(w => w.has_corrections).length}\n`);

    return windows;
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
