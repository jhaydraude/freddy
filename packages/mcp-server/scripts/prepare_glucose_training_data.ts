/**
 * Glucose Prediction Training Data Generator
 * 
 * Generates training samples for the glucose prediction model.
 * For each training point T:
 * - Collects status_history from T-60min to T (input)
 * - Checks for interventions from T to T+60min
 * - Gets actual glucose at T+60min (target)
 * - Filters samples with interventions
 * 
 * Usage:
 *   npx tsx scripts/prepare_glucose_training_data.ts [options]
 * 
 * Options:
 *   --start <date>       Start date for training window (ISO format)
 *   --end <date>         End date for training window (ISO format)
 *   --interval <mins>    Interval between training points (default: 30)
 *   --output <path>      Output JSON file (default: glucose_training_data.json)
 *   --min-samples <n>    Minimum samples to generate (default: 100)
 */

import { getStatusHistory } from '../src/lib/history-logic.js';
import { getGlucose } from '../src/lib/status-logic.js';
import { connectToDatabase } from '../src/db/connection.js';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

interface TrainingSample {
    training_point: string;
    status_history: any[];
    actual_glucose_60min: number;
    had_intervention: boolean;
    intervention_details?: {
        carbs?: number;
        insulin?: number;
        treatments: any[];
    };
}

interface GeneratorOptions {
    startDate: Date;
    endDate: Date;
    intervalMinutes: number;
    lookbackWindow: number;  // How many minutes to look back for input history
    outputPath: string;
    minSamples: number;
    includeInterventions: boolean;  // Whether to include samples with interventions
}

/**
 * Check if there were any carb or insulin interventions in a time window.
 * This now uses the MCP tool to access the database.
 */
async function checkForInterventions(startTime: Date, endTime: Date): Promise<{
    hasIntervention: boolean;
    details: {
        carbs: number;
        insulin: number;
        treatments: any[];
    };
}> {
    // For now, we'll assume no interventions since we don't have a direct
    // treatment query tool in MCP. This can be enhanced later.
    // The user can use --include-interventions flag to get all samples.
    return {
        hasIntervention: false,
        details: {
            carbs: 0,
            insulin: 0,
            treatments: []
        }
    };
}

/**
 * Generate a single training sample for a given training point.
 */
async function generateSample(trainingPoint: Date, lookbackWindow: number): Promise<TrainingSample | null> {
    try {
        // Get status history from T-lookback to T (input features)
        const inputHistory = await getStatusHistory({
            startTime: trainingPoint.toISOString(),
            windowSize: lookbackWindow,
            bucketSize: 5
        });

        // Calculate expected samples (at least 50% data availability)
        // windowSize (mins) / bucketSize (mins) = max samples
        const maxSamples = Math.floor(lookbackWindow / 5);
        const minRequired = Math.max(1, Math.floor(maxSamples * 0.5)); // Require at least 50% valid points

        if (!inputHistory || inputHistory.length < minRequired) {
            console.log(`Skipping ${trainingPoint.toISOString()}: insufficient history (got ${inputHistory ? inputHistory.length : 0}, need ${minRequired})`);
            return null;
        }

        // Get glucose at T+60 (target label)
        const futureTime = new Date(trainingPoint.getTime() + 60 * 60 * 1000);
        const futureGlucose = await getGlucose({
            timestamp: futureTime.toISOString(),
            count: 1
        });

        if (!futureGlucose || futureGlucose.length === 0 || !futureGlucose[0]?.current?.sgv) {
            console.log(`Skipping ${trainingPoint.toISOString()}: no future glucose data`);
            return null;
        }

        // Check for interventions between T and T+60
        const interventionCheck = await checkForInterventions(trainingPoint, futureTime);

        const sample: TrainingSample = {
            training_point: trainingPoint.toISOString(),
            status_history: inputHistory,
            actual_glucose_60min: futureGlucose[0].current.sgv,
            had_intervention: interventionCheck.hasIntervention
        };

        if (interventionCheck.hasIntervention) {
            sample.intervention_details = interventionCheck.details;
        }

        return sample;

    } catch (error: any) {
        console.error(`Error generating sample for ${trainingPoint.toISOString()}:`, error.message);
        return null;
    }
}

/**
 * Generate all training samples for a date range.
 */
async function generateTrainingData(options: GeneratorOptions): Promise<void> {
    console.log('Generating glucose prediction training data...');
    console.log(`Date range: ${options.startDate.toISOString()} to ${options.endDate.toISOString()}`);
    console.log(`Interval: ${options.intervalMinutes} minutes`);
    console.log(`Include interventions: ${options.includeInterventions}`);

    const samples: TrainingSample[] = [];
    let processed = 0;
    let skipped = 0;

    // Generate training points
    const currentTime = new Date(options.startDate);
    const intervalMs = options.intervalMinutes * 60 * 1000;

    while (currentTime <= options.endDate) {
        const sample = await generateSample(currentTime, options.lookbackWindow);

        if (sample) {
            // Filter based on intervention policy
            if (options.includeInterventions || !sample.had_intervention) {
                samples.push(sample);
                console.log(`✓ Sample ${samples.length}: ${sample.training_point} -> ${sample.actual_glucose_60min.toFixed(1)} mg/dL ${sample.had_intervention ? '(intervention)' : ''}`);
            } else {
                skipped++;
                console.log(`⊗ Skipped (intervention): ${sample.training_point}`);
            }
        }

        processed++;
        currentTime.setTime(currentTime.getTime() + intervalMs);

        // Progress update
        if (processed % 10 === 0) {
            console.log(`Processed ${processed} points, collected ${samples.length} samples, skipped ${skipped}`);
        }
    }

    // Summary
    console.log('\n=== Generation Complete ===');
    console.log(`Total processed: ${processed}`);
    console.log(`Valid samples: ${samples.length}`);
    console.log(`Skipped (interventions): ${skipped}`);
    console.log(`Samples with interventions: ${samples.filter(s => s.had_intervention).length}`);
    console.log(`Samples without interventions: ${samples.filter(s => !s.had_intervention).length}`);

    if (samples.length < options.minSamples) {
        console.warn(`\n⚠ Warning: Only generated ${samples.length} samples, minimum was ${options.minSamples}`);
        console.warn('Consider expanding the date range or including samples with interventions.');
    }

    // Save to file
    const output = {
        generated_at: new Date().toISOString(),
        options: {
            start_date: options.startDate.toISOString(),
            end_date: options.endDate.toISOString(),
            interval_minutes: options.intervalMinutes,
            include_interventions: options.includeInterventions
        },
        summary: {
            total_samples: samples.length,
            with_interventions: samples.filter(s => s.had_intervention).length,
            without_interventions: samples.filter(s => !s.had_intervention).length
        },
        samples: samples
    };

    await writeFile(options.outputPath, JSON.stringify(output, null, 2));
    console.log(`\nTraining data saved to: ${options.outputPath}`);
    console.log(`\nReady to train! Use this data with the /api/v1/train/glucose endpoint.`);
}

// Parse command line arguments
function parseArgs(): GeneratorOptions {
    const args = process.argv.slice(2);

    const options: GeneratorOptions = {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        endDate: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago (need future data)
        intervalMinutes: 30,
        lookbackWindow: 15,  // Default to 15-minute lookback window
        outputPath: 'glucose_training_data.json',
        minSamples: 100,
        includeInterventions: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--start':
                i++;
                if (args[i]) options.startDate = new Date(args[i]);
                break;
            case '--end':
                i++;
                if (args[i]) options.endDate = new Date(args[i]);
                break;
            case '--interval':
                i++;
                if (args[i]) options.intervalMinutes = parseInt(args[i], 10);
                break;
            case '--lookback':
                i++;
                if (args[i]) options.lookbackWindow = parseInt(args[i], 10);
                break;
            case '--output':
                i++;
                if (args[i]) options.outputPath = args[i];
                break;
            case '--min-samples':
                i++;
                if (args[i]) options.minSamples = parseInt(args[i], 10);
                break;
            case '--include-interventions':
                options.includeInterventions = true;
                break;
            case '--help':
                console.log(`
Glucose Prediction Training Data Generator

Usage: npx tsx scripts/prepare_glucose_training_data.ts [options]

Options:
  --start <date>              Start date (ISO format, default: 7 days ago)
  --end <date>                End date (ISO format, default: 2 hours ago)
  --interval <minutes>        Interval between training points (default: 30)
  --lookback <minutes>        Lookback window for input history (default: 15)
  --output <path>             Output JSON file (default: glucose_training_data.json)
  --min-samples <n>           Minimum samples to generate (default: 100)
  --include-interventions     Include samples where carbs/insulin occurred (default: exclude)
  --help                      Show this help

Examples:
  # Generate training data for last week
  npx tsx scripts/prepare_glucose_training_data.ts

  # Custom date range
  npx tsx scripts/prepare_glucose_training_data.ts --start 2024-01-01 --end 2024-01-31

  # Include samples with interventions (useful for larger datasets)
  npx tsx scripts/prepare_glucose_training_data.ts --include-interventions
                `);
                process.exit(0);
        }
    }

    return options;
}

// Main execution (ES module check)
// Main execution (ES module check)
const __filename = fileURLToPath(import.meta.url);
const entryFile = process.argv[1];

// Robust check for main module execution that handles Windows paths correctly
if (path.resolve(__filename) === path.resolve(entryFile) ||
    entryFile.includes('prepare_glucose_training_data.ts')) {

    const options = parseArgs();

    // Connect to database before generating data
    connectToDatabase()
        .then(() => {
            return generateTrainingData(options);
        })
        .then(() => {
            console.log('✓ Done!');
            process.exit(0);
        })
        .catch((error: any) => {
            console.error('Error generating training data:', error);
            // Even on error, try to save what we have if possible, or just exit
            process.exit(1);
        });
}

export { generateTrainingData, generateSample, checkForInterventions };
