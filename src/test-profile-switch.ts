import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { resolveActiveProfile, getProfileStore } from './lib/profile-logic.js';

async function testProfileSwitch() {
    console.log('--- NightManager Profile Switch Test ---');
    try {
        await connectToDatabase();

        const now = new Date();
        console.log('Resolving Active Profile for:', now.toISOString());

        const result = await resolveActiveProfile(now);
        if (!result) {
            console.log('No profile found!');
            return;
        }

        const { doc, activeProfileName } = result;
        console.log(`Base Profile Doc: ${doc.startDate}`);
        console.log(`Default Profile: ${doc.defaultProfile}`);
        console.log(`ACTIVE Profile: ${activeProfileName}`);

        if (activeProfileName !== doc.defaultProfile) {
            console.log('✅ Override detected and applied!');
        } else {
            console.log('ℹ️ Using default profile (no switch found).');
        }

        const store = getProfileStore(doc, activeProfileName);
        if (store) {
            console.log(`- Units: ${store.units}`);
            console.log(`- DIA: ${store.dia}`);
        }

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('--- Test Complete ---');
    }
}

testProfileSwitch();
