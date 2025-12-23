/**
 * Test script to analyze profile parameters using holistic approach
 */

import { connectToDatabase } from '../src/db/connection.js';
import { generateTimeWindows } from '../src/lib/profile-analysis-logic.js';

async function main() {
    try {
        console.log('Connecting to database...');
        await connectToDatabase();

        // Past month of data
        const endDate = new Date('2025-12-23T18:23:00Z');
        const startDate = new Date('2025-11-23T18:23:00Z');

        console.log(`\n=== Holistic Profile Analysis ===`);
        console.log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
        console.log('Using 4-hour time windows\n');

        const startTime = Date.now();
        const windows = await generateTimeWindows({
            startDate,
            endDate,
            windowHours: 4
        });
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log(`✅ Window Generation Complete (${duration}s)\n`);

        if (windows.length === 0) {
            console.log('❌ No valid windows generated.');
            process.exit(0);
        }

        // Show sample windows
        console.log('📊 Sample Windows:\n');
        const samples = windows.slice(0, 3);
        for (const window of samples) {
            console.log(`  ${window.start.toISOString()}`);
            console.log(`    Glucose: ${window.glucose_start.toFixed(0)} → ${window.glucose_end.toFixed(0)} (Δ${window.glucose_change.toFixed(0)})`);
            console.log(`    Insulin: ${window.total_insulin.toFixed(2)}U (bolus: ${window.bolus_insulin.toFixed(2)}U)`);
            console.log(`    Carbs: ${window.carbs_consumed.toFixed(0)}g`);
            console.log(`    Stable: ${window.is_stable}, Meals: ${window.has_meals}\n`);
        }

        // Call the Python API to analyze
        console.log('📈 Calling holistic analysis API...\n');

        const response = await fetch('http://localhost:8000/api/v1/analyze/profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                windows: windows
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`\n❌ API Error: ${response.status}`);
            console.error(errorText);
            process.exit(1);
        }

        const analysis = await response.json();

        console.log('\n' + '='.repeat(70));
        console.log('HOLISTIC PROFILE ANALYSIS RESULTS');
        console.log('='.repeat(70));
        console.log(`\n💉 Estimated ISF: ${analysis.estimated_isf.toFixed(2)} mg/dL per unit`);
        console.log(`🍽️  Estimated ICR: ${analysis.estimated_icr.toFixed(2)} grams per unit`);
        console.log(`⏱️  Estimated Basal Rates (by hour):`);

        for (let i = 0; i < 24; i++) {
            const rate = analysis.estimated_basal_rates[i];
            const timeStr = `${i.toString().padStart(2, '0')}:00`;
            console.log(`      ${timeStr}: ${rate.toFixed(3)} U/hr`);
        }

        const avgBasal = analysis.estimated_basal_rates.reduce((a, b) => a + b, 0) / 24;
        console.log(`\n   Average: ${avgBasal.toFixed(3)} U/hr`);

        console.log(`\n📊 Model Performance:`);
        console.log(`   R²: ${analysis.r_squared.toFixed(4)}`);
        console.log(`   RMSE: ${analysis.rmse.toFixed(2)} mg/dL`);
        console.log(`   MAE: ${analysis.mae.toFixed(2)} mg/dL`);

        console.log(`\n📚 Data Summary:`);
        console.log(`   Windows analyzed: ${analysis.windows_analyzed}`);
        console.log(`   Stable windows: ${analysis.stable_windows}`);
        console.log(`   Meal windows: ${analysis.meal_windows}`);

        console.log(`\n💡 Recommendation:`);
        console.log(`   ${analysis.recommendation}`);
        console.log('\n' + '='.repeat(70));

        process.exit(0);
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
