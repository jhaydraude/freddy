import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getGlucosePrediction } from '../src/lib/prediction-logic.js';
import { getStatus } from '../src/lib/status-logic.js';

async function checkReasonableness() {
    try {
        await connectToDatabase();
        const now = new Date();
        const status = await getStatus(now, true, true);
        const prediction = await getGlucosePrediction(now, 120);

        console.log('--- Prediction Analysis ---');
        console.log(`Current SGV: ${status.glucose.current.sgv} ${status.glucose.units}`);
        console.log(`IOB: ${status.iob.calculated.totalIOB} U`);
        console.log(`COB: ${status.cob.calculated.cob} g`);

        const endPoint = prediction[prediction.length - 1];
        console.log(`\nPrediction at ${endPoint.timestamp} (120m): ${endPoint.sgv}`);

        const attr30m = status.attribution.timeframes.find(tf => tf.minutes === 30);
        console.log(`\n30m Attribution:`);
        console.log(`  Actual Change: ${attr30m.glucoseChange.actual}`);
        console.log(`  Predicted Change: ${attr30m.glucoseChange.predicted}`);
        console.log(`  Unexplained: ${attr30m.components.unexplained}`);

    } catch (err) {
        console.error(err);
    } finally {
        await disconnectFromDatabase();
    }
}

checkReasonableness();
