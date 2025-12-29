import { connectToDatabase, disconnectFromDatabase } from '../db/connection.js';
import { Treatment } from '../db/models.js';

async function main() {
    await connectToDatabase();
    try {
        const query = {
            eventType: { $in: ['Carb Correction', 'Meal Bolus'] }
        };
        const treatments = await Treatment.find(query).lean();

        console.log(`Analyzing ${treatments.length} treatments (Carb Correction & Meal Bolus)...`);

        const durationRelatedFields = [
            'duration',
            'absorptionTime',
            'absorption_time',
            'timeshift',
            'delay',
            'originalDuration',
            'glucose_absorption_time'
        ];

        const stats: Record<string, { total: number, nonZero: number }> = {};
        durationRelatedFields.forEach(f => stats[f] = { total: 0, nonZero: 0 });

        const samples: Record<string, any[]> = {};
        durationRelatedFields.forEach(f => samples[f] = []);

        treatments.forEach((t: any) => {
            durationRelatedFields.forEach(f => {
                if (f in t) {
                    stats[f].total++;
                    if (t[f] !== 0 && t[f] !== null) {
                        stats[f].nonZero++;
                        if (samples[f].length < 3) samples[f].push({ id: t._id, eventType: t.eventType, value: t[f], carbs: t.carbs, insulin: t.insulin });
                    }
                }
            });
        });

        console.log('\n--- DURATION RELATED FIELDS STATS ---');
        Object.entries(stats).forEach(([field, stat]) => {
            const percent = ((stat.total / treatments.length) * 100).toFixed(1);
            console.log(`${field}:`);
            console.log(`  Presence: ${percent}% (${stat.total}/${treatments.length})`);
            console.log(`  Non-zero/Null: ${stat.nonZero}`);
            if (samples[field].length > 0) {
                console.log(`  Samples:`, JSON.stringify(samples[field], null, 2));
            }
        });

    } catch (error) {
        console.error('Error during duration field investigation:', error);
    } finally {
        await disconnectFromDatabase();
    }
}

main();
