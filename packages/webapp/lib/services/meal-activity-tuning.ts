import { randomUUID } from 'crypto';
import { MealActivityTuning } from '../db/models/meal-activity-tuning';
import { UnifiedFoundationTuning } from '../db/models/unified-foundation-tuning';
import { getProfileStore, getProfileAtTime, getValueAtTime, resolveActiveProfile } from '../logic/profile-logic';
import { generateTimeWindows } from '../logic/profile-analysis-logic';
import { connectToDatabase } from '../db/connection';
import { normalizeISF, denormalizeISF } from '../logic/unit-conversion';

export interface MealActivityTuningConfig {
    analysis_period_days?: number;
    window_hours?: number;
    include_activity?: boolean;
    min_windows_required?: number;
    baseline_tuning_id?: string;
    mode?: 'meal' | 'activity' | 'combined';
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
        let baselineDia: number = 5.0;
        let baselinePeak: number = 45;
        let units: 'mg/dL' | 'mmol/L' = 'mg/dL';
        let source: string = 'profile';

        if (config.baseline_tuning_id) {
            const foundation = await UnifiedFoundationTuning.findOne({ tuning_id: config.baseline_tuning_id });
            const mealTuner = await MealActivityTuning.findOne({ tuning_id: config.baseline_tuning_id });

            if (foundation && foundation.status === 'completed' && foundation.optimized_values) {
                baselineBasal = foundation.optimized_values.basal;
                baselineISF = foundation.optimized_values.isf;
                baselineDia = foundation.optimized_values.dia || foundation.current_values.dia || 5.0;
                baselinePeak = foundation.optimized_values.peak || foundation.current_values.peak || 45;
                units = foundation.current_values.units;
                source = 'foundation_run';
            } else if (mealTuner && mealTuner.status === 'completed' && mealTuner.optimized_values) {
                baselineBasal = mealTuner.optimized_values.basal || mealTuner.current_values.basal;
                baselineISF = mealTuner.optimized_values.isf || mealTuner.current_values.isf;
                baselineDia = mealTuner.optimized_values.dia || mealTuner.current_values.dia || 5.0;
                baselinePeak = mealTuner.optimized_values.peak || mealTuner.current_values.peak || 45;
                units = mealTuner.current_values.units;
                source = 'meal_run';
            }
        }

        const profileInfo = await resolveActiveProfile(new Date());
        const profileStore = getProfileStore(profileInfo?.doc || undefined, profileInfo?.activeProfileName, profileInfo?.profileData || undefined);

        if (baselineBasal.length === 0) {
            baselineBasal = this._extractBasalSchedule(profileStore, 12);
            baselineISF = this._extractISFSchedule(profileStore, 6);
            baselineDia = profileStore?.dia || 5.0;
            const curveType = (profileStore as any)?.curve || 'ultra-rapid';
            baselinePeak = curveType === 'rapid-acting' ? 55 : 45;
            units = (profileStore?.units || 'mg/dL').toLowerCase().includes('mmol') ? 'mmol/L' : 'mg/dL';
            source = 'profile';
        }

        const current_values = {
            dia: baselineDia,
            peak: baselinePeak,
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
            let current_isf = tuning.current_values.isf.map(v => normalizeISF(v, tuning.current_values.units));
            let current_basal = tuning.current_values.basal;
            let current_dia = tuning.current_values.dia;
            let current_peak = tuning.current_values.peak;
            let current_cr = tuning.current_values.cr;
            let current_activity_coeffs = tuning.current_values.activity_coefficients;
            let optimized: any = null;

            if (tuning.mode === 'combined') {
                tuning.logs.push('[Stage 1] Starting Insulin Foundation optimization...');
                await tuning.save();

                const foundationWindows = windows.filter(w =>
                    w.data_quality.readings_count >= 6 &&
                    w.isolation_confidence !== undefined &&
                    w.isolation_confidence >= 0.1 &&
                    w.carb_absorption <= 5.0 &&
                    Math.abs(w.unexplained_residual || 0) <= 50
                );

                tuning.logs.push(`[Stage 1] Transmitting ${foundationWindows.length} compatible windows to solver...`);
                await tuning.save();

                const fResponse = await fetch(`${process.env.PREDICTIVE_MODELS_URL || 'http://localhost:8000'}/api/v1/tune/unified-foundation`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        windows: foundationWindows,
                        current_dia,
                        current_peak,
                        current_isf,
                        current_basal
                    })
                });

                if (!fResponse.ok) throw new Error('Stage 1 (Insulin) optimization failed.');
                const fOptimized = await fResponse.json();
                current_isf = fOptimized.isf;
                current_basal = fOptimized.basal;

                tuning.logs.push('[Stage 1] Insulin Foundation optimization completed successfully!');
                tuning.logs.push('[Stage 2] Starting Meal Ratio optimization...');
                await tuning.save();

                const mResponse = await fetch(`${process.env.PREDICTIVE_MODELS_URL || 'http://localhost:8000'}/api/v1/tune/meal-activity`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mode: 'meal',
                        windows: validWindows,
                        baseline_isf: current_isf,
                        baseline_basal: current_basal,
                        current_cr,
                        current_activity_coeffs
                    })
                });

                if (!mResponse.ok) throw new Error('Stage 2 (Meal) optimization failed.');
                const mOptimized = await mResponse.json();
                current_cr = mOptimized.cr;

                tuning.logs.push('[Stage 2] Meal Ratio optimization completed successfully!');
                tuning.logs.push('[Stage 3] Starting Activity Coefficient optimization...');
                await tuning.save();

                const aResponse = await fetch(`${process.env.PREDICTIVE_MODELS_URL || 'http://localhost:8000'}/api/v1/tune/meal-activity`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mode: 'activity',
                        windows: validWindows,
                        baseline_isf: current_isf,
                        baseline_basal: current_basal,
                        current_cr,
                        current_activity_coeffs
                    })
                });

                if (!aResponse.ok) throw new Error('Stage 3 (Activity) optimization failed.');
                optimized = await aResponse.json();
                // Ensure the final state inherits intermediate combinations
                optimized.basal = current_basal;
                optimized.isf = current_isf;
                optimized.cr = current_cr;

                tuning.logs.push('[Stage 3] Activity Coefficient optimization completed successfully!');
            } else {
                tuning.logs.push(`Starting ${tuning.mode} optimization pass...`);
                await tuning.save();

                const response = await fetch(`${process.env.PREDICTIVE_MODELS_URL || 'http://localhost:8000'}/api/v1/tune/meal-activity`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mode: tuning.mode,
                        windows: validWindows,
                        baseline_isf: current_isf,
                        baseline_basal: current_basal,
                        current_cr,
                        current_activity_coeffs
                    })
                });

                if (!response.ok) {
                    const err = await response.json();
                    const detail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
                    throw new Error(detail || 'Python API failed');
                }

                optimized = await response.json();
            }

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

            optimized.dia = tuning.current_values.dia;
            optimized.peak = tuning.current_values.peak;
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
