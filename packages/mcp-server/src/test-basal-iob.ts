import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { getBasalIOB } from './lib/iob-logic.js';
import { Treatment } from './db/models.js';

async function testBasalIOB() {
    console.log('--- NightManager Unified Basal IOB Test ---');
    try {
        await connectToDatabase();
        await Treatment.deleteMany({ eventType: { $in: ["Temp Basal", "Profile Switch"] } });

        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        // Scenario 1: Basic Basal IOB (No active temps/switches)
        console.log('\n--- Scenario 1: Basic Basal IOB (2hr window) ---');
        const res1 = await getBasalIOB(twoHoursAgo, now);
        console.log(`Scheduled IOB: ${res1.scheduledIOB} U`);
        console.log(`Delivered IOB: ${res1.deliveredIOB} U`);
        // Delivered should equal Scheduled here

        // Scenario 2: Temp Basal Active
        console.log('\n--- Scenario 2: Temp Basal active during window (1hr ago) ---');
        const t1 = new Treatment({
            eventType: "Temp Basal",
            created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
            duration: 30, // 30 minutes
            rate: 2.0,    // High rate
            enteredBy: "TestMocker"
        });
        await t1.save();

        const res2 = await getBasalIOB(twoHoursAgo, now);
        console.log(`Scheduled IOB: ${res2.scheduledIOB} U`);
        console.log(`Delivered IOB: ${res2.deliveredIOB} U`);
        console.log(`(Delivered ${res2.deliveredIOB} should be higher than Scheduled ${res2.scheduledIOB})`);

        // Scenario 3: Profile Switch and Temp Basal combined
        // Half basal profile switch 1.5 hrs ago
        console.log('\n--- Scenario 3: Profile Switch + Temp Basal ---');
        const s1 = new Treatment({
            eventType: "Profile Switch",
            created_at: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
            percentage: 50,
            enteredBy: "TestMocker"
        });
        await s1.save();

        const res3 = await getBasalIOB(twoHoursAgo, now);
        console.log(`Scheduled IOB: ${res3.scheduledIOB} U`);
        console.log(`Delivered IOB: ${res3.deliveredIOB} U`);

        // Cleanup
        await Treatment.deleteOne({ _id: t1._id });
        await Treatment.deleteOne({ _id: s1._id });

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('\n--- Test Complete ---');
    }
}

testBasalIOB();
