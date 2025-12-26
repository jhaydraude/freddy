
import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getIOB, calculateInsulinActivityRate } from '../src/lib/iob-logic.js';

async function testIOB() {
  await connectToDatabase();

  const now = new Date();
  console.log('Testing IOB Logic');
  console.log('=================');
  console.log(`Target time: ${now.toISOString()}`);

  // 1. Get IOB (will trigger Fiasp/45m default if curve not found)
  const result = await getIOB(now, false); // Skip timeseries for quick test

  console.log(`Calculated IOB: ${result.calculated.totalIOB} U`);
  console.log(`Reported IOB: ${result.reported.totalIOB} U`);
  console.log(`Bolus IOB: ${result.calculated.bolusIOB} U`);
  console.log(`Basal IOB: ${result.calculated.basalIOB} U`);

  await disconnectFromDatabase();
}

testIOB().catch(console.error);
