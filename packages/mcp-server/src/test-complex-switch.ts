import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { Treatment } from './db/models.js';
import { resolveActiveProfile } from './lib/profile-logic.js';

async function verifySpecificSwitch() {
    console.log('--- Verifying Specific Profile Switch ---');
    try {
        await connectToDatabase();

        const targetId = '69489e834347a483416719e1';
        const t = await Treatment.findById(targetId);

        if (!t) {
            console.log(`Treatment ${targetId} not found.`);
            return;
        }

        console.log('Found Treatment:');
        console.log(`- Created at: ${t.created_at}`);
        console.log(`- Type: ${t.eventType}`);
        console.log(`- Profile: ${t.profile}`);
        console.log(`- Duration: ${t.duration} (original: ${t.originalDuration})`);
        console.log(`- Timeshift: ${t.timeshift}`);
        console.log(`- Has profileJson: ${!!(t as any).profileJson}`);

        const createdDate = new Date(t.created_at);
        const shiftMs = (t as any).timeshift || 0;
        const durationMs = t.duration || (t as any).originalDuration || 0;

        // Test 1: Just after creation (should be inactive if there's a delay)
        const test1 = new Date(createdDate.getTime() + 1000); // 1 sec after
        console.log(`\nTesting 1 sec after creation (${test1.toISOString()}):`);
        const res1 = await resolveActiveProfile(test1);
        console.log(`- Active Profile: ${res1?.activeProfileName}`);

        // Test 2: After delay starts
        if (shiftMs > 0) {
            const val = (shiftMs > 10000) ? shiftMs : shiftMs * 60 * 1000;
            const test2 = new Date(createdDate.getTime() + val + 1000);
            console.log(`\nTesting after delay start (${test2.toISOString()}):`);
            const res2 = await resolveActiveProfile(test2);
            console.log(`- Active Profile: ${res2?.activeProfileName}`);
        }

        // Test 3: After expiration
        if (durationMs > 0) {
            const sVal = (shiftMs > 10000) ? shiftMs : shiftMs * 60 * 1000;
            const dVal = (durationMs > 10000) ? durationMs : durationMs * 60 * 1000;
            const test3 = new Date(createdDate.getTime() + sVal + dVal + 1000);
            console.log(`\nTesting after expiration (${test3.toISOString()}):`);
            const res3 = await resolveActiveProfile(test3);
            console.log(`- Active Profile: ${res3?.activeProfileName}`);
        }

    } catch (err) {
        console.error('Final verification failed:', err);
    } finally {
        await disconnectFromDatabase();
    }
}

verifySpecificSwitch();
