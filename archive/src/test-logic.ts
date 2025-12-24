import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { resolveActiveProfile, getProfileStore } from './lib/profile-logic.js';
import { getBasalFromSchedule } from './lib/basal-logic.js';

async function testLogic() {
    console.log('--- NightManager Logic Test ---');
    try {
        await connectToDatabase();

        const now = new Date();
        const result = await resolveActiveProfile(now);
        if (!result) {
            console.log('No profile found!');
            return;
        }
        const profileDoc = result.doc;
        if (!profileDoc) {
            console.log('No profile found!');
            return;
        }

        console.log(`Resolved Profile: ${profileDoc.startDate} (Default: ${profileDoc.defaultProfile})`);

        const store = getProfileStore(profileDoc);
        if (!store) {
            console.log('Profile store not found!');
            return;
        }

        console.log('Profile Details:');
        console.log(`- DIA: ${store.dia}`);
        console.log(`- Units: ${store.units}`);

        const scheduledBasal = getBasalFromSchedule(store.basal, now);
        console.log(`Scheduled Basal at ${now.getHours()}:${now.getMinutes()}: ${scheduledBasal} U/hr`);

    } catch (err) {
        console.error('Logic test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('--- Test Complete ---');
    }
}

testLogic();
