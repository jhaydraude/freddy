import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectToDatabase } from '../src/db/connection.js';
import { handler as getStatusHandler } from '../src/tools/get-status.js';

dotenv.config();

async function run() {
    try {
        await connectToDatabase();

        const timestamp = '2025-12-25T22:00:00-05:00';
        console.log(`Running attribution for ${timestamp}...\n`);

        const result = await getStatusHandler({
            timestamp,
            includeAttribution: true,
            forceRecalculate: true
        });

        const status = JSON.parse(result.content[0].text);

        console.log('=== Status Overview ===');
        console.log(`Glucose: ${status.glucose?.current?.sgv} ${status.glucose?.units} (${status.glucose?.current?.direction})`);
        console.log(`IOB: ${status.iob?.calculated?.totalIOB} U`);
        console.log(`COB: ${status.cob?.calculated?.cob} g`);
        console.log('');

        if (status.attribution) {
            console.log('=== Glucose Change Attribution ===');
            for (const [timeframe, data] of Object.entries(status.attribution)) {
                if (!data) continue;
                const attr = data as any;
                console.log(`\n[${timeframe}]`);
                console.log(`  Actual Change:    ${attr.glucoseChange?.actual} mg/dL`);
                console.log(`  Predicted Change: ${attr.glucoseChange?.predicted} mg/dL`);
                console.log(`  Unexplained:      ${attr.components?.unexplained} mg/dL`);
                console.log('  Components:');
                console.log(`    Insulin Impact: ${attr.components?.insulin?.value} mg/dL`);
                console.log(`    Carb Impact:    ${attr.components?.carbs?.value} mg/dL`);
                console.log(`    Basal Impact:   ${attr.components?.basal?.value} mg/dL`);
            }
        } else {
            console.log('No attribution data returned.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
