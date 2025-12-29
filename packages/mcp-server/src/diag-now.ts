import { connectToDatabase } from './db/connection.js';
import { handler as getStatusHandler } from './tools/get-status.js';
import mongoose from 'mongoose';

async function main() {
    try {
        await connectToDatabase();
        const now = new Date();
        const result = await getStatusHandler({
            timestamp: now.toISOString(),
            includeAttribution: true,
            forceRecalculate: true
        });

        const status = JSON.parse(result.content[0].text);

        console.log('=== Current Status Diagnostic ===');
        console.log(`Time: ${now.toISOString()}`);
        console.log(`Glucose: ${status.glucose?.current?.sgv} ${status.glucose?.units}`);
        console.log(`IOB: ${status.iob?.calculated?.totalIOB} U`);
        console.log(`COB: ${status.cob?.calculated?.cob} g`);
        console.log(`Basal: ${status.pump?.basal?.activeRate} U/h (Scheduled: ${status.pump?.basal?.scheduledRate} U/h)`);
        console.log(`ISF: ${status.iob?.settings?.effectiveISF}`);
        console.log(`CR: ${status.cob?.settings?.effectiveCR}`);

        if (status.attribution?.timeframes) {
            console.log('\n=== Attribution (30m) ===');
            const attr30m = status.attribution.timeframes.find(tf => tf.minutes === 30);
            if (attr30m) {
                console.log(`Units: ${status.glucose.units}`);
                console.log(`Actual Change: ${attr30m.glucoseChange.actual}`);
                console.log(`Predicted Change: ${attr30m.glucoseChange.predicted}`);
                console.log('Components:');
                console.log(JSON.stringify(attr30m.components, null, 2));
            }
        }

        const iobTs = status.iob?.timeseries;
        if (iobTs) {
            console.log('\n=== Next 30m IOB Impacts (mg/dL) ===');
            let totalImpact = 0;
            const nowTime = now.getTime();
            for (let i = 0; i < iobTs.timestamps.length; i++) {
                const ts = new Date(iobTs.timestamps[i]).getTime();
                if (ts > nowTime && ts <= nowTime + 30 * 60 * 1000) {
                    console.log(`  ${iobTs.timestamps[i]}: ${iobTs.glucoseImpact[i]}`);
                    totalImpact += iobTs.glucoseImpact[i];
                }
            }
            console.log(`Total 30m IOB Impact: ${totalImpact.toFixed(1)} mg/dL`);
        }

        const cobTs = status.cob?.timeseries;
        if (cobTs) {
            console.log('\n=== Next 30m COB Impacts (mg/dL) ===');
            let totalImpact = 0;
            const nowTime = now.getTime();
            for (let i = 0; i < cobTs.timestamps.length; i++) {
                const ts = new Date(cobTs.timestamps[i]).getTime();
                if (ts > nowTime && ts <= nowTime + 30 * 60 * 1000) {
                    console.log(`  ${cobTs.timestamps[i]}: ${cobTs.glucoseImpact[i]}`);
                    totalImpact += cobTs.glucoseImpact[i];
                }
            }
            console.log(`Total 30m COB Impact: ${totalImpact.toFixed(1)} mg/dL`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error running diagnostic:', error);
        process.exit(1);
    }
}

main();
