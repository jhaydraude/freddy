import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getStatusHistory } from '../src/lib/history-logic.js';

async function main() {
    await connectToDatabase();

    // Get 30 minutes of history
    const now = new Date().toISOString();
    const history = await getStatusHistory({
        startTime: now,
        windowSize: 30,
        bucketSize: 5
    });

    console.log(`Fetched ${history.length} status records\n`);

    history.forEach((status, idx) => {
        const timestamp = status.meta.status_date;
        const cob = status.cob?.calculated?.cob;
        const pendingCOB = status.cob?.calculated?.pendingCOB;
        const activeCOB = status.cob?.calculated?.activeCOB;

        console.log(`[${idx}] ${timestamp}`);
        console.log(`    COB: ${cob ?? 'NULL'}`);
        console.log(`    Pending: ${pendingCOB ?? 'NULL'}`);
        console.log(`    Active: ${activeCOB ?? 'NULL'}`);
        console.log(`    Has timeseries: ${status.cob?.timeseries ? 'YES' : 'NO'}`);
        if (status.cob?.timeseries) {
            console.log(`    Timeseries length: ${status.cob.timeseries.length}`);
        }
        console.log('');
    });

    await disconnectFromDatabase();
}

main();
