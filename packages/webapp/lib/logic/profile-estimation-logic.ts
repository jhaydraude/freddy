import { Entry, Treatment } from '../db/models';
import { getGlucose } from './status-logic';
import { getIOB } from './iob-logic';
import { resolveActiveProfile, getProfileStore } from './profile-logic';

/**
 * Insulin correction event for ISF estimation
 */
export interface IInsulinCorrectionEvent {
    timestamp: Date;
    insulin_delivered: number;
    iob_before: number;
    iob_after: number;
    total_active_insulin: number;
    glucose_before: number;
    glucose_after: number;
    glucose_change: number;
    dia_hours: number;
    quality: 'high' | 'medium' | 'low';
    skip_reason?: string;
}

/**
 * Options for finding correction events
 */
export interface IFindCorrectionEventsOptions {
    startDate: Date;
    endDate: Date;
    maxInitialIOB?: number;
    minGlucoseChange?: number;
}

/**
 * OPTIMIZED: Batch fetch all glucose data for the period
 */
async function batchFetchGlucoseData(startDate: Date, endDate: Date, diaHours: number = 3) {
    // Fetch with buffer for DIA lookback/forward
    const bufferMs = diaHours * 60 * 60 * 1000;
    const fetchStart = new Date(startDate.getTime() - bufferMs);
    const fetchEnd = new Date(endDate.getTime() + bufferMs);

    console.log(`Fetching all glucose data from ${fetchStart.toISOString()} to ${fetchEnd.toISOString()}...`);

    const glucoseEntries = await Entry.find({
        type: 'sgv',
        date: {
            $gte: fetchStart.getTime(),
            $lte: fetchEnd.getTime()
        }
    }).sort({ date: 1 }).lean();

    console.log(`  Loaded ${glucoseEntries.length} glucose readings into memory`);

    // Create a map for fast lookup
    const glucoseMap = new Map<number, any>();
    for (const entry of glucoseEntries) {
        if (entry.sgv) {
            glucoseMap.set(entry.date, entry);
        }
    }

    // Helper function to find closest glucose
    return {
        findClosest: (timestamp: Date, maxDeltaMinutes: number = 15): number | null => {
            const targetMs = timestamp.getTime();
            const maxDeltaMs = maxDeltaMinutes * 60 * 1000;

            let closest: any = null;
            let closestDelta = Infinity;

            for (const [entryMs, entry] of glucoseMap) {
                const delta = Math.abs(entryMs - targetMs);
                if (delta < closestDelta && delta <= maxDeltaMs) {
                    closestDelta = delta;
                    closest = entry;
                }
            }

            return closest?.sgv || null;
        }
    };
}

/**
 * OPTIMIZED: Batch fetch all carb treatments
 */
async function batchFetchCarbTreatments(startDate: Date, endDate: Date) {
    console.log(`Fetching all carb treatments...`);

    const carbTreatments = await Treatment.find({
        carbs: { $gt: 0 },
        created_at: {
            $gte: startDate.toISOString(),
            $lte: endDate.toISOString()
        }
    }).sort({ created_at: 1 }).lean();

    console.log(`  Loaded ${carbTreatments.length} carb treatments into memory`);

    return carbTreatments;
}

/**
 * OPTIMIZED: Find insulin correction events with batched queries
 */
export async function findInsulinCorrectionEvents(
    options: IFindCorrectionEventsOptions
): Promise<IInsulinCorrectionEvent[]> {
    const {
        startDate,
        endDate,
        maxInitialIOB = 2.0,
        minGlucoseChange = 10
    } = options;

    const skipReasons = {
        highIOB: 0,
        carbInterference: 0,
        noGlucoseBefore: 0,
        noGlucoseAfter: 0,
        noProfile: 0,
        smallChange: 0,
        noInsulin: 0,
        processingError: 0
    };

    const events: IInsulinCorrectionEvent[] = [];
    const diaHours = 3; // Use 3-hour window

    // === BATCH FETCH ALL DATA UPFRONT ===
    console.log('\n📦 Batching data fetch...');

    const [corrections, glucoseData, carbTreatments] = await Promise.all([
        Treatment.find({
            $or: [
                { carbs: { $exists: false } },
                { carbs: 0 }
            ],
            insulin: { $gt: 0 },
            created_at: { $gte: startDate.toISOString(), $lte: endDate.toISOString() }
        }).sort({ created_at: 1 }).lean(),

        batchFetchGlucoseData(startDate, endDate, diaHours),
        batchFetchCarbTreatments(startDate, endDate)
    ]);

    console.log(`\n✅ Batch fetch complete!`);
    console.log(`Found ${corrections.length} potential correction events\n`);

    // === PROCESS EVENTS IN MEMORY ===
    let processedCount = 0;
    for (const correction of corrections) {
        processedCount++;
        if (processedCount % 10 === 0) {
            console.log(`Processing ${processedCount}/${corrections.length}...`);
        }

        try {
            const timestamp = new Date(correction.created_at);

            // Get IOB before correction
            const iobBeforeResult = await getIOB(timestamp);
            const iobBefore = iobBeforeResult.calculated.totalIOB;

            if (iobBefore > maxInitialIOB) {
                skipReasons.highIOB++;
                continue;
            }

            // Get glucose before (from memory)
            const glucoseBefore = glucoseData.findClosest(timestamp);
            if (!glucoseBefore) {
                skipReasons.noGlucoseBefore++;
                continue;
            }

            // Calculate end time (after DIA)
            const afterTimestamp = new Date(timestamp.getTime() + diaHours * 60 * 60 * 1000);

            // Check for carb interference (in memory)
            const timestampMs = timestamp.getTime();
            const afterMs = afterTimestamp.getTime();
            const carbsDuring = (carbTreatments as any[]).filter((t: any) => {
                const tMs = new Date(t.created_at).getTime();
                return tMs >= timestampMs && tMs <= afterMs;
            });

            if (carbsDuring.length > 0) {
                skipReasons.carbInterference++;
                continue;
            }

            // Get glucose after DIA (from memory)
            const glucoseAfter = glucoseData.findClosest(afterTimestamp);
            if (!glucoseAfter) {
                skipReasons.noGlucoseAfter++;
                continue;
            }

            // Get IOB after
            const iobAfterResult = await getIOB(afterTimestamp);
            const iobAfter = iobAfterResult.calculated.totalIOB;

            // Calculate metrics
            const glucoseChange = glucoseAfter - glucoseBefore;
            const totalActiveInsulin = iobBefore + (correction.insulin || 0) - iobAfter;

            // Validate insulin value
            if (!correction.insulin || correction.insulin === 0) {
                skipReasons.noInsulin++;
                continue;
            }

            // Skip if glucose change too small
            if (Math.abs(glucoseChange) < minGlucoseChange) {
                skipReasons.smallChange++;
                continue;
            }

            // Determine quality
            let quality: 'high' | 'medium' | 'low' = 'medium';
            if (iobBefore < 0.5 && iobAfter < 0.3 && Math.abs(glucoseChange) > 30) {
                quality = 'high';
            } else if (iobBefore > 1.5 || iobAfter > 0.8) {
                quality = 'low';
            }

            events.push({
                timestamp,
                insulin_delivered: correction.insulin,
                iob_before: iobBefore,
                iob_after: iobAfter,
                total_active_insulin: totalActiveInsulin,
                glucose_before: glucoseBefore,
                glucose_after: glucoseAfter,
                glucose_change: glucoseChange,
                dia_hours: diaHours,
                quality
            });

        } catch (error) {
            skipReasons.processingError++;
            console.error(`  ⊘ Processing error:`, error);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Filtering Summary:`);
    console.log(`  Total found: ${corrections.length}`);
    console.log(`  Accepted: ${events.length}`);
    console.log(`  Rejected: ${corrections.length - events.length}`);
    console.log(`\nRejection reasons:`);
    console.log(`  High IOB (>${maxInitialIOB}U): ${skipReasons.highIOB}`);
    console.log(`  Carb interference: ${skipReasons.carbInterference}`);
    console.log(`  No glucose before: ${skipReasons.noGlucoseBefore}`);
    console.log(`  No glucose after: ${skipReasons.noGlucoseAfter}`);
    console.log(`  No profile data: ${skipReasons.noProfile}`);
    console.log(`  Glucose change too small: ${skipReasons.smallChange}`);
    console.log(`  No insulin value: ${skipReasons.noInsulin}`);
    console.log(`  Processing errors: ${skipReasons.processingError}`);
    console.log(`${'='.repeat(60)}\n`);

    return events;
}

/**
 * Generate ISF estimation data from historical corrections
 */
export async function generateISFEstimationData(
    startDate: Date,
    endDate: Date
): Promise<{
    events: IInsulinCorrectionEvent[];
    count: number;
    high_quality_count: number;
}> {
    const events = await findInsulinCorrectionEvents({ startDate, endDate });

    const highQualityCount = events.filter(e => e.quality === 'high').length;

    return {
        events,
        count: events.length,
        high_quality_count: highQualityCount
    };
}
