/**
 * Test script to estimate ISF from the past month of data
 */

import { connectToDatabase } from '../src/db/connection.js';
import { generateISFEstimationData } from '../src/lib/profile-estimation-logic.js';

async function main() {
    try {
        console.log('Connecting to database...');
        await connectToDatabase();

        // Past month of data
        const endDate = new Date('2025-12-23T17:58:00Z');
        const startDate = new Date('2025-11-23T17:58:00Z');

        console.log(`\n=== ISF Estimation from Correction Events ===`);
        console.log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
        console.log('Finding insulin corrections with low IOB and no carb interference...\n');

        const startTime = Date.now();
        const result = await generateISFEstimationData(startDate, endDate);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log(`\n✅ Event Detection Complete (${duration}s)`);
        console.log(`   Total events: ${result.count}`);
        console.log(`   High quality: ${result.high_quality_count}`);

        if (result.count === 0) {
            console.log('\n❌ No correction events found in this period.');
            console.log('This could mean:');
            console.log('  - No insulin corrections were given during this time');
            console.log('  - All corrections had too much IOB or carb interference');
            process.exit(0);
        }

        // Show sample events
        console.log('\n📊 Sample Events:');
        const samples = result.events.slice(0, 3);
        for (const event of samples) {
            console.log(`\n  ${event.timestamp.toISOString()}`);
            console.log(`    Insulin delivered: ${event.insulin_delivered.toFixed(2)}U`);
            console.log(`    IOB before: ${event.iob_before.toFixed(2)}U`);
            console.log(`    IOB after: ${event.iob_after.toFixed(2)}U`);
            console.log(`    Total active insulin: ${event.total_active_insulin.toFixed(2)}U`);
            console.log(`    Glucose change: ${event.glucose_change.toFixed(0)} (${event.glucose_before.toFixed(0)} → ${event.glucose_after.toFixed(0)})`);
            console.log(`    Quality: ${event.quality}`);
        }

        // Call the Python API to estimate ISF
        console.log('\n📈 Calling ISF estimation API...');

        const response = await fetch('http://localhost:8000/api/v1/estimate/isf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                events: result.events
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`\n❌ API Error: ${response.status}`);
            console.error(errorText);
            process.exit(1);
        }

        const estimation = await response.json();

        console.log('\n' + '='.repeat(60));
        console.log('ISF ESTIMATION RESULTS');
        console.log('='.repeat(60));
        console.log(`\n💉 Estimated ISF: ${estimation.estimated_isf.toFixed(2)} mg/dL per unit`);
        console.log(`   Confidence Interval: ${estimation.confidence_interval_lower.toFixed(2)} - ${estimation.confidence_interval_upper.toFixed(2)}`);
        console.log(`\n📊 Data Quality:`);
        console.log(`   Sample count: ${estimation.sample_count}`);
        console.log(`   High quality events: ${estimation.high_quality_count}`);
        console.log(`   Quality rating: ${estimation.quality.toUpperCase()}`);
        console.log(`\n💡 Recommendation:`);
        console.log(`   ${estimation.recommendation}`);
        console.log('\n' + '='.repeat(60));

        process.exit(0);
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
