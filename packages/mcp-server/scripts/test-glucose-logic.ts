import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getGlucose } from '../src/lib/status-logic.js';

async function main() {
    await connectToDatabase();

    const now = new Date();
    console.log('Testing Glucose Structure Refactor');
    console.log('===================================');
    console.log(`Target time: ${now.toISOString()}\n`);

    const glucoseResults = await getGlucose({ timestamp: now, count: 1 });

    if (glucoseResults.length === 0) {
        console.log('No glucose data found');
        await disconnectFromDatabase();
        return;
    }

    const result = glucoseResults[0];

    console.log('Glucose Result:');
    console.log(`  Timestamp: ${result.timestamp}`);
    console.log(`  Units: ${result.units}`);

    console.log('\n  Current:');
    console.log(`    SGV: ${result.current.sgv} ${result.units}`);
    console.log(`    Direction: ${result.current.direction}`);
    console.log(`    Trend: ${result.current.trend}`);
    console.log(`    Delta 5m: ${result.current.delta5m !== null ? result.current.delta5m + ' ' + result.units : 'N/A'}`);
    console.log(`    Delta 10m: ${result.current.delta10m !== null ? result.current.delta10m + ' ' + result.units : 'N/A'}`);
    console.log(`    Delta 15m: ${result.current.delta15m !== null ? result.current.delta15m + ' ' + result.units : 'N/A'}`);
    console.log(`    Rate of Change: ${result.current.rateOfChange !== null ? result.current.rateOfChange + ' ' + result.units + '/min' : 'N/A'}`);

    console.log('\n  Sensor:');
    console.log(`    Age: ${result.sensor.age !== null ? result.sensor.age + 'h' : 'N/A'}`);
    console.log(`    Device: ${result.sensor.device}`);
    console.log(`    Noise: ${result.sensor.noise ?? 'N/A'}`);
    console.log(`    RSSI: ${result.sensor.rssi ?? 'N/A'}`);
    if (result.sensor.calibration) {
        console.log(`    Last Cal: ${result.sensor.calibration.mbg} mg/dL (${result.sensor.calibration.timeSince} min ago)`);
    }

    console.log('\n  Reported (Device):');
    console.log(`    BG: ${result.reported.bg ?? 'N/A'}`);
    console.log(`    Eventual BG: ${result.reported.eventualBG ?? 'N/A'}`);
    console.log(`    Timestamp: ${result.reported.timestamp || 'N/A'}`);

    console.log('\n  Statistics (30m):');
    console.log(`    Mean: ${result.statistics.mean30m !== null ? result.statistics.mean30m + ' ' + result.units : 'N/A'}`);
    console.log(`    Std Dev: ${result.statistics.std30m !== null ? result.statistics.std30m.toFixed(1) + ' ' + result.units : 'N/A'}`);
    console.log(`    CV: ${result.statistics.cv30m !== null ? result.statistics.cv30m + '%' : 'N/A'}`);
    console.log(`    Time in Range:`);
    console.log(`      Low: ${result.statistics.timeInRange.low}%`);
    console.log(`      Target: ${result.statistics.timeInRange.target}%`);
    console.log(`      High: ${result.statistics.timeInRange.high}%`);

    await disconnectFromDatabase();
}

main();
