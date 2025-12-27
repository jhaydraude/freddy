import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getGlucosePrediction } from '../src/lib/prediction-logic.js';
import { getStatus } from '../src/lib/status-logic.js';

async function testFutureBasal() {
    try {
        await connectToDatabase();
        const now = new Date();

        // 1. Check current status for basal info
        const status = await getStatus(now);
        console.log('--- Current Basal Status ---');
        console.log(`Is Temp: ${status.pump.basal.isTemp}`);
        console.log(`Active Rate: ${status.pump.basal.activeRate}`);
        console.log(`Scheduled Rate: ${status.pump.basal.scheduledRate}`);
        console.log(`Expiration: ${status.pump.basal.expiration}`);

        // 2. Generate Prediction
        const prediction = await getGlucosePrediction(now, 120);

        console.log('\n--- Prediction Basal Components ---');
        // Sample points: 0m, 30m, 60m, 90m
        [0, 6, 12, 18].forEach(idx => {
            if (prediction[idx]) {
                const p = prediction[idx];
                console.log(`${idx * 5}m: Basal Impact = ${p.components?.basal}, SGV = ${p.sgv}`);
            }
        });

        // 3. Logic Check
        if (status.pump.basal.isTemp) {
            const expiration = new Date(status.pump.basal.expiration!);
            const minutesUntilExp = Math.max(0, (expiration.getTime() - now.getTime()) / (60 * 1000));
            console.log(`\nTemp Basal expires in ~${Math.round(minutesUntilExp)} minutes.`);

            // Check a point after expiration
            const afterExpIdx = Math.ceil(minutesUntilExp / 5) + 2;
            if (prediction[afterExpIdx]) {
                const p = prediction[afterExpIdx];
                console.log(`Point at ${afterExpIdx * 5}m (After Exp): Basal Impact = ${p.components?.basal}`);
                if (Math.abs(p.components?.basal || 0) < 0.1) {
                    console.log('✅ Basal component successfully reverted towards 0 after expiration.');
                }
            }
        } else {
            console.log('\nNo active temp basal found to test expiration logic.');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await disconnectFromDatabase();
    }
}

testFutureBasal();
