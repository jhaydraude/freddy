import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getStatusHistory } from '../src/lib/history-logic.js';

async function main() {
    await connectToDatabase();

    // Check the timeframe from the screenshot: Dec 29, 00:19 to 03:19
    const endTime = '2025-12-29T03:19:00.000Z';
    const history = await getStatusHistory({
        startTime: endTime,
        windowSize: 180, // 3 hours
        bucketSize: 5
    });

    console.log(`Fetched ${history.length} status records from screenshot timeframe\n`);

    history.forEach((status, idx) => {
        const timestamp = new Date(status.meta.status_date);
        const timeStr = timestamp.toISOString().substring(11, 16); // HH:MM
        const cob = status.cob?.calculated?.cob;

        // Only print if COB is 0 or very low (< 1)
        if (cob !== null && cob !== undefined && cob < 1) {
            console.log(`[${timeStr}] COB: ${cob} ⚠️ DROPPED TO NEAR ZERO`);
        } else if (cob === 0 || cob === null || cob === undefined) {
            console.log(`[${timeStr}] COB: ${cob ?? 'NULL'} ❌ ZERO OR NULL`);
        }
    });

    console.log('\nAll COB values:');
    history.forEach((status) => {
        const timestamp = new Date(status.meta.status_date);
        const timeStr = timestamp.toISOString().substring(11, 16);
        const cob = status.cob?.calculated?.cob;
        console.log(`${timeStr}: ${cob ?? 'NULL'}`);
    });

    await disconnectFromDatabase();
}

main();
