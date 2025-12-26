import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectToDatabase } from '../src/db/connection.js';
import { handler as predictGlucoseHandler } from '../src/tools/predict-glucose.js';

dotenv.config();

async function run() {
    try {
        await connectToDatabase();

        const timestamp = '2025-12-25T23:00:00-05:00';
        console.log(`Running prediction for ${timestamp}...\n`);

        const result = await predictGlucoseHandler({
            timestamp,
            forceRecalculate: true
        });

        const output = JSON.parse(result.content[0].text);

        console.log('=== Prediction Overview ===');
        console.log(`Timestamp: ${output.timestamp}`);
        console.log(`Prediction Length: ${output.prediction?.length} intervals`);

        if (output.prediction && output.prediction.length > 0) {
            console.log('\n=== Samples (every 30 mins) ===');
            for (let i = 0; i < output.prediction.length; i += 6) {
                const p = output.prediction[i];
                console.log(`  ${p.timestamp}: ${p.sgv}`);
            }

            const last = output.prediction[output.prediction.length - 1];
            console.log(`\n  Final (${last.timestamp}): ${last.sgv}`);
        } else {
            console.log('No prediction data returned.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
