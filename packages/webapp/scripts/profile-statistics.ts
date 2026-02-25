import mongoose from 'mongoose';
import { connectToDatabase } from '../lib/db/connection';
import { Entry, UserPreference, Treatment } from '../lib/db/models';
import { calculateStatistics, calculateTDDStatistics, calculateActivityStatistics } from '../lib/logic/statistics-logic';
import { calculateBasalSummary } from '../lib/logic/iob-basal';
import { resolveActiveProfile } from '../lib/logic/profile-logic';

async function profileTimeframe(days: number) {
    console.log(`\n===========================================`);
    console.log(`Profiling for ${days} days`);
    console.log(`===========================================`);

    const endDate = new Date('2026-02-24T00:00:00.000Z'); // Fixed end date for consistent testing
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    let totalTime = 0;

    // 1. Fetch Preferences
    let start = performance.now();
    const userPrefs = await UserPreference.find({ userId: 'default' }).lean();
    const preferences: Record<string, any> = {};
    userPrefs.forEach((p: any) => { preferences[p.key] = p.value; });
    const lowThreshold = preferences.low_threshold || 70;
    const highThreshold = preferences.high_threshold || 180;
    const units = preferences.units || 'mg/dL';
    let elapsed = performance.now() - start;
    totalTime += elapsed;
    console.log(`1. Fetch Preferences: ${elapsed.toFixed(2)} ms`);

    // 2. Fetch SGV Entries
    start = performance.now();
    const entries = await Entry.find({
        date: { $gte: startDate.getTime(), $lte: endDate.getTime() },
        type: 'sgv'
    }).sort({ date: 1 }).lean();
    elapsed = performance.now() - start;
    totalTime += elapsed;
    console.log(`2. Fetch SGV Entries (${entries.length} items): ${elapsed.toFixed(2)} ms`);

    // 3. Process SGV Statistics
    start = performance.now();
    const readings = entries.map((e: any) => ({
        timestamp: e.date,
        sgv: e.sgv,
        dateString: e.dateString
    }));
    const stats = calculateStatistics(readings, lowThreshold, highThreshold, units);
    elapsed = performance.now() - start;
    totalTime += elapsed;
    console.log(`3. Process SGV Statistics: ${elapsed.toFixed(2)} ms`);

    // 4. Fetch Treatments
    start = performance.now();
    const treatments = await Treatment.find({
        created_at: {
            $gte: startDate.toISOString(),
            $lte: endDate.toISOString()
        },
        $or: [
            { insulin: { $exists: true, $gt: 0 } },
            { eventType: "Correction Bolus" },
            { eventType: "Meal Bolus" },
            { type: "SMB" }
        ]
    }).lean();
    elapsed = performance.now() - start;
    totalTime += elapsed;
    console.log(`4. Fetch Treatments (${treatments.length} items): ${elapsed.toFixed(2)} ms`);

    // 5. Fetch Active Profile
    start = performance.now();
    const profileInfo = await resolveActiveProfile(endDate);
    elapsed = performance.now() - start;
    totalTime += elapsed;
    console.log(`5. Resolve Active Profile: ${elapsed.toFixed(2)} ms`);

    // 6. Calculate Basal Summary
    start = performance.now();
    const basals = await calculateBasalSummary(startDate, endDate);
    elapsed = performance.now() - start;
    totalTime += elapsed;
    console.log(`6. Calculate Basal Summary: ${elapsed.toFixed(2)} ms`);

    // 7. Calculate TDD Statistics
    start = performance.now();
    const tddStats = calculateTDDStatistics(treatments, basals);
    elapsed = performance.now() - start;
    totalTime += elapsed;
    console.log(`7. Process TDD Statistics: ${elapsed.toFixed(2)} ms`);

    // 8. Fetch Activity Entries
    start = performance.now();
    const activityEntries = await Entry.find({
        date: { $gte: startDate.getTime(), $lte: endDate.getTime() },
        type: 'activity',
        stale: { $ne: true }
    }).select('date timestamp created_at steps heartrate').lean();
    elapsed = performance.now() - start;
    totalTime += elapsed;
    console.log(`8. Fetch Activity Entries (${activityEntries.length} items): ${elapsed.toFixed(2)} ms`);

    // 9. Process Activity Statistics
    start = performance.now();
    const rangeDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const activityStats = calculateActivityStatistics(activityEntries, rangeDays);
    elapsed = performance.now() - start;
    totalTime += elapsed;
    console.log(`9. Process Activity Statistics: ${elapsed.toFixed(2)} ms`);

    console.log(`-------------------------------------------`);
    console.log(`Total Processing Time: ${totalTime.toFixed(2)} ms`);
    console.log(`===========================================\n`);
}

async function main() {
    await connectToDatabase();
    await profileTimeframe(7);
    await profileTimeframe(30);
    await profileTimeframe(90);
    process.exit(0);
}

main().catch(console.error);
