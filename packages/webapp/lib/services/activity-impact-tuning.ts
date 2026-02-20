import { randomUUID } from 'crypto';
import { ActivityImpactTuning, IActivityImpactTuning } from '../db/models/activity-impact-tuning';
import { getProfileAtTime, getProfileStore, getValueAtTime } from '../logic/profile-logic';
import { generateTimeWindows } from '../logic/profile-analysis-logic';
import { DEFAULT_ACTIVITY_COEFFICIENTS } from '../logic/activity-impact';
import { SystemConfig } from '../db/models/system-config';

export interface ActivityTuningConfig {
    analysis_period_days?: number;
    window_hours?: number;
}

export interface ActivityTuningResult {
    tuning_id: string;
    status: 'running' | 'completed' | 'failed' | 'applied';
    sync_progress?: number;
    current_values: {
        steps_per_minute: number;
        calories: number;
        stairs: number;
        hr_spike: number;
        stress_hr: number;
    };
    optimized_values?: {
        steps_per_minute: number;
        calories: number;
        stairs: number;
        hr_spike: number;
        stress_hr: number;
        steps_per_minute_confidence: [number, number];
        calories_confidence: [number, number];
        stairs_confidence: [number, number];
        hr_spike_confidence: [number, number];
        stress_hr_confidence: [number, number];
        r_squared: number;
        rmse: number;
        mae: number;
        windows_analyzed: number;
    };
    analysis_summary?: {
        total_windows: number;
        data_quality_score: number;
    };
    logs?: string[];
    error_message?: string;
}

export class ActivityImpactTuningService {
    async startTuning(config: ActivityTuningConfig, userId: string = 'default'): Promise<string> {
        const tuning_id = randomUUID();
        const analysis_period_days = config.analysis_period_days || 14;
        const window_hours = config.window_hours || 2;

        // Get current coefficients (from system_config if tuned, else defaults)
        const currentCoeffs = await this._getCurrentCoefficients();

        const tuning = new ActivityImpactTuning({
            tuning_id,
            user_id: userId,
            created_at: new Date(),
            status: 'running',
            config: { analysis_period_days, window_hours },
            current_values: currentCoeffs,
            logs: [`Activity tuning started at ${new Date().toISOString()}`]
        });

        await tuning.save();

        this._runOptimization(tuning_id, analysis_period_days, window_hours)
            .catch(err => {
                console.error(`Activity tuning ${tuning_id} failed:`, err);
                this._markFailed(tuning_id, err.message);
            });

        return tuning_id;
    }

    async getTuningStatus(tuning_id: string): Promise<ActivityTuningResult> {
        const tuning = await ActivityImpactTuning.findOne({ tuning_id });
        if (!tuning) throw new Error(`Tuning ${tuning_id} not found`);

        return {
            tuning_id: tuning.tuning_id,
            status: tuning.status,
            sync_progress: tuning.sync_progress,
            current_values: tuning.current_values,
            optimized_values: tuning.optimized_values as any,
            analysis_summary: tuning.analysis_summary,
            logs: tuning.logs,
            error_message: tuning.error_message
        };
    }

    async applyTuning(tuning_id: string, userId: string = 'default'): Promise<void> {
        const tuning = await ActivityImpactTuning.findOne({ tuning_id });
        if (!tuning) throw new Error(`Tuning ${tuning_id} not found`);
        if (tuning.status !== 'completed') throw new Error(`Cannot apply tuning with status ${tuning.status}`);
        if (!tuning.optimized_values) throw new Error('No optimized values to apply');

        const ov = tuning.optimized_values;

        // Store to system_config
        await SystemConfig.findOneAndUpdate(
            { key: 'activity_coefficients_tuned' },
            {
                key: 'activity_coefficients_tuned',
                value: {
                    tuning_id,
                    steps_per_minute: ov.steps_per_minute,
                    calories: ov.calories,
                    stairs: ov.stairs,
                    hr_spike: ov.hr_spike,
                    stress_hr: ov.stress_hr,
                    applied_at: new Date().toISOString()
                },
                updated_at: new Date()
            },
            { upsert: true }
        );

        tuning.status = 'applied';
        tuning.applied_at = new Date();
        tuning.applied_by = userId;
        await tuning.save();

        console.log(`Activity tuning ${tuning_id} applied to system_config`);
    }

    async getTuningHistory(userId: string = 'default', limit: number = 10): Promise<ActivityTuningResult[]> {
        const tunings = await ActivityImpactTuning
            .find({ user_id: userId })
            .sort({ created_at: -1 })
            .limit(limit);

        return tunings.map(t => ({
            tuning_id: t.tuning_id,
            status: t.status,
            current_values: t.current_values,
            optimized_values: t.optimized_values as any,
            analysis_summary: t.analysis_summary
        }));
    }

    private async _getCurrentCoefficients() {
        // Check system_config first
        const tuned = await SystemConfig.findOne({ key: 'activity_coefficients_tuned' });
        if (tuned?.value) {
            return {
                steps_per_minute: tuned.value.steps_per_minute ?? DEFAULT_ACTIVITY_COEFFICIENTS.STEPS_PER_MINUTE,
                calories: tuned.value.calories ?? DEFAULT_ACTIVITY_COEFFICIENTS.CALORIES,
                stairs: tuned.value.stairs ?? DEFAULT_ACTIVITY_COEFFICIENTS.STAIRS,
                hr_spike: tuned.value.hr_spike ?? DEFAULT_ACTIVITY_COEFFICIENTS.HR_SPIKE,
                stress_hr: tuned.value.stress_hr ?? DEFAULT_ACTIVITY_COEFFICIENTS.STRESS_HR
            };
        }

        return {
            steps_per_minute: DEFAULT_ACTIVITY_COEFFICIENTS.STEPS_PER_MINUTE,
            calories: DEFAULT_ACTIVITY_COEFFICIENTS.CALORIES,
            stairs: DEFAULT_ACTIVITY_COEFFICIENTS.STAIRS,
            hr_spike: DEFAULT_ACTIVITY_COEFFICIENTS.HR_SPIKE,
            stress_hr: DEFAULT_ACTIVITY_COEFFICIENTS.STRESS_HR
        };
    }

    private async _runOptimization(
        tuning_id: string,
        analysis_period_days: number,
        window_hours: number
    ): Promise<void> {
        const tuning = await ActivityImpactTuning.findOne({ tuning_id });
        if (!tuning) return;

        try {
            const endDate = new Date();

            tuning.logs?.push(`Generating ${window_hours}-hour time windows for ${analysis_period_days} days...`);
            await tuning.save();

            const windows = await generateTimeWindows({
                endDate,
                daysBack: analysis_period_days,
                windowHours: window_hours
            });

            tuning.logs?.push(`Generated ${windows.length} time windows`);
            await tuning.save();

            // Get ISF/ICR for baseline prediction
            const profileDoc = await getProfileAtTime(new Date());
            const profileStore = getProfileStore(profileDoc || undefined);
            const currentIsf = this._extractISFSchedule(profileStore);
            const currentIcr = this._extractICRSchedule(profileStore);

            const pythonApiUrl = process.env.PREDICTIVE_MODELS_URL || 'http://localhost:8000';
            tuning.logs?.push(`Calling Python optimizer at ${pythonApiUrl}...`);
            await tuning.save();

            const response = await fetch(`${pythonApiUrl}/api/v1/tune/activity-impact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    windows,
                    current_steps_per_minute: tuning.current_values.steps_per_minute,
                    current_calories: tuning.current_values.calories,
                    current_stairs: tuning.current_values.stairs,
                    current_hr_spike: tuning.current_values.hr_spike,
                    current_stress_hr: tuning.current_values.stress_hr,
                    current_isf: currentIsf,
                    current_icr: currentIcr,
                    lambda_l2: 0.1
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Python optimizer returned ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            tuning.logs?.push('Optimization completed successfully');

            tuning.optimized_values = {
                steps_per_minute: result.steps_per_minute,
                calories: result.calories,
                stairs: result.stairs,
                hr_spike: result.hr_spike,
                stress_hr: result.stress_hr,
                steps_per_minute_confidence: result.steps_per_minute_confidence,
                calories_confidence: result.calories_confidence,
                stairs_confidence: result.stairs_confidence,
                hr_spike_confidence: result.hr_spike_confidence,
                stress_hr_confidence: result.stress_hr_confidence,
                r_squared: result.r_squared,
                rmse: result.rmse,
                mae: result.mae,
                windows_analyzed: result.windows_analyzed
            };

            tuning.analysis_summary = {
                total_windows: result.total_windows,
                data_quality_score: result.data_quality_score
            };

            tuning.status = 'completed';
            await tuning.save();
        } catch (error: any) {
            throw new Error(`Optimization failed: ${error.message}`);
        }
    }

    private async _markFailed(tuning_id: string, error_message: string): Promise<void> {
        await ActivityImpactTuning.updateOne(
            { tuning_id },
            { status: 'failed', error_message, $push: { logs: `Failed: ${error_message}` } }
        );
    }

    private _extractISFSchedule(profileStore: any): number[] {
        if (!profileStore?.sens?.length) return [50, 50, 50, 50, 50, 50];
        return Array.from({ length: 6 }, (_, i) => {
            const date = new Date();
            date.setHours(i * 4, 0, 0, 0);
            return getValueAtTime(profileStore.sens, date) || 50;
        });
    }

    private _extractICRSchedule(profileStore: any): number[] {
        if (!profileStore?.carbratio?.length) return [10, 10, 10, 10, 10, 10];
        return Array.from({ length: 6 }, (_, i) => {
            const date = new Date();
            date.setHours(i * 4, 0, 0, 0);
            return getValueAtTime(profileStore.carbratio, date) || 10;
        });
    }
}

export const activityImpactTuningService = new ActivityImpactTuningService();
