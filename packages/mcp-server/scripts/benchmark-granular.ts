import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getStatus } from '../src/lib/status-logic.js';
import { getGlucosePrediction } from '../src/lib/prediction-logic.js';
import { bucketTimestamp } from '../src/lib/time-utils.js';

async function granularBenchmark() {
    try {
        await connectToDatabase();
        const now = new Date();
        const bucketed = bucketTimestamp(now);

        console.log('--- Granular Latency Breakdown ---');

        // 1. status-logic.ts: getStatus
        let start = performance.now();
        await getStatus(bucketed, true, true);
        let end = performance.now();
        console.log(`getStatus (Analytical + Attribution): ${(end - start).toFixed(2)}ms`);

        // 2. prediction-logic.ts: getGlucosePrediction
        // This includes getStatus PLUS the projection logic
        start = performance.now();
        await getGlucosePrediction(bucketed, 120);
        end = performance.now();
        console.log(`getGlucosePrediction (Total): ${(end - start).toFixed(2)}ms`);

        // 3. Smallest DB query for comparison
        const { Entry } = await import('./db/models.js');
        start = performance.now();
        await Entry.findOne();
        end = performance.now();
        console.log(`Simple MongoDB findOne: ${(end - start).toFixed(2)}ms`);

    } catch (err) {
        console.error(err);
    } finally {
        await disconnectFromDatabase();
    }
}

granularBenchmark();
