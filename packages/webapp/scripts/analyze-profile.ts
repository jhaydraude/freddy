import { connectToDatabase } from '../lib/db/connection';
import { generateTimeWindows } from '../lib/logic/profile-analysis-logic';
import { resolveActiveProfile } from '../lib/logic/profile-logic';

async function main() {
    console.log('🚀 Starting Profile Analysis...');
    await connectToDatabase();

    const days = parseInt(process.argv[2]) || 14;
    const windows = await generateTimeWindows({ daysBack: days, windowHours: 2 });

    const profile = await resolveActiveProfile(new Date());
    const currentISF = profile?.profileData?.sens?.[0]?.value || 50;
    const currentCR = profile?.profileData?.carbratio?.[0]?.value || 10;

    console.log(`\n📋 Current Profile: ISF=${currentISF}, CR=${currentCR}`);
    console.log(`Analyzing ${windows.length} windows over ${days} days...\n`);

    // 1. ISF Analysis (Insulin-only windows)
    const isfWindows = windows.filter(w =>
        w.insulin_activity > 0.5 &&
        w.carbs_consumed === 0 &&
        w.carb_absorption < 1 &&
        w.activity_impact > -5 && // Low activity interference
        w.glucose_readings_count >= 10
    );

    let isfCount = 0;
    const isfObservations: number[] = [];

    for (const w of isfWindows) {
        // Expected drop = insulin * ISF
        // Actual drop = glucose_start - glucose_end
        const actualDrop = w.glucose_start - w.glucose_end;
        const observedISF = actualDrop / w.insulin_activity;

        if (observedISF > 10 && observedISF < 200) {
            isfObservations.push(observedISF);
            isfCount++;
        }
    }

    // 2. Activity Analysis (High activity, relatively clean)
    const activePotential = windows.filter(w => w.activity_steps > 300);
    console.log(`🔍 Found ${activePotential.length} windows with >300 steps.`);
    if (activePotential.length > 0) {
        const sample = activePotential[0];
        console.log(`   Sample Window Activity Stats:`);
        console.log(`   - Steps: ${sample.activity_steps}`);
        console.log(`   - Insulin Activity: ${sample.insulin_activity.toFixed(2)} (Basal: ${sample.basal_insulin_delivered.toFixed(2)})`);
        console.log(`   - Carb Absorption: ${sample.carb_absorption.toFixed(2)}`);
    }

    const activityWindows = windows.filter(w =>
        w.activity_steps > 300 &&
        w.insulin_activity < (w.basal_insulin_delivered + 1.5) && // Even more lenient
        w.carb_absorption < 10 // Allow more carbs
    );

    console.log('--- ANALYSIS RESULTS ---');

    if (isfCount > 0) {
        const avgObservedISF = isfObservations.reduce((a, b) => a + b, 0) / isfCount;
        const isfTuning = ((avgObservedISF - currentISF) / currentISF) * 100;
        console.log(`📍 ISF Sensitivity:`);
        console.log(`   Observations:  ${isfCount} clean correction events`);
        console.log(`   Current ISF:   ${currentISF}`);
        console.log(`   Observed ISF:  ${avgObservedISF.toFixed(1)}`);
        console.log(`   Recommendation: ${isfTuning > 0 ? 'Increase' : 'Decrease'} ISF by ${Math.abs(isfTuning).toFixed(1)}%`);
    } else {
        console.log(`📍 ISF Sensitivity: Insufficient clean data`);
    }

    if (activityWindows.length > 0) {
        console.log(`\n🏃 Activity Impact:`);
        console.log(`   Found ${activityWindows.length} exercise windows with low interference.`);

        let totalSteps = 0;
        let totalObservedDrop = 0;
        let totalModelExpectedDrop = 0;

        for (const w of activityWindows) {
            // Observed drop adjusted for insulin (using observed ISF if available)
            const isfToUse = isfCount > 0 ? (isfObservations.reduce((a, b) => a + b, 0) / isfCount) : currentISF;
            const insulinDrop = w.insulin_activity * isfToUse;
            const carbRise = w.carb_absorption * (isfToUse / currentCR); // Simple rise estimation

            const netObservedDrop = (w.glucose_start - w.glucose_end) - insulinDrop + carbRise;

            totalSteps += w.activity_steps;
            totalObservedDrop += netObservedDrop;
            totalModelExpectedDrop += Math.abs(w.activity_impact);
        }

        const dropPer1000Steps = (totalObservedDrop / totalSteps) * 1000;
        const modelPredictPer1000 = (totalModelExpectedDrop / totalSteps) * 1000;

        console.log(`   Total Steps:    ${totalSteps}`);
        console.log(`   Observed drop:  ${dropPer1000Steps.toFixed(1)} mg/dL per 1k steps`);
        console.log(`   Model expected: ${modelPredictPer1000.toFixed(1)} mg/dL per 1k steps`);

        const activityError = ((dropPer1000Steps - modelPredictPer1000) / modelPredictPer1000) * 100;
        console.log(`   Recommendation: ${activityError > 0 ? 'Increase' : 'Decrease'} activity coefficients by ${Math.abs(activityError).toFixed(1)}%`);
    }

    const nighttimeStable = windows.filter(w =>
        (w.hour_of_day >= 0 && w.hour_of_day <= 5) &&
        w.insulin_activity < (w.basal_insulin_delivered + 0.2) &&
        w.carb_absorption < 1 &&
        w.is_stable
    );

    console.log(`\n🌙 Nighttime Basal:`);
    console.log(`   ${nighttimeStable.length} stable overnight windows found.`);
    if (nighttimeStable.length < (windows.length / 24 * 4)) {
        console.log(`   ⚠️ High frequency of overnight corrections or drift detected.`);
    } else {
        console.log(`   ✅ Basal rates appear solid overnight.`);
    }

    console.log('\n' + '='.repeat(40));
    process.exit(0);
}

main().catch(console.error);
