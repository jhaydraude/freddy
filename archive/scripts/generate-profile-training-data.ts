/**
 * Generate 3 months of training data and train the profile model
 */

import { connectToDatabase } from '../src/db/connection.js';
import { generateProfileTrainingData } from '../src/lib/profile-training-logic.js';

async function main() {
    try {
        console.log('Connecting to database...');
        await connectToDatabase();

        // Generate training data for the last year
        const endDate = new Date('2025-12-23T10:44:00Z');
        const startDate = new Date('2024-12-23T10:44:00Z'); // 1 year ago

        console.log(`\n=== Profile Model Training (1 Year) ===`);
        console.log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
        console.log('Sampling every 6 hours, 60min lookback, 4hr outcome window\n');

        const generateStart = Date.now();
        const result = await generateProfileTrainingData({
            startDate,
            endDate,
            intervalHours: 6,
            lookbackWindow: 60,
            outcomeWindowHours: 4
        });

        const generateTime = ((Date.now() - generateStart) / 1000).toFixed(1);

        console.log(`\n✅ Data Generation Complete (${generateTime}s)`);
        console.log(`   Samples: ${result.count} generated, ${result.skipped} skipped`);
        console.log(`   Success rate: ${((result.count / (result.count + result.skipped)) * 100).toFixed(1)}%`);

        if (result.count >= 10) {
            console.log('\n📊 Training model with generated samples...');

            // Call the training API
            const trainingStart = Date.now();
            const response = await fetch('http://localhost:8000/api/v1/train/profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model_name: 'profile_tuner',
                    samples: result.samples,
                    test_size: 0.2,
                    parameters: {}
                })
            });

            const trainingTime = ((Date.now() - trainingStart) / 1000).toFixed(1);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`\n❌ Training failed (${trainingTime}s): ${response.status} - ${errorText}`);
                process.exit(1);
            }

            const trainingResult = await response.json();

            console.log(`\n✅ Model Training Complete (${trainingTime}s)`);
            console.log(`\n📈 Performance Metrics:`);
            console.log(`   ISF MAE: ${trainingResult.metrics.isf_test_mae?.toFixed(3)} mmol/L per unit`);
            console.log(`   ICR MAE: ${trainingResult.metrics.icr_test_mae?.toFixed(3)} g per unit`);
            console.log(`   Basal MAE: ${trainingResult.metrics.avg_basal_test_mae?.toFixed(3)} U/hr`);
            console.log(`   Overall R²: ${trainingResult.metrics.test_r2?.toFixed(3)}`);

            console.log(`\n📚 Dataset:`);
            console.log(`   Training samples: ${trainingResult.samples_trained}`);
            console.log(`   Validation samples: ${trainingResult.samples_validated}`);

            console.log(`\n🎯 Top Features (by importance):`);
            const topFeatures = Object.entries(trainingResult.feature_importance || {})
                .slice(0, 5)
                .map(([name, score]: [string, any]) => `   - ${name}: ${(score * 100).toFixed(1)}%`);
            console.log(topFeatures.join('\n'));

            console.log(`\n✅ Model '${trainingResult.model_name}' ready for recommendations!`);
        } else {
            console.log(`\n❌ Insufficient samples (${result.count} < 10). Cannot train model.`);
        }

        process.exit(0);
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
