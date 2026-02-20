import { connectToDatabase } from '../lib/db/connection';
import { calculateRestingHR, calculateStepBaseline, calculateAndPersistBaseline, getBaseline, calculateHRR } from '../lib/logic/baseline-logic';
import { calculateActivityImpact, detectActivityBouts, getPostMealMultiplier } from '../lib/logic/activity-impact';
import { getActivityHistory, IActivityPoint } from '../lib/logic/activity-logic';
import { Entry } from '../lib/db/models';

const PASS = '✅';
const FAIL = '❌';
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
    if (condition) {
        console.log(`  ${PASS} ${message}`);
        passed++;
    } else {
        console.log(`  ${FAIL} ${message}`);
        failed++;
    }
}

async function testBaselineCalculation() {
    console.log('\n=== 1. Baseline Calculation (Overnight P10) ===');

    const hrData = await calculateRestingHR(14);
    console.log(`  Resting HR: ${hrData.restingHR} BPM`);
    console.log(`  Overnight P10: ${hrData.overnightHR_p10} BPM`);
    console.log(`  Max HR: ${hrData.maxHR} BPM`);

    assert(hrData.restingHR >= 45 && hrData.restingHR <= 80, `Resting HR (${hrData.restingHR}) is physiologically reasonable (45-80)`);
    assert(hrData.overnightHR_p10 >= 40 && hrData.overnightHR_p10 <= 80, `Overnight P10 (${hrData.overnightHR_p10}) is reasonable (40-80)`);
    assert(hrData.maxHR > 120, `Max HR (${hrData.maxHR}) is above 120`);
    assert(hrData.maxHR > hrData.restingHR, `Max HR > Resting HR`);

    const stepBaseline = await calculateStepBaseline(14);
    console.log(`  Step baseline: ${stepBaseline} steps/min`);
    assert(stepBaseline > 0, `Step baseline (${stepBaseline}) is positive`);

    // Persist and re-read
    const baseline = await calculateAndPersistBaseline();
    console.log(`  Persisted baseline at: ${baseline.lastUpdated}`);
    assert(baseline.lastUpdated.length > 0, 'Baseline has lastUpdated timestamp');

    const cached = await getBaseline();
    assert(cached.restingHR === baseline.restingHR, `Cached baseline matches (restingHR=${cached.restingHR})`);
}

async function testDataCollectionState() {
    console.log('\n=== 2. Data Collection State ===');

    // Find a time window with HR data but no steps
    const hrOnlyWindow = await Entry.findOne({
        type: 'activity',
        heartrate: { $exists: true, $gt: 0 }
    }).sort({ date: -1 }).lean();

    if (hrOnlyWindow) {
        const windowTime = new Date(hrOnlyWindow.date);
        const windowStart = new Date(windowTime.getTime() - 5 * 60 * 1000);
        const activityData = await getActivityHistory(windowStart, windowTime, 5);

        const baseline = await getBaseline();
        const impact = calculateActivityImpact(activityData, 5, baseline);

        console.log(`  Window: ${windowStart.toISOString()} - ${windowTime.toISOString()}`);
        console.log(`  Collection state: ${JSON.stringify(impact.collectionState)}`);

        // If HR exists, collection should be active and steps are 'known'
        if (impact.collectionState.hasHeartRateData) {
            assert(impact.collectionState.isCollecting === true, 'isCollecting=true when HR present');
            assert(impact.collectionState.stepDataConfidence === 'known', "stepDataConfidence='known' when HR present");
            assert(impact.dataAvailable === true, 'dataAvailable=true when collecting');
        }
    }

    // Find a period with NO HR data (e.g., a gap)
    // Search for a time where nearby records have no HR
    const oldRecord = await Entry.findOne({
        type: 'activity',
        heartrate: { $exists: true }
    }).sort({ date: 1 }).lean();

    if (oldRecord) {
        // Look before the earliest HR record — should have no data
        const beforeHR = new Date(oldRecord.date - 60 * 60 * 1000);
        const beforeStart = new Date(beforeHR.getTime() - 5 * 60 * 1000);
        const noDataActivity = await getActivityHistory(beforeStart, beforeHR, 5);

        const baseline = await getBaseline();
        const noDataImpact = calculateActivityImpact(noDataActivity, 5, baseline);

        console.log(`  No-HR window: ${beforeStart.toISOString()} - ${beforeHR.toISOString()}`);
        console.log(`  Collection state: ${JSON.stringify(noDataImpact.collectionState)}`);

        assert(noDataImpact.collectionState.isCollecting === false, 'isCollecting=false when no HR data');
        assert(noDataImpact.collectionState.stepDataConfidence === 'unknown', "stepDataConfidence='unknown' when no HR");
        assert(noDataImpact.dataAvailable === false, 'dataAvailable=false when not collecting');
        assert(noDataImpact.intensity === 'unknown', "intensity='unknown' when not collecting");
    }
}

async function testHRRCalculation() {
    console.log('\n=== 3. HRR Calculation ===');

    // Known values: resting=60, max=185, current=120
    const hrr = calculateHRR(120, 60, 185);
    console.log(`  HRR(120, 60, 185) = ${hrr.toFixed(3)}`);
    assert(Math.abs(hrr - 0.48) < 0.01, `HRR ≈ 0.48 (got ${hrr.toFixed(3)})`);

    // Edge cases
    const hrrLow = calculateHRR(60, 60, 185);
    assert(hrrLow === 0, `HRR at resting = 0 (got ${hrrLow})`);

    const hrrMax = calculateHRR(185, 60, 185);
    assert(hrrMax === 1.0, `HRR at max = 1.0 (got ${hrrMax})`);

    const hrrOver = calculateHRR(200, 60, 185);
    assert(hrrOver === 1.0, `HRR above max capped at 1.0 (got ${hrrOver})`);

    const hrrBelow = calculateHRR(50, 60, 185);
    assert(hrrBelow === 0, `HRR below resting = 0 (got ${hrrBelow})`);
}

async function testBoutDetection() {
    console.log('\n=== 4. Bout Detection ===');

    const baseline = await getBaseline();

    // Find a period with sustained step activity (look for high step counts)
    const highStepRecords = await Entry.find({
        type: 'activity',
        steps: { $gt: 50 }
    }).sort({ date: -1 }).limit(20).lean();

    if (highStepRecords.length > 0) {
        // Get a wider window around these records
        const latestDate = new Date(highStepRecords[0].date);
        const windowStart = new Date(latestDate.getTime() - 60 * 60 * 1000); // 1 hour window
        const activityData = await getActivityHistory(windowStart, latestDate, 5);

        console.log(`  Window: ${windowStart.toISOString()} - ${latestDate.toISOString()}`);
        console.log(`  Activity points: ${activityData.length}`);

        const bouts = detectActivityBouts(activityData, baseline);
        console.log(`  Detected bouts: ${bouts.length}`);

        for (const bout of bouts) {
            console.log(`    Bout: ${bout.durationMinutes}min, ${bout.totalSteps} steps, avgHR=${bout.avgHR}, multiplier=${bout.boutMultiplier}, aerobic=${bout.isAerobic}, anaerobic=${bout.isAnaerobic}`);
        }

        if (bouts.length > 0) {
            assert(bouts[0].durationMinutes >= 15, `Bout duration ≥ 15 min (got ${bouts[0].durationMinutes})`);
            assert(bouts[0].boutMultiplier >= 1.0, `Bout multiplier ≥ 1.0 (got ${bouts[0].boutMultiplier})`);
            assert(bouts[0].boutMultiplier <= 2.0, `Bout multiplier ≤ 2.0 (got ${bouts[0].boutMultiplier})`);
        } else {
            console.log('  ℹ️  No bouts detected in this window (may need different time range)');
        }
    } else {
        console.log('  ℹ️  No high-step records found to test bout detection');
    }
}

async function testStressDetection() {
    console.log('\n=== 5. Stress Detection (Elevated HR + 0 Steps) ===');

    const baseline = await getBaseline();
    console.log(`  Using baseline: restingHR=${baseline.restingHR}, maxHR=${baseline.maxHR}`);

    // Simulate: high HR, no steps, device collecting
    const stressData: IActivityPoint[] = [
        { timestamp: new Date().toISOString(), heartRate: { bpm: 100, bpm_avg: 100, bpm_min: 95, bpm_max: 110 } },
        { timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), heartRate: { bpm: 105, bpm_avg: 105, bpm_min: 98, bpm_max: 112 } },
        { timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), heartRate: { bpm: 98, bpm_avg: 98, bpm_min: 92, bpm_max: 105 } },
    ];

    const stressImpact = calculateActivityImpact(stressData, 15, baseline);
    console.log(`  Stress HR impact: ${stressImpact.components.stressHeartRate} mg/dL`);
    console.log(`  Steps impact: ${stressImpact.components.steps} mg/dL`);
    console.log(`  Total impact: ${stressImpact.totalImpact} mg/dL`);
    console.log(`  Collection state: ${JSON.stringify(stressImpact.collectionState)}`);

    assert(stressImpact.collectionState.stepDataConfidence === 'known', "stepDataConfidence='known' (HR present)");
    assert(stressImpact.components.stressHeartRate > 0, `Stress HR component is positive (glucose-raising): ${stressImpact.components.stressHeartRate}`);
    assert(stressImpact.components.steps === 0, 'Steps component is 0');

    // Control: same HR but WITH steps — should NOT trigger stress
    const exerciseData: IActivityPoint[] = [
        { timestamp: new Date().toISOString(), steps: { count: 500 }, heartRate: { bpm: 100, bpm_avg: 100 } },
        { timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), steps: { count: 480 }, heartRate: { bpm: 105, bpm_avg: 105 } },
    ];

    const exerciseImpact = calculateActivityImpact(exerciseData, 10, baseline);
    assert(exerciseImpact.components.stressHeartRate === 0, 'Stress HR = 0 when steps are present (it is exercise)');
}

async function testPostMealMultiplier() {
    console.log('\n=== 6. Post-Meal Exercise Multiplier ===');

    assert(getPostMealMultiplier(null) === 1.0, 'Unknown meal timing = 1.0x');
    assert(getPostMealMultiplier(15) === 0.8, '15 min post-meal = 0.8x');
    assert(getPostMealMultiplier(45) === 1.5, '45 min post-meal = 1.5x (optimal window)');
    assert(getPostMealMultiplier(60) === 1.5, '60 min post-meal = 1.5x');
    assert(getPostMealMultiplier(120) === 1.2, '120 min post-meal = 1.2x');
    assert(getPostMealMultiplier(240) === 1.0, '240 min post-meal = 1.0x (fasted)');

    // Verify multiplier actually affects the impact
    const baseline = await getBaseline();
    const activeData: IActivityPoint[] = [
        { timestamp: new Date().toISOString(), steps: { count: 600 }, heartRate: { bpm: 85, bpm_avg: 85 } },
        { timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), steps: { count: 550 }, heartRate: { bpm: 88, bpm_avg: 88 } },
    ];

    const fastedImpact = calculateActivityImpact(activeData, 10, baseline, undefined, null);
    const postMealImpact = calculateActivityImpact(activeData, 10, baseline, undefined, 60); // 60 min = 1.5x

    console.log(`  Fasted impact: ${fastedImpact.totalImpact}`);
    console.log(`  Post-meal (60min) impact: ${postMealImpact.totalImpact}`);

    // Post-meal should amplify the glucose-lowering effect (more negative)
    if (fastedImpact.components.steps !== 0) {
        assert(
            Math.abs(postMealImpact.components.steps) >= Math.abs(fastedImpact.components.steps),
            'Post-meal exercise amplifies glucose-lowering step impact'
        );
    }
}

async function testBackwardCompatibility() {
    console.log('\n=== 7. Backward Compatibility ===');

    const baseline = await getBaseline();

    // Empty data should still return the expected structure
    const emptyImpact = calculateActivityImpact([], 5, baseline);
    assert(emptyImpact.totalImpact === 0, 'Empty data → totalImpact=0');
    assert(emptyImpact.intensity === 'unknown', "Empty data → intensity='unknown'");
    assert(emptyImpact.dataAvailable === false, 'Empty data → dataAvailable=false');
    assert('steps' in emptyImpact.components, 'Has steps component');
    assert('calories' in emptyImpact.components, 'Has calories component');
    assert('stairs' in emptyImpact.components, 'Has stairs component');
    assert('heartRate' in emptyImpact.components, 'Has heartRate component');
    assert('stressHeartRate' in emptyImpact.components, 'Has stressHeartRate component');
    assert(Array.isArray(emptyImpact.bouts), 'Has bouts array');
    assert('collectionState' in emptyImpact, 'Has collectionState');
}

async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   Activity Impact Improvements — Verification   ║');
    console.log('╚══════════════════════════════════════════════════╝');

    await connectToDatabase();

    await testBaselineCalculation();
    await testDataCollectionState();
    await testHRRCalculation();
    await testBoutDetection();
    await testStressDetection();
    await testPostMealMultiplier();
    await testBackwardCompatibility();

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`${'═'.repeat(50)}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
