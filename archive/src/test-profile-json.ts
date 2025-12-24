import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { Treatment } from './db/models.js';
import { resolveActiveProfile, getProfileStore } from './lib/profile-logic.js';

async function testProfileJsonOverride() {
    console.log('--- NightManager ProfileJson Override Test ---');
    try {
        await connectToDatabase();

        const now = new Date();
        const nowIso = now.toISOString();

        // 1. Mock a Profile Switch with profileJson
        // We'll create a fake test profile data
        const testProfileData = {
            dia: 4.5,
            units: "mg/dL",
            basal: [{ time: "00:00", value: 1.23 }],
            carbratio: [{ time: "00:00", value: 10 }],
            sens: [{ time: "00:00", value: 50 }],
            target_low: [{ time: "00:00", value: 80 }],
            target_high: [{ time: "00:00", value: 120 }]
        };

        const switchEvent = new Treatment({
            eventType: "Profile Switch",
            created_at: new Date(now.getTime() - 10 * 60 * 1000).toISOString(), // 10 mins ago
            duration: 60, // 60 mins
            profile: "TestOverrideProfile",
            profileJson: JSON.stringify(testProfileData),
            enteredBy: "TestMocker"
        });
        await switchEvent.save();
        console.log(`\nCreated Profile Switch with profileJson (Direct Override)`);

        const result = await resolveActiveProfile(now);
        console.log(`\nResolved Profile Name: ${result?.activeProfileName}`);

        if (result?.profileData) {
            console.log(`✅ profileData found in result!`);
            console.log(`- DIA: ${result.profileData.dia} (Expected: 4.5)`);

            const store = getProfileStore(undefined, undefined, result.profileData);
            console.log(`- Basal[0].value: ${store?.basal[0]?.value} (Expected: 1.23)`);

            if (result.profileData.dia === 4.5 && store?.basal[0]?.value === 1.23) {
                console.log(`\n🎉 SUCCESS: profileJson correctly overridden and parsed!`);
            } else {
                console.log(`\n❌ FAILURE: Data mismatch.`);
            }
        } else {
            console.log(`\n❌ FAILURE: profileData NOT found in resolveActiveProfile result.`);
        }

        // Clean up
        await Treatment.deleteOne({ _id: switchEvent._id });

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('\n--- Test Complete ---');
    }
}

testProfileJsonOverride();
