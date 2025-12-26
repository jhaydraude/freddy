import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getGlucosePrediction } from '../src/lib/prediction-logic.js';
import { getStatus } from '../src/lib/status-logic.js';
import { ComputedStatus } from '../src/db/models.js';
import { bucketTimestamp } from '../src/lib/time-utils.js';

async function benchmark() {
    try {
        await connectToDatabase();
        const now = new Date();
        const bucketed = bucketTimestamp(now);

        console.log('--- Prediction Performance Benchmark ---');

        // 1. Cold Start (No cache at all)
        console.log('\n1. Cold Start (Deleting cache for current bucket)...');
        await ComputedStatus.deleteOne({ timestamp: bucketed });

        let start = performance.now();
        const pred1 = await getGlucosePrediction(bucketed, 120);
        let end = performance.now();
        console.log(`Cold start time: ${(end - start).toFixed(2)}ms`);

        // 2. Status Cached (But prediction not cached in the model yet - simulated by calling getGlucosePrediction again)
        console.log('\n2. Status Cached (Re-running logic while status is in DB)...');
        // getStatus will find the record we just created (wait, getGlucosePrediction doesn't save to cache, the tool handler does)
        // Let's verify if getStatus is caching.

        start = performance.now();
        const pred2 = await getGlucosePrediction(bucketed, 120);
        end = performance.now();
        console.log(`Status cached time: ${(end - start).toFixed(2)}ms`);

        // 3. Tool level cache (Simulated)
        console.log('\n3. Tool level cache (One DB query)...');
        start = performance.now();
        const cached = await ComputedStatus.findOne({ timestamp: bucketed });
        const dummy = cached?.prediction;
        end = performance.now();
        console.log(`Full cache hit time: ${(end - start).toFixed(2)}ms`);

    } catch (err) {
        console.error(err);
    } finally {
        await disconnectFromDatabase();
    }
}

benchmark();
