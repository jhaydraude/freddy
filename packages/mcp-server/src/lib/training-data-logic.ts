/**
 * Glucose Prediction Training Data Generator
 * 
 * Generates training samples for the glucose prediction model.
 * For each training point T:
 * - Collects status_history from T-lookback to T (input)
 * - Gets actual glucose at T+60min (target)
 * - Optionally filters samples with interventions
 */

import { getStatusHistory } from './history-logic.js';
import { getGlucose } from './status-logic.js';

export interface ITrainingSample {
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

export interface IGeneratorOptions {
    startDate: Date;
    endDate: Date;
    intervalMinutes: number;
    lookbackWindow: number;
    includeInterventions: boolean;
}

export interface ITrainingDataResult {
    generated_at: string;
    options: {
        start_date: string;
        end_date: string;
        interval_minutes: number;
        lookback_window: number;
        include_interventions: boolean;
    };
    summary: {
        total_samples: number;
        with_interventions: number;
        without_interventions: number;
        processed: number;
        skipped: number;
    };
    samples: ITrainingSample[];
}

/**
 * Generate a single training sample for a given training point.
 */
async function generateSample(trainingPoint: Date, lookbackWindow: number): Promise<ITrainingSample | null> {
    try {
        // Get status history from T-lookback to T (input features)
        const inputHistory = await getStatusHistory({
            startTime: trainingPoint.toISOString(),
            windowSize: lookbackWindow,
            bucketSize: 5
        });

        // Calculate expected samples (at least 50% data availability)
        const maxSamples = Math.floor(lookbackWindow / 5);
        const minRequired = Math.max(1, Math.floor(maxSamples * 0.5));

        if (!inputHistory || inputHistory.length < minRequired) {
            return null;
        }

        // Get glucose at T+60 (target label)
        const futureTime = new Date(trainingPoint.getTime() + 60 * 60 * 1000);
        const futureGlucose = await getGlucose({
            timestamp: futureTime.toISOString(),
            count: 1
        });

        if (!futureGlucose || futureGlucose.length === 0 || !futureGlucose[0]?.current?.sgv) {
            return null;
        }

        // For now, assume no interventions since we don't have a treatment query
        // This can be enhanced later
        const sample: ITrainingSample = {
            training_point: trainingPoint.toISOString(),
            status_history: inputHistory,
            actual_glucose_60min: futureGlucose[0].current.sgv,
            had_intervention: false
        };

        return sample;

    } catch (error: any) {
        console.error(`Error generating sample for ${trainingPoint.toISOString()}:`, error.message);
        return null;
    }
}

/**
 * Generate training samples for a date range.
 * 
 * Default options:
 * - startDate: 1 day ago
 * - endDate: now
 * - intervalMinutes: 5
 * - lookbackWindow: 20
 * - includeInterventions: false
 */
export async function generateTrainingData(options: Partial<IGeneratorOptions> = {}): Promise<ITrainingDataResult> {
    const now = new Date();

    // Apply defaults
    const opts: IGeneratorOptions = {
        startDate: options.startDate || new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day ago
        endDate: options.endDate || now,
        intervalMinutes: options.intervalMinutes ?? 5,
        lookbackWindow: options.lookbackWindow ?? 20,
        includeInterventions: options.includeInterventions ?? false
    };

    const samples: ITrainingSample[] = [];
    let processed = 0;
    let skipped = 0;

    // Generate training points
    const currentTime = new Date(opts.startDate);
    const intervalMs = opts.intervalMinutes * 60 * 1000;

    while (currentTime <= opts.endDate) {
        const sample = await generateSample(currentTime, opts.lookbackWindow);

        if (sample) {
            // Filter based on intervention policy
            if (opts.includeInterventions || !sample.had_intervention) {
                samples.push(sample);
            } else {
                skipped++;
            }
        }

        processed++;
        currentTime.setTime(currentTime.getTime() + intervalMs);
    }

    return {
        generated_at: new Date().toISOString(),
        options: {
            start_date: opts.startDate.toISOString(),
            end_date: opts.endDate.toISOString(),
            interval_minutes: opts.intervalMinutes,
            lookback_window: opts.lookbackWindow,
            include_interventions: opts.includeInterventions
        },
        summary: {
            total_samples: samples.length,
            with_interventions: samples.filter(s => s.had_intervention).length,
            without_interventions: samples.filter(s => !s.had_intervention).length,
            processed,
            skipped
        },
        samples
    };
}
