import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { getStatus } from './lib/status-logic.js';

async function test30mHistory() {
    console.log('--- 30-Minute History & Momentum Verification ---');
    try {
        await connectToDatabase();

        const now = new Date();
        const status = await getStatus(now, true, true);

        console.log('\n1. Glucose History (history30m):');
        if (status.glucose?.current?.history30m) {
            console.log(`✅ history30m found with ${status.glucose.current.history30m.length} points.`);
            console.log('   Points:', status.glucose.current.history30m.join(' -> '));
        } else {
            console.log('❌ No history30m found.');
        }

        console.log('\n2. Attribution History:');
        if (status.attribution?.history) {
            console.log(`✅ Attribution history found with ${status.attribution.history.length} points.`);
            console.log('   First Point (Oldest):', JSON.stringify(status.attribution.history[0], null, 2));
            console.log('   Last Point (Newest):', JSON.stringify(status.attribution.history[status.attribution.history.length - 1], null, 2));
        } else {
            console.log('❌ No attribution history found.');
        }

        console.log('\n3. 30m Delta Consistency:');
        if (status.glucose?.current?.delta30m !== undefined) {
            console.log(`✅ delta30m: ${status.glucose.current.delta30m}`);
            const attr30m = status.attribution?.timeframes.find(tf => tf.minutes === 30);
            console.log(`✅ attribution (30m) actual: ${attr30m?.glucoseChange.actual}`);

            if (status.glucose.current.delta30m === attr30m?.glucoseChange.actual) {
                console.log('✅ Delta consistency verified!');
            } else {
                console.log('❌ Delta mismatch!');
            }
        }

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
    }
}

test30mHistory();
