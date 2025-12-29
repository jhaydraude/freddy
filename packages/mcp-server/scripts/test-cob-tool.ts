
import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getCOB } from '../src/lib/cob-logic.js';

async function main() {
    await connectToDatabase();

    // Use a recent timestamp where we saw data in the inspection
    // Inspection saw data around 2025-12-29T07:51:30.547Z
    const testTime = '2025-12-29T07:51:30.547Z';

    console.log(`Testing getCOB for ${testTime}...`);
    const result = await getCOB(testTime, false);

    console.log('Result Reported Section:');
    console.log(JSON.stringify(result.reported, null, 2));

    await disconnectFromDatabase();
}

main();
