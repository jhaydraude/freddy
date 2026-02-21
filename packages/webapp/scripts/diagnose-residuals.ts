import 'dotenv/config';
import { generateTimeWindows } from '../lib/logic/profile-analysis-logic.js';
import { connectToDatabase, disconnectFromDatabase } from '../lib/db/connection.js';
import { getProfileAtTime, getProfileStore, getValueAtTime } from '../lib/logic/profile-logic.js';
import { normalizeISF } from '../lib/logic/unit-conversion.js';

async function diagnoseResiduals() {
    await connectToDatabase();

    const endDate = new Date();
    const daysBack = 1; // Just look at yesterday
    const windowHours = 2;

    console.log(`Generating windows for the last ${daysBack} day(s)...`);
    const windows = await generateTimeWindows({
        endDate,
        daysBack,
        windowHours
    });

    console.log(`Generated ${windows.length} windows.`);

    if (windows.length === 0) {
        console.log('No windows found.');
        process.exit(0);
    }

    // Look at the first 10 windows
    const sample = windows.slice(0, 10);

    for (const w of sample) {
        console.log('\n----------------------------------------');
        console.log(`Window: ${w.start.toISOString()} to ${w.end.toISOString()}`);
        console.log(`Glucose Change: ${w.glucose_start} -> ${w.glucose_end} = ${w.glucose_change}`);
        console.log(`Insulin Activity: ${w.insulin_activity}`);
        console.log(`Carb Absorption: ${w.carb_absorption}`);
        console.log(`Total Predicted Impact: ${w.total_predicted_impact}`);
        console.log(`Unexplained Residual: ${w.unexplained_residual}`);
        console.log(`Autosens Ratio: ${w.autosens_ratio}`);
    }

    await disconnectFromDatabase();
}

diagnoseResiduals().catch(console.error);
