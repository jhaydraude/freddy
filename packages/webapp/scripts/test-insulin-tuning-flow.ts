import 'dotenv/config';
import mongoose from 'mongoose';
import { insulinResponseTuningService } from '../lib/services/insulin-response-tuning';
import { InsulinResponseTuning } from '../lib/db/models/insulin-response-tuning';

/**
 * Integration test script for the insulin response tuning flow.
 */
async function testTuningFlow() {
    console.log('--- Starting Insulin Response Tuning Integration Test ---');

    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error('MONGO_URI not found in environment');
    }

    console.log(`Connecting to MongoDB: ${mongoUri.replace(/:([^:@]+)@/, ':****@')}`);
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    try {
        // 1. Start Tuning
        console.log('\n[1/4] Starting Tuning Run...');
        const config = {
            analysis_period_days: 14,
            window_hours: 2,
            include_activity: true
        };

        const tuningId = await insulinResponseTuningService.startTuning(config);
        console.log(`Tuning started successfully. Tuning ID: ${tuningId}`);

        // 2. Poll for Completion
        console.log('\n[2/4] Polling for completion...');
        let status = 'running';
        let attempts = 0;
        const maxAttempts = 20; // 2 minutes max

        while (status === 'running' && attempts < maxAttempts) {
            attempts++;
            const result = await insulinResponseTuningService.getTuningStatus(tuningId);
            status = result.status;

            console.log(`  Attempt ${attempts}: Status = ${status}`);

            if (status === 'completed') {
                console.log('Tuning completed!');
                console.log('Optimized DIA:', result.optimized_values?.dia);
                console.log('Optimized Peak:', result.optimized_values?.peak);
                console.log('Optimized ISF (avg):', result.optimized_values ? result.optimized_values.isf.reduce((a, b) => a + b, 0) / 6 : 'N/A');
                break;
            } else if (status === 'failed') {
                console.error('Tuning failed:', result.error_message);
                break;
            }

            // Wait 5 seconds
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        if (status !== 'completed') {
            console.error('Tuning did not complete in time or failed.');
            return;
        }

        // 3. Apply Results
        console.log('\n[3/4] Applying Results...');
        await insulinResponseTuningService.applyTuning(tuningId, {
            apply_to_profile: false, // Don't actually update NS during test to avoid side effects
            apply_to_system: true
        });
        console.log('Results applied successfully to system config.');

        // 4. Verify System Config Update
        console.log('\n[4/4] Verifying System Config Update...');
        const activeParams = await insulinResponseTuningService.getActiveParameters();
        const tuningStatus = await insulinResponseTuningService.getTuningStatus(tuningId);

        if (activeParams.dia === tuningStatus.optimized_values?.dia) {
            console.log('Verification Success: Active parameters match optimized values!');
        } else {
            console.error('Verification Failed: Active parameters do NOT match optimized values.');
            console.log('Active DIA:', activeParams.dia);
            console.log('Optimized DIA:', tuningStatus.optimized_values?.dia);
        }

    } catch (error) {
        console.error('Error during tuning flow test:', error);
    } finally {
        // Clean up: delete the test tuning run (optional)
        // await InsulinResponseTuning.deleteMany({ tuning_id: tuningId });

        await mongoose.disconnect();
        console.log('\n--- Test Finished ---');
    }
}

testTuningFlow().catch(console.error);
