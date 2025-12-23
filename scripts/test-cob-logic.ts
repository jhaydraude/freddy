import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getCOB, calculateCarbEventCurve } from '../src/lib/cob-logic.js';

async function main() {
    await connectToDatabase();

    const now = new Date();
    console.log('Testing COB Logic Refactor');
    console.log('==========================');
    console.log(`Target time: ${now.toISOString()}\n`);

    // Test getCOB
    const cobResult = await getCOB(now);

    console.log('COB Result:');
    console.log(`  Timestamp: ${cobResult.timestamp}`);
    console.log(`  Units: ${cobResult.units}`);
    console.log(`  Lookback: ${cobResult.lookbackMinutes} minutes`);

    console.log('\n  Settings:');
    console.log(`    ISF: ${cobResult.settings.isf} ${cobResult.units}/U`);
    console.log(`    CR: ${cobResult.settings.cr} g/U`);
    console.log(`    Min Carb Impact: ${cobResult.settings.minCarbImpact} mg/dL/5min`);

    console.log('\n  Calculated:');
    console.log(`    COB: ${cobResult.calculated.cob} g`);
    console.log(`    Glucose Impact: ${cobResult.calculated.glucoseImpact} ${cobResult.units}/5min`);
    console.log(`    Events: ${cobResult.calculated.eventCount} (Avg: ${cobResult.calculated.avgEventSize}g)`);
    console.log(`    Observed Deviation: ${cobResult.calculated.observedDeviation} mg/dL`);
    console.log(`    Est. Absorption: ${cobResult.calculated.estimatedAbsorption} g`);

    console.log('\n  Reported (Device):');
    console.log(`    COB: ${cobResult.reported.cob} g`);
    console.log(`    Timestamp: ${cobResult.reported.timestamp}`);
    console.log('');

    // Test curve calculation for a sample carb event
    // 10g at 30g/hour = 20 min to absorb. At 10 min, ~5g absorbed, 5g remaining
    console.log('Sample Curve (10g carbs, 10 min ago):');
    const sampleEvent = new Date(now.getTime() - 10 * 60 * 1000);
    const curve = calculateCarbEventCurve(10, sampleEvent, now);
    console.log(`  Initial carbs: ${curve.initialCarbs}g`);
    console.log(`  Event time: ${curve.carbEventTime.toISOString()}`);
    console.log(`  COB at target: ${curve.cobAtInterval[0]}g`);
    console.log(`  Carb absorption at target: ${curve.carbAbsorptionAtInterval[0]}g/5min`);
    console.log(`  Curve length: ${curve.cobAtInterval.length} intervals`);

    await disconnectFromDatabase();
}

main();
