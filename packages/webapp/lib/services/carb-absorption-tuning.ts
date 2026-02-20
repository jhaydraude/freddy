import { randomUUID } from 'crypto';
import { CarbAbsorptionTuning, ICarbAbsorptionTuning } from '../db/models/carb-absorption-tuning';
import { getProfileStore, getProfileAtTime, getValueAtTime } from '../logic/profile-logic';
import { generateTimeWindows } from '../logic/profile-analysis-logic';
import { connectToDatabase } from '../db/connection';
import { Entry, Treatment } from '../db/models';
import { getSyncWorker } from '../ns/sync-worker';

export interface CarbTuningConfig {
    analysis_period_days?: number;
    window_hours?: number;
    min_meal_events?: number;
}

export interface CarbTuningResult {
    tuning_id: string;
    status: 'syncing' | 'running' | 'completed' | 'failed' | 'applied';
    sync_progress?: number;
    current_values: {
        icr: number[];
        default_absorption_rate: number;
        min_carb_impact: number;
        s_curve_params: {
            duration_multiplier: number;
            peak_time_ratio: number;
            min_base_rate: number;
        };
    };
    optimized_values?: {
        icr: number[];
        ci_per_block: number[];            // Primary fitted value per block
        default_absorption_rate: number;
        min_carb_impact: number;
        s_curve_params: {
            duration_multiplier: number;
            peak_time_ratio: number;
            min_base_rate: number;
        };
        icr_confidence: [number, number][];
        absorption_rate_confidence: [number, number];
        min_carb_impact_confidence: [number, number];
        r_squared: number;
        rmse: number;
        mae: number;
        meal_windows_analyzed: number;
        windows_per_block: number[];       // Data density per block
    };
    analysis_summary?: {
        total_meal_events: number;
        avg_meal_size: number;
        meal_distribution_by_time: Record<string, number>;
        data_quality_score: number;
    };
    logs?: string[];
    error_message?: string;
}

export interface CarbApplyOptions {
    apply_to_profile: boolean;
    apply_to_system: boolean;
    selection?: {
        icr?: boolean[];
        default_absorption_rate?: boolean;
        min_carb_impact?: boolean;
        s_curve_params?: boolean;
    }
}

export class CarbAbsorptionTuningService {
    async startTuning(config: CarbTuningConfig, userId: string = 'default'): Promise<string> {
        await connectToDatabase();
        const tuning_id = randomUUID();

        const analysis_period_days = config.analysis_period_days || 14;
        const window_hours = config.window_hours || 2;
        const min_meal_events = config.min_meal_events || 10;

        const profileDoc = await getProfileAtTime(new Date());
        const profileStore = getProfileStore(profileDoc || undefined);

        const currentIcr = this._extractICRSchedule(profileStore);
        const currentAbsorptionRate = profileStore?.carb_absorption_rate || 30; // Default g/hr
        const currentMinCarbImpact = profileStore?.min_carb_impact || 8; // Default mg/dL/5min

        const tuning = new CarbAbsorptionTuning({
            tuning_id,
            user_id: userId,
            created_at: new Date(),
            status: 'running',
            config: {
                analysis_period_days,
                window_hours,
                min_meal_events
            },
            current_values: {
                icr: currentIcr,
                default_absorption_rate: currentAbsorptionRate,
                min_carb_impact: currentMinCarbImpact,
                s_curve_params: {
                    duration_multiplier: 1.2,
                    peak_time_ratio: 0.25,
                    min_base_rate: 10
                },
                source: 'profile'
            },
            logs: [`Tuning started at ${new Date().toISOString()}`]
        });

        await tuning.save();

        this._runOptimization(tuning_id, analysis_period_days, window_hours)
            .catch(error => {
                console.error(`Carb tuning ${tuning_id} failed:`, error);
                this._markFailed(tuning_id, error.message);
            });

        return tuning_id;
    }

    async getTuningStatus(tuning_id: string): Promise<CarbTuningResult> {
        await connectToDatabase();
        const tuning = await CarbAbsorptionTuning.findOne({ tuning_id });
        if (!tuning) throw new Error(`Tuning ${tuning_id} not found`);

        return {
            tuning_id: tuning.tuning_id,
            status: tuning.status,
            sync_progress: tuning.sync_progress,
            current_values: tuning.current_values,
            optimized_values: tuning.optimized_values,
            analysis_summary: tuning.analysis_summary?.toObject?.() || tuning.analysis_summary,
            logs: tuning.logs,
            error_message: tuning.error_message
        };
    }

    async applyTuning(tuning_id: string, options: CarbApplyOptions, userId: string = 'default'): Promise<void> {
        await connectToDatabase();
        const tuning = await CarbAbsorptionTuning.findOne({ tuning_id });
        if (!tuning || tuning.status !== 'completed' || !tuning.optimized_values) {
            throw new Error(`Cannot apply tuning ${tuning_id}`);
        }

        if (options.apply_to_system) {
            await this._updateSystemConfig(tuning.optimized_values, tuning_id, options.selection);
        }

        if (options.apply_to_profile) {
            await this._updateNightscoutProfile(tuning.optimized_values, options.selection);
        }

        tuning.status = 'applied';
        tuning.applied_at = new Date();
        tuning.applied_by = userId;
        await tuning.save();
    }

    private async _runOptimization(tuning_id: string, analysis_period_days: number, window_hours: number): Promise<void> {
        const tuning = await CarbAbsorptionTuning.findOne({ tuning_id });
        if (!tuning) return;

        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - analysis_period_days * 24 * 60 * 60 * 1000);

            // With Direct Connection, historical data is already available via the Nightscout DB connection.
            // No need to perform REST-based historical sync.

            const windows = await generateTimeWindows({ endDate, daysBack: analysis_period_days, windowHours: window_hours });

            const mealWindows = windows.filter(w => w.has_meals || w.carbs_consumed > 0);

            if (mealWindows.length < (tuning.config.min_meal_events || 10)) {
                throw new Error(`Insufficient meal data: found ${mealWindows.length} windows, need ${tuning.config.min_meal_events}`);
            }

            // Extract ISF schedule (6 four-hour blocks) from the active profile
            // so Python uses real ISF instead of the hardcoded 50.0 fallback
            const profileDoc = await getProfileAtTime(new Date());
            const profileStore = getProfileStore(profileDoc || undefined);
            const currentIsf: number[] = [];
            for (let block = 0; block < 6; block++) {
                const hour = block * 4;
                const blockDate = new Date();
                blockDate.setHours(hour, 0, 0, 0);
                currentIsf.push(getValueAtTime(profileStore?.sens, blockDate) || 50);
            }

            const pythonApiUrl = process.env.PREDICTIVE_MODELS_URL || 'http://localhost:8000';
            const response = await fetch(`${pythonApiUrl}/api/v1/tune/carb-absorption`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    windows: mealWindows,
                    current_icr: tuning.current_values.icr,
                    current_isf: currentIsf,
                    current_absorption_rate: tuning.current_values.default_absorption_rate,
                    current_min_carb_impact: tuning.current_values.min_carb_impact
                })
            });

            if (!response.ok) throw new Error(`Python optimizer error: ${await response.text()}`);

            const result = await response.json();

            tuning.optimized_values = {
                icr: result.icr,
                ci_per_block: result.ci_per_block,
                default_absorption_rate: result.absorption_rate,
                min_carb_impact: result.min_carb_impact,
                s_curve_params: result.s_curve_params || tuning.current_values.s_curve_params,
                icr_confidence: result.icr_confidence,
                absorption_rate_confidence: result.absorption_rate_confidence,
                min_carb_impact_confidence: result.min_carb_impact_confidence,
                r_squared: result.r_squared,
                rmse: result.rmse,
                mae: result.mae,
                meal_windows_analyzed: mealWindows.length,
                windows_per_block: result.windows_per_block
            };

            tuning.status = 'completed';
            tuning.logs?.push(`Optimization completed at ${new Date().toISOString()}`);
            await tuning.save();

        } catch (error: any) {
            await this._markFailed(tuning_id, error.message);
        }
    }

    private async _markFailed(tuning_id: string, error: string): Promise<void> {
        await CarbAbsorptionTuning.updateOne({ tuning_id }, {
            status: 'failed',
            error_message: error,
            $push: { logs: `Error: ${error}` }
        });
    }

    private async _updateSystemConfig(optimized_values: any, tuning_id: string, selection?: CarbApplyOptions['selection']): Promise<void> {
        const { tunedParametersService } = await import('./tuned-parameters');
        const current = await tunedParametersService.getCarbAbsorptionParameters();

        await tunedParametersService.setCarbAbsorptionParameters({
            tuning_id,
            icr: optimized_values.icr.map((val: number, i: number) =>
                (selection?.icr?.[i] !== false) ? val : (current?.icr?.[i] ?? val)
            ),
            default_absorption_rate: selection?.default_absorption_rate !== false ? optimized_values.default_absorption_rate : (current?.default_absorption_rate ?? optimized_values.default_absorption_rate),
            min_carb_impact: selection?.min_carb_impact !== false ? optimized_values.min_carb_impact : (current?.min_carb_impact ?? optimized_values.min_carb_impact),
            s_curve_params: selection?.s_curve_params !== false ? optimized_values.s_curve_params : (current?.s_curve_params ?? optimized_values.s_curve_params)
        });
    }

    private async _updateNightscoutProfile(optimized_values: any, selection?: CarbApplyOptions['selection']): Promise<void> {
        const { getNightscoutClient } = await import('../ns/ns-client');
        const nsClient = await getNightscoutClient();

        try {
            const profileDoc = await getProfileAtTime(new Date());
            if (!profileDoc) throw new Error('No active profile found');

            const updatedProfile = JSON.parse(JSON.stringify(profileDoc));
            const storeName = updatedProfile.defaultProfile;
            const store = updatedProfile.store[storeName];

            // Update ICR blocks
            if (store.carbratio) {
                for (let i = 0; i < 6; i++) {
                    if (selection?.icr?.[i] !== false) {
                        const hour = i * 4;
                        const timeStr = `${hour.toString().padStart(2, '0')}:00`;
                        const idx = store.carbratio.findIndex((r: any) => r.time === timeStr);
                        if (idx !== -1) {
                            store.carbratio[idx].value = optimized_values.icr[i];
                        } else {
                            store.carbratio.push({ time: timeStr, value: optimized_values.icr[i] });
                        }
                    }
                }
            }

            // Update absorption settings if they exist in Nightscout profile
            // Note: some NS profiles might not have these fields, but we try anyway
            if (selection?.default_absorption_rate !== false) {
                store.carb_absorption_rate = optimized_values.default_absorption_rate;
            }

            updatedProfile.startDate = new Date().toISOString();
            updatedProfile.created_at = new Date().toISOString();
            delete updatedProfile._id;
            delete updatedProfile.__v;

            await nsClient.postRest('profile', updatedProfile);
        } catch (error: any) {
            console.error('Error updating Nightscout profile for carb tuning:', error);
            throw error;
        }
    }

    private _extractICRSchedule(profileStore: any): number[] {
        if (!profileStore || !profileStore.carbratio) return [10, 10, 10, 10, 10, 10];
        const icrSchedule: number[] = [];
        for (let block = 0; block < 6; block++) {
            const hour = block * 4;
            const date = new Date();
            date.setHours(hour, 0, 0, 0);
            icrSchedule.push(getValueAtTime(profileStore.carbratio, date) || 10);
        }
        return icrSchedule;
    }
}

export const carbAbsorptionTuningService = new CarbAbsorptionTuningService();
