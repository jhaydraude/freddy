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
    // @ts-ignore
    console.log(`    Calculated Rate: ${cobResult.settings.absorptionRate} g/5min`);

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

    // Test curve calculation for a sample carb event with DEFAULT rate
    // 10g at 30g/hour = 20 min to absorb.
    console.log('Sample Curve (Default 30g/hr):');
    const sampleEvent = new Date(now.getTime() - 10 * 60 * 1000);
    const curve = calculateCarbEventCurve(10, sampleEvent, now);
    console.log(`  Initial carbs: ${curve.initialCarbs}g`);
    console.log(`  COB at target (10min): ${curve.cobAtInterval[0]}g`);
    console.log(`  Absorbed (10min): ${10 - curve.cobAtInterval[0]!}g`);

    // Test curve calculation with CUSTOM rate (e.g. 60g/hr = 5g/5min)
    console.log('\nSample Curve (Fast 60g/hr = 5g/5min):');
    const curveFast = calculateCarbEventCurve(10, sampleEvent, now, 5);
    console.log(`  Initial carbs: ${curveFast.initialCarbs}g`);
    console.log(`  COB at target (10min): ${curveFast.cobAtInterval[0]}g`);
    // Should be 0 because 10g absorbs in 10 mins at 60g/hr
    console.log(`  Absorbed (10min): ${10 - curveFast.cobAtInterval[0]!}g`);

    await disconnectFromDatabase();
}

main();
