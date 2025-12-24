import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { getIOB } from './lib/iob-logic.js';
import { Treatment, Profile } from './db/models.js';

async function testAdvancedIOB() {
    console.log('--- NightManager Advanced IOB Test ---');
    try {
        await connectToDatabase();

        const now = new Date();
        const nowIso = now.toISOString();

        // 0. Ensure we have a profile with a known DIA
        // We'll use the existing database profile if it exists, or create a mock if needed.
        // For this test, we assume a DIA of 5.0.

        // 1. Bolus Only
        console.log('\n--- Case 1: Bolus Only ---');
        const b1 = new Treatment({
            eventType: "Correction Bolus",
            created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(), // 1 hour ago
            insulin: 10,
            enteredBy: "TestMocker"
        });
        await b1.save();

        const iobBolus = await getIOB(now);
        console.log(`IOB for 10.0 U bolus after 1 hour: ${iobBolus} U`);

        // 2. Basal Deviation Only
        console.log('\n--- Case 2: Basal Deviation Only ---');
        const t1 = new Treatment({
            eventType: "Temp Basal",
            created_at: new Date(now.getTime() - 120 * 60 * 1000).toISOString(), // 2 hours ago
            duration: 120, // 2 hours
            rate: 2.5, // High rate
            enteredBy: "TestMocker"
        });
        await t1.save();

        const iobBasalOnly = await getIOB(now);
        console.log(`IOB for Temp Basal deviation only: ${iobBasalOnly} U`);

        // 3. Combined
        console.log('\n--- Case 3: Combined ---');
        const iobCombined = await getIOB(now);
        console.log(`Combined IOB (Expected Bolus + Basal): ${iobCombined} U`);

        // Clean up everything at once
        await Treatment.deleteOne({ _id: b1._id });
        await Treatment.deleteOne({ _id: t1._id });

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('\n--- Test Complete ---');
    }
}

testAdvancedIOB();
