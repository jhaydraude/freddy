import { ITimeWindow } from '../lib/logic/profile-analysis-logic.js';
import { calculateProfileTuning } from '../lib/logic/profile-tuning-logic.js';

function runTest() {
    console.log('🧪 Testing Profile Tuning Logic...\n');

    const currentProfile = {
        sens: [{ value: 50 }],
        carbs: [{ value: 10 }],
        basal: [{ value: 1.0 }],
        dia: 5
    };

    // Scenario 1: ISF is too aggressive (observed is Higher than current)
    // Profile says 50 mg/dL per unit. 
    // If 1 unit drops 100 mg/dL, observed is 100.
    const isfWindows: Partial<ITimeWindow>[] = Array(10).fill({
        insulin_activity: 1,
        carbs_consumed: 0,
        carb_absorption: 0,
        activity_impact: 0,
        glucose_start: 250,
        glucose_end: 150, // 100 drop for 1 unit
        glucose_readings_count: 12,
        hour_of_day: 14
    });

    // Scenario 2: Basal is too low (drifting UP overnight)
    const basalWindows: Partial<ITimeWindow>[] = Array(10).fill({
        insulin_activity: 1,
        basal_insulin_delivered: 1,
        carbs_consumed: 0,
        carb_absorption: 0,
        activity_steps: 0,
        glucose_start: 100,
        glucose_end: 130, // 30 mg/dL rise per hour
        hour_of_day: 2,
    });

    // Scenario 3: DIA is too short (insulin lasts longer than expected)
    const diaSequence: Partial<ITimeWindow>[] = [
        { bolus_insulin: 0, hour_of_day: 10 },
        { bolus_insulin: 0, hour_of_day: 11 },
        { bolus_insulin: 0, hour_of_day: 12 },
        { bolus_insulin: 5, hour_of_day: 13 }, // Large bolus [idx 3]
        { bolus_insulin: 0, hour_of_day: 14, insulin_activity: 1.0 }, // [idx 4]
        {
            bolus_insulin: 0,
            insulin_activity: 0.05, // Model says almost gone
            carbs_consumed: 0,
            carb_absorption: 0,
            activity_steps: 0,
            glucose_start: 150,
            glucose_end: 130, // dropping 20 mg/dL in the tail
            hour_of_day: 15
        }, // [idx 5] - prevPrev is idx 3 (bolus 5). isTail=T, actualDrop=20, activity=0.05.
        {
            bolus_insulin: 0,
            insulin_activity: 0.05,
            carbs_consumed: 0,
            carb_absorption: 0,
            activity_steps: 0,
            glucose_start: 130,
            glucose_end: 110,
            hour_of_day: 16
        },
        {
            bolus_insulin: 0,
            insulin_activity: 0.05,
            carbs_consumed: 0,
            carb_absorption: 0,
            activity_steps: 0,
            glucose_start: 110,
            glucose_end: 90,
            hour_of_day: 17
        }
    ];

    // To make Scenario 3 work, we need a separate run or a very long sequence
    const resultDIA = calculateProfileTuning(diaSequence as ITimeWindow[], currentProfile);

    console.log('\n--- DIA TEST RESULTS ---');
    const diaSug = resultDIA.suggestions.find(s => s.parameter === 'dia');
    if (diaSug) {
        console.log(`📍 DIA: Suggested ${diaSug.suggestedValue} (Current: ${diaSug.currentValue})`);
        console.log(`   Reason: ${diaSug.reason}`);
    }

    // Combined result for other assertions
    const allWindows = [...isfWindows, ...basalWindows] as ITimeWindow[];
    const result = calculateProfileTuning(allWindows, currentProfile);

    console.log('\n--- GLOBAL TEST RESULTS ---');
    console.log('Suggestions generated:', result.suggestions.length);
    for (const s of result.suggestions) {
        console.log(`\n📍 ${s.parameter.toUpperCase()}:`);
        console.log(`   Current:   ${s.currentValue}`);
        console.log(`   Suggested: ${s.suggestedValue} (${s.changePercentage}%)`);
        console.log(`   Reason:    ${s.reason}`);
    }

    // Assertions
    const isfSug = result.suggestions.find(s => s.parameter === 'isf');
    if (isfSug && isfSug.suggestedValue > 50) {
        console.log('\n✅ ISF Suggestion Correct: Senses higher sensitivity.');
    } else {
        console.log('\n❌ ISF Suggestion Failed');
    }

    const basalSug = result.suggestions.find(s => s.parameter === 'basal');
    if (basalSug && basalSug.suggestedValue > 1.0) {
        console.log('✅ Basal Suggestion Correct: Senses upward drift.');
    } else {
        console.log('❌ Basal Suggestion Failed');
    }

}

runTest();
