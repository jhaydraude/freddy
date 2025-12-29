import { getGlucosePrediction } from './lib/prediction-logic.js';
import { connectToDatabase } from './db/connection.js';

async function main() {
    try {
        await connectToDatabase();
        const now = new Date();
        const prediction = await getGlucosePrediction(now, 120);
        console.log(JSON.stringify(prediction, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('Error running prediction:', error);
        process.exit(1);
    }
}

main();
