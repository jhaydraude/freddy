import { connectToDatabase } from '../lib/db/connection';
import { SituationWindow } from '../lib/db/models';

async function clearQueue() {
    console.log('Connecting to MongoDB...');
    await connectToDatabase();
    console.log('Clearing pending windows...');
    const res = await SituationWindow.deleteMany({ status: 'pending' });
    console.log(`Deleted ${res.deletedCount} pending windows.`);
    process.exit(0);
}

clearQueue().catch(err => {
    console.error(err);
    process.exit(1);
});
