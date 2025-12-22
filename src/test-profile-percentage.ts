import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { Treatment } from './db/models.js';
import { resolveActiveProfile } from './lib/profile-logic.js';

async function testProfilePercentage() {
    console.log('--- NightManager Profile Percentage Test ---');
    try {
        await connectToDatabase();

        const now = new Date();

        // Mock profile data
        const baseProfileData = {
            dia: 5,
            units: "mg/dL",
            basal: [{ time: "00:00", value: 1.0 }],
            sens: [{ time: "00:00", value: 50.0 }], // ISF
            carbratio: [{ time: "00:00", value: 10.0 }] // I:C
        };

        // 1. Test 130% Percentage Switch
        console.log('\n--- Case 1: 130% Profile Switch ---');
        const switch130 = new Treatment({
            eventType: "Profile Switch",
            created_at: now.toISOString(), // CURRENT TIME
            duration: 60,
            percentage: 130,
            profileJson: JSON.stringify(baseProfileData),
            enteredBy: "TestMocker130"
        });
        await switch130.save();

        const res130 = await resolveActiveProfile(now);
        if (res130 && res130.profileData) {
            const p = res130.profileData;
            const factor = 1.3;
            const bVal = p.basal?.[0]?.value;
            const sVal = p.sens?.[0]?.value;
            const cVal = p.carbratio?.[0]?.value;

            console.log(`Basal: ${bVal} (Expected: ${1.0 * factor})`);
            console.log(`Sens (ISF): ${sVal} (Expected: ${Math.round(50 / factor * 100) / 100})`);
            console.log(`CarbRatio (I:C): ${cVal} (Expected: ${Math.round(10 / factor * 100) / 100})`);

            if (bVal === 1.3 && sVal === 38.46 && cVal === 7.69) {
                console.log('✅ SUCCESS: 130% adjustment applied correctly.');
            } else {
                console.log('❌ FAILURE: 130% adjustment mismatch.');
            }
        } else {
            console.log('❌ FAILURE: res130 or profileData is null');
        }
        await Treatment.deleteOne({ _id: switch130._id });

        // 2. Test 80% Percentage Switch
        console.log('\n--- Case 2: 80% Profile Switch ---');
        const switch80 = new Treatment({
            eventType: "Profile Switch",
            created_at: now.toISOString(), // CURRENT TIME
            duration: 60,
            percentage: 80,
            profileJson: JSON.stringify(baseProfileData),
            enteredBy: "TestMocker80"
        });
        await switch80.save();

        const res80 = await resolveActiveProfile(now);
        if (res80 && res80.profileData) {
            const p = res80.profileData;
            const factor = 0.8;
            const bVal = p.basal?.[0]?.value;
            const sVal = p.sens?.[0]?.value;
            const cVal = p.carbratio?.[0]?.value;

            console.log(`Basal: ${bVal} (Expected: ${1.0 * factor})`);
            console.log(`Sens (ISF): ${sVal} (Expected: ${Math.round(50 / factor * 100) / 100})`);
            console.log(`CarbRatio (I:C): ${cVal} (Expected: ${Math.round(10 / factor * 100) / 100})`);

            if (bVal === 0.8 && sVal === 62.5 && cVal === 12.5) {
                console.log('✅ SUCCESS: 80% adjustment applied correctly.');
            } else {
                console.log('❌ FAILURE: 80% adjustment mismatch.');
            }
        } else {
            console.log('❌ FAILURE: res80 or profileData is null');
        }
        await Treatment.deleteOne({ _id: switch80._id });

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('\n--- Test Complete ---');
    }
}

testProfilePercentage();
