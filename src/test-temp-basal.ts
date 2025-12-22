import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { getBasalRate } from './lib/basal-logic.js';
import { Treatment } from './db/models.js';

async function testTempBasal() {
    console.log('--- NightManager Temp Basal Test ---');
    try {
        await connectToDatabase();

        const now = new Date();
        const nowIso = now.toISOString();

        // 1. Get baseline (no temp basal)
        const baseResult = await getBasalRate(now);
        console.log(`\nBaseline Basal Rate: ${JSON.stringify(baseResult, null, 2)}`);

        // 2. Mock an Absolute Temp Basal
        const absTemp = new Treatment({
            eventType: "Temp Basal",
            created_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), // 5 mins ago
            duration: 30, // 30 mins
            rate: 2.5,
            enteredBy: "TestMocker"
        });
        await absTemp.save();
        console.log(`\nCreated Absolute Temp Basal (2.5 U/hr)`);

        const resAfterAbs = await getBasalRate(now);
        console.log(`Rate with Absolute Temp Basal: ${JSON.stringify(resAfterAbs, null, 2)}`);
        if (resAfterAbs.activeRate === 2.5 && resAfterAbs.isTemp) {
            console.log("✅ Absolute Temp Basal SUCCESS");
        } else {
            console.log("❌ Absolute Temp Basal FAILURE");
        }

        // Clean up
        await Treatment.deleteOne({ _id: absTemp._id });

        // 3. Mock a Percentage Temp Basal (+50%)
        const perTemp = new Treatment({
            eventType: "Temp Basal",
            created_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
            duration: 30,
            percent: 50, // +50%
            enteredBy: "TestMocker"
        });
        await perTemp.save();
        console.log(`\nCreated Percentage Temp Basal (+50%)`);

        const resAfterPer = await getBasalRate(now);
        const expectedPer = Math.round(baseResult.activeRate * 1.5 * 1000) / 1000;
        console.log(`Rate with Percentage Temp Basal: ${JSON.stringify(resAfterPer, null, 2)} (Expected active: ${expectedPer})`);
        if (resAfterPer.activeRate === expectedPer && resAfterPer.isTemp) {
            console.log("✅ Percentage Temp Basal SUCCESS");
        } else {
            console.log("❌ Percentage Temp Basal FAILURE");
        }

        // Clean up
        await Treatment.deleteOne({ _id: perTemp._id });

        // 4. Mock an Expired Temp Basal
        const expTemp = new Treatment({
            eventType: "Temp Basal",
            created_at: new Date(now.getTime() - 40 * 60 * 1000).toISOString(), // 40 mins ago
            duration: 30, // lasted 30 mins
            rate: 5.0,
            enteredBy: "TestMocker"
        });
        await expTemp.save();
        console.log(`\nCreated Expired Temp Basal (5.0 U/hr, ended 10 mins ago)`);

        const resAfterExp = await getBasalRate(now);
        console.log(`Rate with Expired Temp Basal: ${JSON.stringify(resAfterExp, null, 2)}`);
        if (resAfterExp.activeRate === baseResult.activeRate && !resAfterExp.isTemp) {
            console.log("✅ Expired Temp Basal SUCCESS");
        } else {
            console.log("❌ Expired Temp Basal FAILURE");
        }

        // Clean up
        await Treatment.deleteOne({ _id: expTemp._id });

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('\n--- Test Complete ---');
    }
}

testTempBasal();
