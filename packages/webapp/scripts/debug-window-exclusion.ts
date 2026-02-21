import 'dotenv/config';
import mongoose from 'mongoose';
import { generateTimeWindows } from '../lib/logic/profile-analysis-logic.js';
import { connectToDatabase } from '../lib/db/connection.js';

async function analyzeWindowDropouts() {
    console.log('--- Analyzing Window Dropouts (Last 30 Days) ---');
    await connectToDatabase();

    const endDate = new Date();
    const daysBack = 30;
    const windowHours = 2;

    console.log(`Generating windows from ${new Date(endDate.getTime() - daysBack * 24 * 3600 * 1000).toISOString()} to ${endDate.toISOString()}...`);
    const windows = await generateTimeWindows({
        endDate,
        daysBack,
        windowHours
    });

    console.log(`Total windows produced by logic: ${windows.length}`);

    if (windows.length === 0) {
        console.log('❌ Logic produced ZERO windows. This usually means no glucose data in the range.');
        process.exit(1);
    }

    let fail_readings = 0;
    let fail_confidence = 0;
    let fail_carbs = 0;
    let success = 0;

    const reasons: Record<string, number> = {};

    windows.forEach(w => {
        if (w.data_quality.readings_count < 6) {
            fail_readings++;
        } else if (w.isolation_confidence === undefined || w.isolation_confidence < 0.1) {
            fail_confidence++;
            const subReason = w.has_meals ? 'meals' : (w.has_corrections ? 'corrections' : 'low_weight');
            reasons[subReason] = (reasons[subReason] || 0) + 1;
        } else if (w.carb_absorption > 5.0) {
            fail_carbs++;
        } else {
            success++;
        }
    });

    console.log('\nDropout Statistics:');
    console.log(`✅ Success (Foundation Compatible): ${success}`);
    console.log(`❌ Fail - < 6 Readings:          ${fail_readings}`);
    console.log(`❌ Fail - Low Isolation Conf:    ${fail_confidence}`);
    if (fail_confidence > 0) {
        console.log(`     - Due to Meals:      ${reasons['meals'] || 0}`);
        console.log(`     - Due to Corrections: ${reasons['corrections'] || 0}`);
        console.log(`     - Due to High Basal:  ${reasons['low_weight'] || 0}`);
    }
    console.log(`❌ Fail - Carb Absorption > 5g:  ${fail_carbs}`);

    process.exit(0);
}

analyzeWindowDropouts().catch(err => {
    console.error(err);
    process.exit(1);
});
