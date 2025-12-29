import { connectToDatabase, disconnectFromDatabase } from '../db/connection.js';
import { Treatment } from '../db/models.js';

async function main() {
    await connectToDatabase();
    try {
        const mealBoluses = await Treatment.find({ eventType: 'Meal Bolus' }).lean();
        const carbCorrections = await Treatment.find({ eventType: 'Carb Correction' }).lean();

        console.log('--- EVENT TYPE DEEP DIVE ---');
        console.log(`Meal Bolus Count: ${mealBoluses.length}`);
        console.log(`Meal Boluses with Insulin: ${mealBoluses.filter((t: any) => t.insulin > 0).length}`);
        console.log(`Meal Boluses with Carbs: ${mealBoluses.filter((t: any) => t.carbs > 0).length}`);

        console.log(`\nCarb Correction Count: ${carbCorrections.length}`);
        console.log(`Carb Corrections with Insulin: ${carbCorrections.filter((t: any) => t.insulin > 0).length}`);
        console.log(`Carb Corrections with Carbs: ${carbCorrections.filter((t: any) => t.carbs > 0).length}`);

    } catch (error) {
        console.error('Error during deep dive:', error);
    } finally {
        await disconnectFromDatabase();
    }
}

main();
