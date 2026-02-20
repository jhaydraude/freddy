import { connectToDatabase } from '../lib/db/connection';
import { getStatus } from '../lib/logic/status-logic';

async function main() {
    await connectToDatabase();

    // Test with a very recent timestamp where we know steps exist
    const testTime = new Date('2026-01-06T19:25:00Z');

    console.log('Testing activity attribution (fresh calculation)...\n');
    console.log(`Test timestamp: ${testTime.toISOString()}\n`);

    // Get fresh status with attribution, bypassing cache
    const status = await getStatus(testTime, true, true, true);

    if (!status.attribution) {
        console.log('❌ No attribution data found');
        process.exit(1);
    }

    console.log('✅ Attribution calculated successfully\n');

    // Display attribution for each timeframe
    for (const tf of status.attribution.timeframes) {
        console.log(`\n=== ${tf.timeframe} ===`);
        console.log(`Actual change: ${tf.glucoseChange.actual} mg/dL`);
        console.log(`Predicted: ${tf.glucoseChange.predicted} mg/dL`);
        console.log(`\nComponents:`);
        console.log(`  Insulin: ${tf.components.insulin.value} mg/dL`);
        console.log(`  Carbs: ${tf.components.carbs.value} mg/dL`);
        console.log(`  Basal: ${tf.components.basal.value} mg/dL`);
        console.log(`  Activity: ${tf.components.activity.value} mg/dL`);
        console.log(`    - Steps: ${tf.components.activity.steps} mg/dL`);
        console.log(`    - Calories: ${tf.components.activity.calories} mg/dL`);
        console.log(`    - Stairs: ${tf.components.activity.stairs} mg/dL`);
        console.log(`    - Heart Rate: ${tf.components.activity.heartRate} mg/dL`);
        console.log(`    - Stress HR: ${tf.components.activity.stressHeartRate ?? 'N/A'} mg/dL`);
        console.log(`    - Intensity: ${tf.components.activity.intensity}`);
        console.log(`    - Data Available: ${tf.components.activity.dataAvailable}`);
        console.log(`  Unexplained: ${tf.components.unexplained} mg/dL`);
    }

    process.exit(0);
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
