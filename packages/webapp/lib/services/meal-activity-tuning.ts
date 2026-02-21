import { randomUUID } from 'crypto';
import { MealActivityTuning, IMealActivityTuning } from '../db/models/meal-activity-tuning';
import { UnifiedFoundationTuning } from '../db/models/unified-foundation-tuning';
import { getProfileStore, getProfileAtTime, getValueAtTime } from '../logic/profile-logic';
import { generateTimeWindows } from '../logic/profile-analysis-logic';
import { connectToDatabase } from '../db/connection';
import { normalizeISF, denormalizeISF } from '../logic/unit-conversion';

export interface MealActivityTuningConfig {
    analysis_period_days?: number;
    window_hours?: number;
    include_activity?: boolean;
    min_windows_required?: number;
    baseline_tuning_id?: string;
}

export class MealActivityTuningService {
    async startTuning(config: MealActivityTuningConfig, userId: string = 'default'): Promise<string> {
        await connectToDatabase();
        const tuning_id = randomUUID();

        const analysis_period_days = config.analysis_period_days || 30;
        const window_hours = config.window_hours || 2;
        const include_activity = config.include_activity !== false;
        const min_windows_required = config.min_windows_required || 20;

        // Fetch Baseline
        let baselineBasal: number[] = [];
        let baselineISF: number[] = [];
        let units: 'mg/dL' | 'mmol/L' = 'mg/dL';
        let source: 'profile' | 'foundation_run' = 'profile';

        if (config.baseline_tuning_id) {
            const foundation = await UnifiedFoundationTuning.findOne({ tuning_id: config.baseline_tuning_id });
            if (foundation && foundation.status === 'completed' && foundation.optimized_values) {
                baselineBasal = foundation.optimized_values.basal;
                baselineISF = foundation.optimized_values.isf;
                units = foundation.current_values.units;
                source = 'foundation_run';
            }
        }

        const profileDoc = await getProfileAtTime(new Date());
        const profileStore = getProfileStore(profileDoc || undefined);

        if (baselineBasal.length === 0) {
            baselineBasal = this._extractBasalSchedule(profileStore, 12);
            baselineISF = this._extractISFSchedule(profileStore, 6);
            units = (profileStore?.units || 'mg/dL').toLowerCase().includes('mmol') ? 'mmol/L' : 'mg/dL';
            source = 'profile';
        }

        const current_values = {
            basal: baselineBasal,
            isf: baselineISF,
            cr: this._extractCRSchedule(profileStore, 6),
            activity_coefficients: {
                steps: -0.1,
                heartRate: 1.0
            },
            units,
            source
        };

        const tuning = new MealActivityTuning({
            tuning_id,
            user_id: userId,
            created_at: new Date(),
            status: 'running',
            config: {
                analysis_period_days,
                window_hours,
                include_activity,
                min_windows_required,
                baseline_tuning_id: config.baseline_tuning_id
            },
            current_values,
            logs: [`Meal & Activity Tuning started at ${new Date().toISOString()}`]
        });

        await tuning.save();

        this._runOptimization(tuning_id, analysis_period_days, window_hours)
            .catch(error => {
                console.error(`Meal tuning ${tuning_id} failed:`, error);
                this._markFailed(tuning_id, error.message);
            });

        return tuning_id;
    }

    private async _runOptimization(tuning_id: string, analysis_period_days: number, window_hours: number): Promise<void> {
        const tuning = await MealActivityTuning.findOne({ tuning_id });
        if (!tuning) return;

        try {
            const endDate = new Date();
            const windows = await generateTimeWindows({
                endDate,
                daysBack: analysis_period_days,
                windowHours: window_hours
            });

            // For Level 2, we want windows with meals OR activity OR stable blocks
            // The Python optimizer handles the weighting, but we filter out obviously bad data
            const validWindows = windows.filter(w =>
                w.data_quality.readings_count >= 6 &&
                (w.has_meals || w.carb_absorption > 2.0 || w.activity_steps > 0 || w.is_stable) &&
                Math.abs(w.unexplained_residual || 0) <= 50 // Filter out massive unlogged carbs/sensor errors
            );

            tuning.logs.push(`Found ${validWindows.length} valid windows for meal/activity analysis.`);
            await tuning.save();

            if (validWindows.length < tuning.config.min_windows_required) {
                throw new Error(`Insufficient windows (${validWindows.length}). Need at least ${tuning.config.min_windows_required}.`);
            }

            // Normalize ISF to mg/dL for consistent mathematical analysis in Python
            const normalizedISF = tuning.current_values.isf.map(v => normalizeISF(v, tuning.current_values.units));

            const response = await fetch(`${process.env.PREDICTIVE_MODELS_URL || 'http://localhost:8000'}/api/v1/tune/meal-activity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    windows: validWindows,
                    baseline_isf: normalizedISF,
                    baseline_basal: tuning.current_values.basal,
                    current_cr: tuning.current_values.cr,
                    current_activity_coeffs: tuning.current_values.activity_coefficients
                })
            });

            if (!response.ok) {
                const err = await response.json();
                const detail = typeof err.detail === 'string'
                    ? err.detail
                    : JSON.stringify(err.detail);
                throw new Error(detail || 'Python API failed');
            }

            const optimized = await response.json();

            // Denormalize ISF back to user's units
            optimized.isf = optimized.isf.map((v: number) => denormalizeISF(v, tuning.current_values.units));
            optimized.isf_confidence = optimized.isf_confidence.map((range: [number, number]) => [
                denormalizeISF(range[0], tuning.current_values.units),
                denormalizeISF(range[1], tuning.current_values.units)
            ]);

            tuning.status = 'completed';

            // Calculate time-of-day distribution
            const distribution = new Array(12).fill(0);
            validWindows.forEach(w => {
                const hour = w.hour_of_day;
                const bin = Math.floor(hour / 2);
                distribution[bin]++;
            });

            tuning.optimized_values = optimized;
            tuning.analysis_summary = {
                total_windows: windows.length,
                meal_windows: windows.filter(w => w.has_meals).length,
                activity_windows: windows.filter(w => w.activity_steps > 0).length,
                data_quality_score: 0.8, // Simplified
                window_distribution: distribution
            };
            tuning.logs.push('Meal & Activity optimization complete.');
            await tuning.save();

        } catch (error: any) {
            tuning.status = 'failed';
            tuning.error_message = error.message;
            tuning.logs.push(`Error: ${error.message}`);
            await tuning.save();
        }
    }

    private _markFailed(tuning_id: string, message: string) {
        MealActivityTuning.findOneAndUpdate({ tuning_id }, {
            status: 'failed',
            error_message: message,
            $push: { logs: `Critical Failure: ${message}` }
        }).exec();
    }

    private _extractISFSchedule(profileStore: any, blocks: number): number[] {
        const schedule: number[] = [];
        const hourStep = 24 / blocks;
        for (let i = 0; i < blocks; i++) {
            const h = i * hourStep;
            const d = new Date();
            d.setHours(h, 0, 0, 0);
            schedule.push(getValueAtTime(profileStore?.sens, d) || 50);
        }
        return schedule;
    }

    private _extractBasalSchedule(profileStore: any, blocks: number): number[] {
        const schedule: number[] = [];
        const hourStep = 24 / blocks;
        for (let i = 0; i < blocks; i++) {
            const h = i * hourStep;
            const d = new Date();
            d.setHours(h, 0, 0, 0);
            schedule.push(getValueAtTime(profileStore?.basal, d) || 1.0);
        }
        return schedule;
    }

    private _extractCRSchedule(profileStore: any, blocks: number): number[] {
        const schedule: number[] = [];
        const hourStep = 24 / blocks;
        for (let i = 0; i < blocks; i++) {
            const h = i * hourStep;
            const d = new Date();
            d.setHours(h, 0, 0, 0);
            schedule.push(getValueAtTime(profileStore?.carbratio, d) || 10);
        }
        return schedule;
    }
}

export const mealActivityTuningService = new MealActivityTuningService();
