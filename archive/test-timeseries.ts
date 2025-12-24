/**
 * Test IOB and COB timeseries functionality
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getIOB } from './src/lib/iob-logic.js';
import { getCOB } from './src/lib/cob-logic.js';

dotenv.config();

async function testTimeseries() {
    await mongoose.connect(process.env.MONGO_URI!);

    console.log('\n=== Testing IOB and COB Timeseries ===\n');

    // Test 1: IOB without timeseries
    console.log('Test 1: IOB without timeseries');
    const iobNoTS = await getIOB(new Date(), false);
    console.log(`✓ Current IOB: ${iobNoTS.calculated.totalIOB} U`);
    console.log(`✓ Has timeseries: ${iobNoTS.timeseries ? 'YES' : 'NO (expected)'}`);

    // Test 2: IOB with timeseries
    console.log('\nTest 2: IOB with timeseries');
    const iobWithTS = await getIOB(new Date(), true);
    console.log(`✓ Current IOB: ${iobWithTS.calculated.totalIOB} U`);
    console.log(`✓ Has timeseries: ${iobWithTS.timeseries ? 'YES (expected)' : 'NO'}`);

    if (iobWithTS.timeseries) {
        const ts = iobWithTS.timeseries;
        console.log(`  - Length: ${ts.length} intervals`);
        console.log(`  - Time range: ${ts.startTime} to ${ts.endTime}`);
        console.log(`  - Latest 3 IOB values: ${ts.totalIOB.slice(-3).join(', ')}`);
        console.log(`  - Latest 3 activity values: ${ts.activity.slice(-3).join(', ')}`);
        console.log(`  - Latest 3 glucose impacts: ${ts.glucoseImpact.slice(-3).join(', ')}`);
    }

    // Test 3: COB without timeseries
    console.log('\nTest 3: COB without timeseries');
    const cobNoTS = await getCOB(new Date(), false);
    console.log(`✓ Current COB: ${cobNoTS.calculated.cob} g`);
    console.log(`✓ Has timeseries: ${cobNoTS.timeseries ? 'YES' : 'NO (expected)'}`);

    // Test 4: COB with timeseries
    console.log('\nTest 4: COB with timeseries');
    const cobWithTS = await getCOB(new Date(), true);
    console.log(`✓ Current COB: ${cobWithTS.calculated.cob} g`);
    console.log(`✓ Has timeseries: ${cobWithTS.timeseries ? 'YES (expected)' : 'NO'}`);

    if (cobWithTS.timeseries) {
        const ts = cobWithTS.timeseries;
        console.log(`  - Length: ${ts.length} intervals`);
        console.log(`  - Time range: ${ts.startTime} to ${ts.endTime}`);
        console.log(`  - Latest 3 COB values: ${ts.totalCOB.slice(-3).join(', ')}`);
        console.log(`  - Latest 3 absorption values: ${ts.carbAbsorption.slice(-3).join(', ')}`);
        console.log(`  - Latest 3 glucose impacts: ${ts.glucoseImpact.slice(-3).join(', ')}`);
    }

    console.log('\n=== All Timeseries Tests Complete ===\n');

    await mongoose.disconnect();
}

testTimeseries().catch(console.error);
