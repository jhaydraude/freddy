import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { getIOB } from './lib/iob-logic.js';
import { Treatment } from './db/models.js';

async function testUnifiedIOB() {
    console.log('--- NightManager Unified IOB Integration Test ---');
    try {
        await connectToDatabase();
        // Clean up previous test data
        await Treatment.deleteMany({ eventType: { $in: ["Temp Basal", "Profile Switch", "Meal Bolus", "Correction Bolus"] } });

        const now = new Date();
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

        // 1. Bolus + Temp Basal Scenario
        console.log('\n--- Scenario: 5U Bolus (2hr ago) + 2.0U/hr Temp Basal (1hr ago) ---');

        await new Treatment({
            eventType: "Meal Bolus",
            insulin: 5,
            created_at: new Date(now.getTime() - 120 * 60 * 1000).toISOString(),
            enteredBy: "TestMocker"
        }).save();

        await new Treatment({
            eventType: "Temp Basal",
            duration: 60,
            rate: 2.0,
            created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
            enteredBy: "TestMocker"
        }).save();

        const res = await getIOB(now);
        console.log(`Delivered IOB: ${res.deliveredIOB} U`);
        console.log(`Scheduled Basal IOB: ${res.scheduledBasalIOB} U`);
        console.log(`Net IOB: ${res.netIOB} U`);

        // 2. High Activity Profile Switch (Lower Basal)
        console.log('\n--- Scenario: 50% Profile Switch active ---');
        await new Treatment({
            eventType: "Profile Switch",
            percentage: 50,
            created_at: new Date(now.getTime() - 180 * 60 * 1000).toISOString(),
            enteredBy: "TestMocker"
        }).save();

        const res2 = await getIOB(now);
        console.log(`Delivered IOB: ${res2.deliveredIOB} U`);
        console.log(`Scheduled Basal IOB: ${res2.scheduledBasalIOB} U`);
        console.log(`Net IOB: ${res2.netIOB} U`);

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('\n--- Test Complete ---');
    }
}

testUnifiedIOB();
