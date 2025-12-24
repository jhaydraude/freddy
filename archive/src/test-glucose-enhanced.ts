import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { Entry } from './db/models.js';

async function testEnhancedGlucose() {
    console.log('--- NightManager Enhanced Glucose Test ---');
    try {
        await connectToDatabase();

        // 1. Fetch latest with 1 count
        console.log('\n--- Scenario: Latest 1 Glucose ---');
        // We'll simulate what the tool does
        const count = 1;
        const fetchCount = 3;
        const entries = await Entry.find().sort({ date: -1 }).limit(fetchCount);

        if (entries.length === 0) {
            console.log('No entries found.');
        } else {
            const enrichedEntries = entries.slice(0, count).map((entry, index) => {
                const entryIdx = index;
                const prev5m = entries[entryIdx + 1];
                const prev10m = entries[entryIdx + 2];

                let delta5m: number | null = null;
                let delta10m: number | null = null;

                if (prev5m && Math.abs(entry.date - prev5m.date) <= 7 * 60 * 1000) {
                    delta5m = Math.round((entry.sgv - prev5m.sgv) * 10) / 10;
                }
                if (prev10m && Math.abs(entry.date - prev10m.date) <= 12 * 60 * 1000) {
                    delta10m = Math.round((entry.sgv - prev10m.sgv) * 10) / 10;
                }

                return {
                    sgv: entry.sgv,
                    dateString: entry.dateString,
                    direction: entry.direction,
                    trend: entry.trend,
                    delta5m,
                    delta10m
                };
            });
            console.log(JSON.stringify(enrichedEntries, null, 2));
        }

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await disconnectFromDatabase();
        console.log('\n--- Test Complete ---');
    }
}

testEnhancedGlucose();
