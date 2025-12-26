
import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { Treatment } from '../src/db/models.js';

async function checkTypes() {
    await connectToDatabase();

    const types = await Treatment.distinct('eventType');
    console.log('Distinct Treatment Types:', types);

    // Check for any notes containing "SMB"
    const smbExamples = await Treatment.find({
        $or: [
            { eventType: /SMB/i },
            { notes: /SMB/i }
        ]
    }).limit(5);

    if (smbExamples.length > 0) {
        console.log('\nPotential SMB Examples found:');
        smbExamples.forEach(t => {
            console.log(`- Type: ${t.eventType}, Insulin: ${t.insulin}, Notes: ${t.notes}, Created: ${t.created_at}`);
        });
    } else {
        console.log('\nNo explicit "SMB" events found in sample lookup.');
    }

    await disconnectFromDatabase();
}

checkTypes().catch(console.error);
