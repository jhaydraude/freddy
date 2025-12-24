import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { Entry } from '../src/db/models.js';

async function main() {
    await connectToDatabase();

    const count = await Entry.countDocuments({});
    console.log(`Total entries: ${count}`);

    const latest = await Entry.findOne({}).sort({ date: -1 }).lean();
    if (latest) {
        console.log('Latest entry:', latest);
        console.log('Latest date:', latest.date);
        console.log('Latest dateString:', latest.dateString);
    } else {
        console.log('No entries found.');
    }

    await disconnectFromDatabase();
}

main();
