import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { getStatus } from './lib/status-logic.js';
import { getGlucosePrediction } from './lib/prediction-logic.js';

async function testPredictionAttribution() {
    console.log('--- Prediction Attribution Verification ---');
    try {
        await connectToDatabase();

        const now = new Date();
        console.log(`\n1. Fetching status at ${now.toISOString()} with attribution...`);
        const status = await getStatus(now, true, true);

        if (status.attribution) {
            console.log('✅ Attribution data found:');
            status.attribution.timeframes.forEach(tf => {
                console.log(`   - ${tf.timeframe}: Actual=${tf.glucoseChange.actual}, Predicted=${tf.glucoseChange.predicted}, Unexplained=${tf.components.unexplained}`);
            });
        } else {
            console.log('❌ No attribution data found in status.');
        }

        console.log('\n2. Generating glucose prediction...');
        const prediction = await getGlucosePrediction(now);

        if (prediction.length > 0) {
            console.log(`✅ Prediction generated with ${prediction.length} points.`);
            console.log('   Preview (first 5 points):');
            prediction.slice(0, 5).forEach(p => {
                console.log(`   - ${p.timestamp}: ${p.sgv}`);
            });
        } else {
            console.log('❌ Prediction is empty.');
        }

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('\n--- Verification Complete ---');
    }
}

testPredictionAttribution();
