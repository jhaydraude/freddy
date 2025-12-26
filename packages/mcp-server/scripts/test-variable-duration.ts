import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getGlucosePrediction } from '../src/lib/prediction-logic.js';

async function testVariableDuration() {
    console.log('--- Variable Prediction Duration Verification ---');
    try {
        await connectToDatabase();

        const now = new Date();

        console.log('\n1. Testing default (none specified):');
        const defaultPred = await getGlucosePrediction(now);
        console.log(`✅ Default prediction returned ${defaultPred.length} points.`);
        // Default should be at least DIA or impacts. 

        console.log('\n2. Testing 60 minutes:');
        const sixtyPred = await getGlucosePrediction(now, 60);
        console.log(`✅ 60-minute prediction returned ${sixtyPred.length} points.`);
        if (sixtyPred.length >= 12) {
            console.log('✅ Duration check passed (approx 5-min intervals).');
        }

        console.log('\n3. Testing 180 minutes:');
        const longPred = await getGlucosePrediction(now, 180);
        console.log(`✅ 180-minute prediction returned ${longPred.length} points.`);
        if (longPred.length >= 36) {
            console.log('✅ Duration check passed.');
        }

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
    }
}

testVariableDuration();
