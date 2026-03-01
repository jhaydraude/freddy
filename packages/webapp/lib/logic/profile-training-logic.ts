import { getStatusHistory } from './history-logic';
import type { IStatusResult } from './types';
import { Entry } from '../db/models';
import { resolveActiveProfile, getProfileStore, getValueAtTime } from './profile-logic';

/**
 * Options for generating profile training data.
 */
export interface IProfileTrainingOptions {
    startDate?: Date;
    endDate?: Date;
    intervalHours?: number;
    lookbackWindow?: number;
    outcomeWindowHours?: number;
}

/**
 * Single profile training sample.
 */
export interface IProfileTrainingSample {
    status_history: IStatusResult[];
    current_isf: number;
    current_icr: number;
    current_basal: Array<{ hour: number, rate: number }>;
    outcome_time_in_range: number;
    outcome_time_below_range: number;
    outcome_time_above_range: number;
    outcome_glucose_std: number;
    outcome_glucose_cv: number;
}

/**
 * Generate a single profile training sample.
 */
export async function generateProfileTrainingSample(
    timestamp: Date,
    lookbackWindow: number = 60,
    outcomeWindowHours: number = 4
): Promise<IProfileTrainingSample | null> {
    try {
        // Get status history for input features (lookback window)
        const status_history = await getStatusHistory({
            startTime: timestamp,
            windowSize: lookbackWindow,
            bucketSize: 5
        });

        if (!status_history || status_history.length === 0) {
            return null;
        }

        // Get current profile settings at this timestamp
        const profileInfo = await resolveActiveProfile(timestamp);
        if (!profileInfo || !profileInfo.doc) {
            return null;
        }

        const profileStore = getProfileStore(profileInfo.doc, profileInfo.activeProfileName, profileInfo.profileData || undefined);
        if (!profileStore) {
            return null;
        }

        // Extract ISF and ICR at this time
        const current_isf = profileStore.sens ? getValueAtTime(profileStore.sens, timestamp) : 0;
        const current_icr = profileStore.carbratio ? getValueAtTime(profileStore.carbratio, timestamp) : 0;

        if (current_isf <= 0 || current_icr <= 0) {
            return null;
        }

        // Extract basal rates for all 24 hours
        const current_basal: Array<{ hour: number, rate: number }> = [];
        for (let hour = 0; hour < 24; hour++) {
            const hourDate = new Date(timestamp);
            hourDate.setHours(hour, 0, 0, 0);
            const basalRate = profileStore.basal ? getValueAtTime(profileStore.basal, hourDate) : 1.0;
            current_basal.push({ hour, rate: basalRate });
        }

        // Calculate outcome metrics for the following period
        const outcomeStartTime = new Date(timestamp.getTime() + (lookbackWindow * 60 * 1000));
        const outcomeEndTime = new Date(outcomeStartTime.getTime() + (outcomeWindowHours * 60 * 60 * 1000));

        const glucoseEntries = await Entry.find({
            type: 'sgv',
            date: {
                $gte: outcomeStartTime.getTime(),
                $lte: outcomeEndTime.getTime()
            }
        }).sort({ date: 1 });

        if (glucoseEntries.length < 10) {
            // Not enough data for outcome calculation
            return null;
        }

        // Get the units from the profile
        const units = profileStore.units || 'mg/dl';

        // Calculate outcome metrics
        const glucoseValues = glucoseEntries.map((e: any) => e.sgv).filter((sgv: any): sgv is number => sgv !== undefined);

        // Define target range: 4-9 mmol/L = 72-162 mg/dL
        let lowerBound = 72;
        let upperBound = 162;

        // Convert if profile is in mmol/L
        if (units.toLowerCase() === 'mmol') {
            // Glucose values are likely in mmol/L, convert bounds
            lowerBound = 4.0;
            upperBound = 9.0;
        }

        const inRange = glucoseValues.filter((g: any) => g >= lowerBound && g <= upperBound).length;
        const belowRange = glucoseValues.filter((g: any) => g < lowerBound).length;
        const aboveRange = glucoseValues.filter((g: any) => g > upperBound).length;
        const total = glucoseValues.length;

        const outcome_time_in_range = (inRange / total) * 100;
        const outcome_time_below_range = (belowRange / total) * 100;
        const outcome_time_above_range = (aboveRange / total) * 100;

        // Calculate glucose standard deviation and CV
        const mean = glucoseValues.reduce((sum: any, val: any) => sum + val, 0) / glucoseValues.length;
        const variance = glucoseValues.reduce((sum: any, val: any) => sum + Math.pow(val - mean, 2), 0) / glucoseValues.length;
        const outcome_glucose_std = Math.sqrt(variance);
        const outcome_glucose_cv = (outcome_glucose_std / mean) * 100;

        return {
            status_history,
            current_isf,
            current_icr,
            current_basal,
            outcome_time_in_range,
            outcome_time_below_range,
            outcome_time_above_range,
            outcome_glucose_std,
            outcome_glucose_cv
        };
    } catch (error) {
        console.error(`Error generating profile training sample at ${timestamp.toISOString()}:`, error);
        return null;
    }
}

/**
 * Generate multiple profile training samples over a date range.
 */
export async function generateProfileTrainingData(options: IProfileTrainingOptions = {}): Promise<{
    samples: IProfileTrainingSample[];
    count: number;
    skipped: number;
}> {
    const {
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        endDate = new Date(),
        intervalHours = 6,
        lookbackWindow = 60,
        outcomeWindowHours = 4
    } = options;

    const samples: IProfileTrainingSample[] = [];
    let skipped = 0;

    const intervalMs = intervalHours * 60 * 60 * 1000;
    let currentTime = startDate.getTime();
    const endTime = endDate.getTime();

    while (currentTime <= endTime) {
        const timestamp = new Date(currentTime);

        const sample = await generateProfileTrainingSample(timestamp, lookbackWindow, outcomeWindowHours);
        if (sample) {
            samples.push(sample);
        } else {
            skipped++;
        }

        currentTime += intervalMs;
    }

    return {
        samples,
        count: samples.length,
        skipped
    };
}
