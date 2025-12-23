import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getIOB, calculateInsulinEventCurve } from '../src/lib/iob-logic.js';

async function main() {
  await connectToDatabase();

  const now = new Date();
  console.log('Testing IOB Logic Refactor');
  console.log('==========================');
  console.log(`Target time: ${now.toISOString()}\n`);

  // Test getIOB
  const iobResult = await getIOB(now);

  console.log('IOB Result:');
  console.log(`  Timestamp: ${iobResult.timestamp}`);
  console.log(`  Units: ${iobResult.units}`);
  console.log(`  Lookback: ${iobResult.lookbackMinutes} minutes`);

  console.log('\n  Settings:');
  console.log(`    ISF: ${iobResult.settings.isf} ${iobResult.units}/U`);
  console.log(`    DIA: ${iobResult.settings.dia}h`);
  console.log(`    Autosens: ${iobResult.settings.autosensRatio} (Effective ISF: ${iobResult.settings.effectiveISF})`);

  console.log('\n  Calculated:');
  console.log(`    Total IOB: ${iobResult.calculated.totalIOB} U`);
  console.log(`    Bolus IOB: ${iobResult.calculated.bolusIOB} U`);
  console.log(`    Basal IOB: ${iobResult.calculated.basalIOB} U`);
  console.log(`    Glucose Impact: ${iobResult.calculated.glucoseImpact} ${iobResult.units}/5min`);

  console.log('\n  Reported (Device):');
  console.log(`    Total IOB: ${iobResult.reported.totalIOB} U`);
  console.log(`    Bolus IOB: ${iobResult.reported.bolusIOB} U`);
  console.log(`    Basal IOB: ${iobResult.reported.basalIOB} U`);
  console.log(`    Timestamp: ${iobResult.reported.timestamp}`);
  console.log('');

  // Test curve calculation for a sample bolus
  // 2U bolus, 30 min ago, 5 hour DIA
  console.log('Sample Curve (2U bolus, 30 min ago, 5hr DIA):');
  const sampleEvent = new Date(now.getTime() - 30 * 60 * 1000);
  const curve = calculateInsulinEventCurve(2, sampleEvent, now, 5, 'Bolus');
  console.log(`  Initial insulin: ${curve.initialInsulin}U`);
  console.log(`  Event time: ${curve.eventTime.toISOString()}`);
  console.log(`  IOB at target: ${curve.iobAtInterval[0]}U`);
  console.log(`  Curve length: ${curve.iobAtInterval.length} intervals`);

  // Show first few intervals of the curve
  console.log('  First 6 intervals (0 = now, 5 = 25min ago):');
  for (let i = 0; i < Math.min(6, curve.iobAtInterval.length); i++) {
    console.log(`    [${i}] ${i * 5}min before target: ${curve.iobAtInterval[i]}U`);
  }

  await disconnectFromDatabase();
}

main();
