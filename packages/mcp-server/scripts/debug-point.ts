
import { getStatus } from '../../webapp/lib/logic/status-logic.js';
import { getGlucosePrediction } from '../../webapp/lib/logic/prediction-logic.js';
import { attributeGlucoseChange } from '../../webapp/lib/logic/attribution-logic.js';
import { connectToDatabase } from '../../webapp/lib/db/connection.js';

async function debugPoint(timestamp: string) {
    await connectToDatabase();

    console.log(`\n=== DEBUGGING POINT: ${timestamp} ===`);

    const status = await getStatus(timestamp, true);
    const attribution = await attributeGlucoseChange(status);
    const prediction = await getGlucosePrediction(timestamp, 60);

    const attr30 = attribution.timeframes.find(tf => tf.minutes === 30);
    console.log('\nAttribution (30m):');
    console.log(`- Actual Change: ${attr30?.glucoseChange.actual}`);
    console.log(`- Predicted Change: ${attr30?.glucoseChange.predicted}`);
    console.log(`- Unexplained: ${attr30?.components.unexplained}`);
    console.log(`- Insulin Impact: ${attr30?.components.insulin.value}`);
    console.log(`- Carb Impact: ${attr30?.components.carbs.value}`);
    console.log(`- Basal Impact: ${attr30?.components.basal.value}`);

    console.log('\nPrediction (Next 60m):');
    prediction.slice(0, 5).forEach((p, i) => {
        console.log(`T+${i * 5}m: SGV=${p.sgv.toFixed(1)}, IOB=${p.iob.toFixed(2)}, COB=${p.cob.toFixed(1)}`);
    });

    process.exit(0);
}

const target = '2025-12-29T12:56:35Z'; // Adjusted to ISO
debugPoint(target).catch(console.error);
