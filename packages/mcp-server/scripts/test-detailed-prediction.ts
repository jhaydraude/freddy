import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getGlucosePrediction } from '../src/lib/prediction-logic.js';

async function testDetailedPrediction() {
    try {
        await connectToDatabase();
        const now = new Date();
        const prediction = await getGlucosePrediction(now, 60);

        console.log('--- Detailed Prediction Verification ---');
        console.log(`Current Time: ${now.toISOString()}`);
        console.log(`Prediction points: ${prediction.length}`);

        if (prediction.length > 1) {
            console.log('\nSample point (10 mins in):');
            const point = prediction[2]; // ~10 mins in
            console.log(JSON.stringify(point, null, 2));

            if (point.components) {
                console.log('\n✅ Detailed components found.');
                const c = point.components;
                console.log(`   Insulin: ${c.insulin}`);
                console.log(`   Carbs: ${c.carbs}`);
                console.log(`   Unexplained: ${c.unexplained}`);
                console.log(`   Basal: ${c.basal}`);
            } else {
                console.log('\n❌ Detailed components MISSING.');
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await disconnectFromDatabase();
    }
}

testDetailedPrediction();
