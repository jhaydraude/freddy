import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { Entry, Treatment } from '../src/db/models.js';
import { getIOB } from '../src/lib/iob-logic.js';
import { resolveActiveProfile, getProfileStore, getValueAtTime } from '../src/lib/profile-logic.js';

async function main() {
    await connectToDatabase();

    console.log('Dynamic Absorption Proof of Concept');
    console.log('===================================');

    // 1. Fetch last 3 hours of glucose data
    const hours = 3;
    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const minDateEpoch = startTime.getTime();

    const entries = await Entry.find({
        date: { $gte: minDateEpoch },
        sgv: { $exists: true }
    }).sort({ date: 1 }).lean(); // Oldest first

    console.log(`Fetched ${entries.length} glucose entries.`);

    if (entries.length < 2) {
        console.log('Not enough data.');
        await disconnectFromDatabase();
        return;
    }

    // 2. Process interval by interval
    console.log('\nTime          BG    Delta   BGI (Insulin)   Dev (Unexplained)   Est. Carbs Absorbed');
    console.log('-----------------------------------------------------------------------------------');

    let totalEstCarbs = 0;

    for (let i = 1; i < entries.length; i++) {
        const curr = entries[i];
        const prev = entries[i - 1];

        if (!curr || !prev) continue;

        // Time diff in minutes
        const timeDiff = (curr.date - prev.date) / (1000 * 60);
        if (timeDiff < 4 || timeDiff > 6) continue; // Only look at ~5 min intervals

        const timestamp = curr.dateString || new Date(curr.date).toISOString();

        // 3. Get IOB/BGI for this timestamp
        const iobRes = await getIOB(timestamp);

        // Actual Delta
        const delta = curr.sgv - prev.sgv;

        // Deviation = Actual Delta - Expected Change (BGI)
        const deviation = delta - (-iobRes.calculated.glucoseImpact);

        // 4. Convert Deviation to Carbs
        // CSF (Carb Sensitivity Factor) = ISF / CR (mg/dL per gram)
        const csf = iobRes.settings.isf / 16;

        // Get actual CR from profile
        const profile = await resolveActiveProfile(timestamp);
        let cr = 10;
        if (profile) {
            const store = getProfileStore(profile.doc || undefined, profile.activeProfileName, profile.profileData || undefined);
            if (store) cr = getValueAtTime(store.carbratio, new Date(timestamp));
        }

        const sensitivity = iobRes.settings.isf / cr; // Rise per gram

        // Filter noise
        let estimatedCarbs = 0;
        if (deviation > 3) {
            estimatedCarbs = deviation / sensitivity;
        }

        if (estimatedCarbs > 0) totalEstCarbs += estimatedCarbs;

        console.log(
            `${timestamp.slice(11, 16)}   ` +
            `${curr.sgv.toString().padEnd(4)}  ` +
            `${delta > 0 ? '+' : ''}${delta.toString().padEnd(6)}  ` +
            `-${iobRes.calculated.glucoseImpact.toFixed(1).padEnd(12)}  ` +
            `${deviation > 0 ? '+' : ''}${deviation.toFixed(1).padEnd(17)}  ` +
            `${estimatedCarbs > 0 ? estimatedCarbs.toFixed(1) + 'g' : '-'}`
        );
    }

    console.log('-----------------------------------------------------------------------------------');
    console.log(`Total Estimated Absorption (last ${hours}h): ${totalEstCarbs.toFixed(1)}g`);

    await disconnectFromDatabase();
}

main();
