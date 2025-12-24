import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { Entry, Treatment, Profile } from './db/models.js';

async function testConnection() {
    console.log('--- NightManager Data Probe ---');
    try {
        await connectToDatabase();

        const entryCount = await Entry.countDocuments();
        console.log(`Entries found: ${entryCount}`);
        if (entryCount > 0) {
            const latestEntry = await Entry.findOne().sort({ date: -1 });
            console.log('Latest Glucose:', latestEntry?.sgv, 'at', latestEntry?.dateString);
        }

        const treatmentCount = await Treatment.countDocuments();
        console.log(`Treatments found: ${treatmentCount}`);
        if (treatmentCount > 0) {
            const latestTreatment = await Treatment.findOne().sort({ created_at: -1 });
            console.log('Latest Treatment:', latestTreatment?.eventType, 'at', latestTreatment?.created_at);
        }

        const profileCount = await Profile.countDocuments();
        console.log(`Profiles found: ${profileCount}`);
        if (profileCount > 0) {
            const activeProfile = await Profile.findOne().sort({ startDate: -1 });
            console.log('Latest Profile StartDate:', activeProfile?.startDate);
            console.log('Default Profile Name:', activeProfile?.defaultProfile);
        }

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('--- Probe Complete ---');
    }
}

testConnection();
