import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { getScheduledBasalIOB } from './lib/basal-logic.js';
import { Treatment, Profile } from './db/models.js';

async function testScheduledBasalIOB() {
    console.log('--- NightManager Scheduled Basal IOB Test ---');
    try {
        await connectToDatabase();

        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

        // Scenario 1: Basic Scheduled Basal IOB over last 2 hours
        // We assume 5h DIA, so the window will be full (2 hours).
        console.log('\n--- Scenario 1: Basic Scheduled IOB (2hr window) ---');
        const iob1 = await getScheduledBasalIOB(twoHoursAgo, now);
        console.log(`Scheduled IOB for last 2 hours: ${iob1} U`);

        // Scenario 2: Switch mid-window
        // We'll insert a Profile Switch that happened 1 hour ago.
        console.log('\n--- Scenario 2: Profile Switch mid-window (1hr ago) ---');
        const s1 = new Treatment({
            eventType: "Profile Switch",
            created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
            profile: "High Activity",
            percentage: 50, // Should half the basal
            enteredBy: "TestMocker"
        });
        await s1.save();

        const iob2 = await getScheduledBasalIOB(twoHoursAgo, now);
        console.log(`Scheduled IOB (2hr window with 50% switch 1hr ago): ${iob2} U`);
        console.log(`(Should be lower than ${iob1})`);

        // Scenario 3: Switch expired mid-window
        // Switch started 1.5 hrs ago, lasted 30 mins (so expired 1 hr ago)
        console.log('\n--- Scenario 3: Switch expired mid-window ---');
        const s2 = new Treatment({
            eventType: "Profile Switch",
            created_at: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
            duration: 30, // 30 mins
            profile: "Low Activity",
            percentage: 200, // Double basal
            enteredBy: "TestMocker"
        });
        await s2.save();

        const iob3 = await getScheduledBasalIOB(twoHoursAgo, now);
        console.log(`Scheduled IOB (with expired double switch): ${iob3} U`);

        // Cleanup
        await Treatment.deleteOne({ _id: s1._id });
        await Treatment.deleteOne({ _id: s2._id });

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('\n--- Test Complete ---');
    }
}

testScheduledBasalIOB();
