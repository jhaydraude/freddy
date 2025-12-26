import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectToDatabase } from '../src/db/connection.js';
import { handler as getStatusHandler } from '../src/tools/get-status.js';

dotenv.config();

async function run() {
    try {
        await connectToDatabase();

        const timestamp = '2025-12-25T23:00:00-05:00';
        const result = await getStatusHandler({
            timestamp,
            includeAttribution: true,
            forceRecalculate: true
        });

        const status = JSON.parse(result.content[0].text);

        console.log('=== Status Diagnostic ===');
        console.log(`Glucose: ${status.glucose?.current?.sgv} ${status.glucose?.units}`);
        console.log(`IOB: ${status.iob?.calculated?.totalIOB} U`);
        console.log(`COB: ${status.cob?.calculated?.cob} g`);
        console.log(`ISF: ${status.iob?.settings?.effectiveISF}`);

        const iobTs = status.iob.timeseries;
        if (iobTs) {
            console.log('\n=== IOB Future Impacts (first 5) ===');
            const nowIdx = iobTs.timestamps.findIndex(ts => ts.includes('2025-12-26T04:00:00'));
            for (let i = nowIdx + 1; i < nowIdx + 6 && i < iobTs.glucoseImpact.length; i++) {
                console.log(`  ${iobTs.timestamps[i]}: ${iobTs.glucoseImpact[i]}`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
