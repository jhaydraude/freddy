import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getStatus } from '../src/lib/status-logic.js';

async function main() {
    await connectToDatabase();

    // Check one of the timestamps that appears to drop in the screenshot
    const timestamp = '2025-12-29T01:14:00.000Z'; // COB was 31.3

    const status = await getStatus(timestamp, false, false);

    console.log('Status structure:');
    console.log(JSON.stringify({
        timestamp: status.meta.status_date,
        cob: {
            calculated: {
                cob: status.cob.calculated.cob,
                pendingCOB: status.cob.calculated.pendingCOB,
                activeCOB: status.cob.calculated.activeCOB,
            },
            reported: status.cob.reported
        },
        iob: {
            calculated: {
                totalIOB: status.iob.calculated.totalIOB
            }
        }
    }, null, 2));

    await disconnectFromDatabase();
}

main();
