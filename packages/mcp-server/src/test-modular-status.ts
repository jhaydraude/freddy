import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { getLatestGlucose, getStatus } from './lib/status-logic.js';

async function testModularStatus() {
    console.log('--- NightManager Modular Status Logic Test ---');
    try {
        await connectToDatabase();

        // 1. Test Latest Glucose
        console.log('\n--- Scenario: Latest 1 Glucose via Library ---');
        const glucose = await getLatestGlucose(1);
        console.log(JSON.stringify(glucose, null, 2));

        // 2. Test System Status
        console.log('\n--- Scenario: System Status via Library ---');
        const status = await getStatus(new Date());
        console.log(JSON.stringify(status, null, 2));

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('\n--- Test Complete ---');
    }
}

testModularStatus();
