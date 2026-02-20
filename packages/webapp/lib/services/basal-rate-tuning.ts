import { randomUUID } from 'crypto';
import { BasalRateTuning, IBasalRateTuning } from '../db/models/basal-rate-tuning';
import { getProfileStore, getProfileAtTime, getValueAtTime } from '../logic/profile-logic';
import { generateTimeWindows } from '../logic/profile-analysis-logic';
import { connectToDatabase } from '../db/connection';
import { SystemConfig } from '../db/models';

export interface BasalTuningConfig {
    analysis_period_days?: number;
    window_hours?: number;
    min_basal_events?: number;
}

export interface BasalTuningResult {
    tuning_id: string;
    status: 'syncing' | 'running' | 'completed' | 'failed' | 'applied';
    sync_progress?: number;
    current_values: {
        rates: number[];
    };
    optimized_values?: {
        rates: number[];
        rates_confidence: [number, number][];
        drift_per_block: number[];
        windows_per_block: number[];
        rmse: number;
        mae: number;
        r_squared: number;
        clean_windows_analyzed: number;
    };
    analysis_summary?: {
        data_quality_score: number;
    };
    logs?: string[];
    error_message?: string;
}

export interface BasalApplyOptions {
    apply_to_profile: boolean;
    apply_to_system: boolean;
    selection?: {
        rates?: boolean[];
    }
}

export class BasalRateTuningService {
    async startTuning(config: BasalTuningConfig, userId: string = 'default'): Promise<string> {
        await connectToDatabase();
        const tuning_id = randomUUID();

        const analysis_period_days = config.analysis_period_days || 14;
        const window_hours = config.window_hours || 2;
        const min_basal_events = config.min_basal_events || 10;

        const profileDoc = await getProfileAtTime(new Date());
        const profileStore = getProfileStore(profileDoc || undefined);

        const currentRates = this._extractBasalSchedule(profileStore);

        const tuning = new BasalRateTuning({
            tuning_id,
            user_id: userId,
            created_at: new Date(),
            status: 'running',
            config: {
                analysis_period_days,
                window_hours,
                min_basal_events
            },
            current_values: {
                rates: currentRates,
                source: 'profile'
            },
            logs: [`Tuning started at ${new Date().toISOString()}`]
        });

        await tuning.save();

        this._runOptimization(tuning_id, analysis_period_days, window_hours)
            .catch(error => {
                console.error(`Basal tuning ${tuning_id} failed:`, error);
                this._markFailed(tuning_id, error.message);
            });

        return tuning_id;
    }

    async getTuningStatus(tuning_id: string): Promise<BasalTuningResult> {
        await connectToDatabase();
        const tuning = await BasalRateTuning.findOne({ tuning_id });
        if (!tuning) throw new Error(`Tuning ${tuning_id} not found`);

        return {
            tuning_id: tuning.tuning_id,
            status: tuning.status,
            sync_progress: tuning.sync_progress,
            current_values: {
                rates: tuning.current_values.rates
            },
            optimized_values: tuning.optimized_values ? {
                rates: tuning.optimized_values.rates,
                rates_confidence: tuning.optimized_values.rates_confidence as [number, number][],
                drift_per_block: tuning.optimized_values.drift_per_block,
                windows_per_block: tuning.optimized_values.windows_per_block,
                rmse: tuning.optimized_values.rmse,
                mae: tuning.optimized_values.mae,
                r_squared: tuning.optimized_values.r_squared,
                clean_windows_analyzed: tuning.optimized_values.clean_windows_analyzed
            } : undefined,
            analysis_summary: tuning.analysis_summary,
            logs: tuning.logs,
            error_message: tuning.error_message
        };
    }

    async applyTuning(tuning_id: string, options: BasalApplyOptions, userId: string = 'default'): Promise<void> {
        await connectToDatabase();
        const tuning = await BasalRateTuning.findOne({ tuning_id });
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
        const tuning = await BasalRateTuning.findOne({ tuning_id });
        if (!tuning) return;

        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - analysis_period_days * 24 * 60 * 60 * 1000);

            tuning.logs.push(`Generating pure basal windows for the last ${analysis_period_days} days...`);
            await tuning.save();

            const windows = await generateTimeWindows({ endDate, daysBack: analysis_period_days, windowHours: window_hours });
            const pureBasalWindows = windows.filter(w =>
                w.data_quality.has_activity_data &&
                w.data_quality.readings_count >= 6 &&
                w.basal_drift !== undefined &&
                w.isolation_confidence !== undefined &&
                w.isolation_confidence >= 0.2
            );

            tuning.logs.push(`Found ${pureBasalWindows.length} pure basal windows.`);
            await tuning.save();

            if (pureBasalWindows.length < tuning.config.min_basal_events) {
                throw new Error(`Insufficient clean basal windows (${pureBasalWindows.length}). Need at least ${tuning.config.min_basal_events}.`);
            }

            tuning.logs.push('Calling the predictive-models Python API for Constrained L-BFGS-B optimization...');
            await tuning.save();

            const profileDoc = await getProfileAtTime(new Date());
            const profileStore = getProfileStore(profileDoc || undefined);

            const current_rates = this._extractBasalSchedule(profileStore);
            const current_isf = this._extractISFSchedule(profileStore);

            const payload = {
                windows: pureBasalWindows,
                current_rates,
                current_isf
            };

            const response = await fetch('http://localhost:8000/api/v1/tune/basal-rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Python API returned ${response.status}: ${errorText}`);
            }

            const optResult = await response.json();

            tuning.optimized_values = {
                rates: optResult.rates,
                rates_confidence: optResult.rates_confidence,
                drift_per_block: optResult.drift_per_block,
                windows_per_block: optResult.windows_per_block,
                rmse: optResult.rmse,
                mae: optResult.mae,
                r_squared: optResult.r_squared,
                clean_windows_analyzed: optResult.clean_windows_analyzed
            };

            const dataQuality = pureBasalWindows.reduce((sum, w) => sum + (w.data_quality.readings_count / 12), 0) / pureBasalWindows.length;

            tuning.analysis_summary = {
                data_quality_score: Math.min(1.0, dataQuality)
            };

            tuning.status = 'completed';
            tuning.logs.push(`Optimization complete! Validated ${optResult.clean_windows_analyzed} clean windows.`);
            await tuning.save();

        } catch (error: any) {
            console.error(`Basal Optimization failed for ${tuning_id}:`, error);
            await this._markFailed(tuning_id, error.message);
        }
    }

    private async _markFailed(tuning_id: string, message: string) {
        await BasalRateTuning.updateOne(
            { tuning_id },
            {
                $set: {
                    status: 'failed',
                    error_message: message
                },
                $push: { logs: `Error: ${message}` }
            }
        );
    }

    private async _updateSystemConfig(optimized_values: any, tuning_id: string, selection?: BasalApplyOptions['selection']): Promise<void> {
        const { tunedParametersService } = await import('./tuned-parameters');
        const current = await tunedParametersService.getBasalRates();

        const newRates = optimized_values.rates.map((val: number, i: number) =>
            (selection?.rates?.[i] !== false) ? val : (current?.rates?.[i] ?? val)
        );

        await tunedParametersService.setBasalRates({
            tuning_id,
            rates: newRates
        });
    }

    private async _updateNightscoutProfile(optimized_values: any, selection?: BasalApplyOptions['selection']): Promise<void> {
        const { getNightscoutClient } = await import('../ns/ns-client');
        const nsClient = await getNightscoutClient();

        try {
            const profileDoc = await getProfileAtTime(new Date());
            if (!profileDoc) throw new Error('No active profile found');

            const updatedProfile = JSON.parse(JSON.stringify(profileDoc));
            const storeName = updatedProfile.defaultProfile;
            const store = updatedProfile.store[storeName];

            // Update Basal blocks
            if (store.basal) {
                for (let i = 0; i < 12; i++) {
                    if (selection?.rates?.[i] !== false) {
                        const hour = i * 2;
                        const timeStr = `${hour.toString().padStart(2, '0')}:00`;
                        const idx = store.basal.findIndex((r: any) => r.time === timeStr);
                        if (idx !== -1) {
                            store.basal[idx].value = optimized_values.rates[i];
                        } else {
                            store.basal.push({ time: timeStr, value: optimized_values.rates[i] });
                        }
                    }
                }
                // Ensure sorted
                store.basal.sort((a: any, b: any) => a.time.localeCompare(b.time));
            }

            updatedProfile.startDate = new Date().toISOString();
            updatedProfile.created_at = new Date().toISOString();
            delete updatedProfile._id;
            delete updatedProfile.__v;

            await nsClient.postRest('profile', updatedProfile);
        } catch (error: any) {
            console.error('Error updating Nightscout profile for basal tuning:', error);
            throw error;
        }
    }

    private _extractBasalSchedule(profileStore: any): number[] {
        const blocks = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]; // hours
        const schedule = [];
        for (const h of blocks) {
            // Create dummy date at that hour in current local timezone to pull value
            const d = new Date();
            d.setHours(h, 0, 0, 0);

            if (profileStore?.basal) {
                schedule.push(getValueAtTime(profileStore.basal, d));
            } else {
                schedule.push(1.0); // Safe fallback
            }
        }
        return schedule;
    }

    private _extractISFSchedule(profileStore: any): number[] {
        const blocks = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]; // hours
        const schedule = [];
        for (const h of blocks) {
            const d = new Date();
            d.setHours(h, 0, 0, 0);

            if (profileStore?.sens) {
                schedule.push(getValueAtTime(profileStore.sens, d));
            } else {
                schedule.push(50.0);
            }
        }
        return schedule;
    }
}

export const basalRateTuningService = new BasalRateTuningService();
