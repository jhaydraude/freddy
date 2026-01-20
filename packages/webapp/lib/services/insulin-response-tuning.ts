import { randomUUID } from 'crypto';
import { InsulinResponseTuning, IInsulinResponseTuning } from '../db/models/insulin-response-tuning';
import { getProfileStore, getProfileAtTime, getValueAtTime } from '../logic/profile-logic';
import { generateTimeWindows } from '../logic/profile-analysis-logic';
import { Entry, Treatment } from '../db/models';
import { getSyncWorker } from '../ns/sync-worker';

/**
 * Configuration for insulin response tuning
 */
export interface TuningConfig {
    analysis_period_days?: number;
    window_hours?: number;
    include_activity?: boolean;
}

/**
 * Result from a tuning run
 */
export interface TuningResult {
    tuning_id: string;
    status: 'syncing' | 'running' | 'completed' | 'failed';
    sync_progress?: number;
    progress?: number;
    current_values: {
        dia: number;
        peak: number;
        isf: number[];
    };
    optimized_values?: {
        dia: number;
        peak: number;
        isf: number[];
        dia_confidence: [number, number];
        peak_confidence: [number, number];
        isf_confidence: [number, number][];
        r_squared: number;
        rmse: number;
        mae: number;
        windows_analyzed: number;
    };
    analysis_summary?: {
        total_windows: number;
        stable_windows: number;
        meal_windows: number;
        activity_windows: number;
        data_quality_score: number;
    };
    logs?: string[];
    error_message?: string;
}

/**
 * Options for applying tuning results
 */
export interface ApplyOptions {
    apply_to_profile: boolean;
    apply_to_system: boolean;
    selection?: {
        dia?: boolean;
        peak?: boolean;
        isf?: boolean[]; // 6 blocks
    }
}

/**
 * Service for managing insulin response parameter tuning
 */
export class InsulinResponseTuningService {
    /**
     * Start a new tuning run
     */
    async startTuning(config: TuningConfig, userId: string = 'default'): Promise<string> {
        const tuning_id = randomUUID();

        // Set defaults
        const analysis_period_days = config.analysis_period_days || 14;
        const window_hours = config.window_hours || 2;
        const include_activity = config.include_activity !== false;
        const min_windows_required = 10;

        // Get current profile values
        const profileDoc = await getProfileAtTime(new Date());
        const profileStore = getProfileStore(profileDoc || undefined);
        const currentDia = profileStore?.dia || 5;
        const currentPeak = this._detectPeakTime(profileStore);
        const currentIsf = this._extractISFSchedule(profileStore);

        // Create tuning record
        const tuning = new InsulinResponseTuning({
            tuning_id,
            user_id: userId,
            created_at: new Date(),
            status: 'running',
            config: {
                analysis_period_days,
                window_hours,
                include_activity,
                min_windows_required
            },
            current_values: {
                dia: currentDia,
                peak: currentPeak,
                isf: currentIsf,
                source: 'profile'
            },
            logs: [`Tuning started at ${new Date().toISOString()}`]
        });

        await tuning.save();

        // Start async optimization process
        this._runOptimization(tuning_id, analysis_period_days, window_hours, include_activity)
            .catch(error => {
                console.error(`Tuning ${tuning_id} failed:`, error);
                this._markFailed(tuning_id, error.message);
            });

        return tuning_id;
    }

    /**
     * Get tuning status and results
     */
    async getTuningStatus(tuning_id: string): Promise<TuningResult> {
        const tuning = await InsulinResponseTuning.findOne({ tuning_id });

        if (!tuning) {
            throw new Error(`Tuning ${tuning_id} not found`);
        }

        return {
            tuning_id: tuning.tuning_id,
            status: tuning.status,
            sync_progress: tuning.sync_progress,
            current_values: tuning.current_values,
            optimized_values: tuning.optimized_values,
            analysis_summary: tuning.analysis_summary,
            logs: tuning.logs,
            error_message: tuning.error_message
        };
    }

    /**
     * Apply tuning results
     */
    async applyTuning(tuning_id: string, options: ApplyOptions, userId: string = 'default'): Promise<void> {
        const tuning = await InsulinResponseTuning.findOne({ tuning_id });

        if (!tuning) {
            throw new Error(`Tuning ${tuning_id} not found`);
        }

        if (tuning.status !== 'completed') {
            throw new Error(`Cannot apply tuning ${tuning_id} with status ${tuning.status}`);
        }

        if (!tuning.optimized_values) {
            throw new Error(`No optimized values found for tuning ${tuning_id}`);
        }

        // Update system_config
        if (options.apply_to_system) {
            await this._updateSystemConfig(tuning.optimized_values, tuning_id, options.selection);
        }

        // Update Nightscout profile
        if (options.apply_to_profile) {
            await this._updateNightscoutProfile(tuning.optimized_values, options.selection);
        }

        // Mark as applied
        tuning.status = 'applied';
        tuning.applied_at = new Date();
        tuning.applied_by = userId;
        await tuning.save();

        // Invalidate caches
        const { ComputedStatus } = await import('../db/models');
        const MAX_DIA_HOURS = 8;
        const invalidationStart = new Date(Date.now() - MAX_DIA_HOURS * 60 * 60 * 1000);

        await ComputedStatus.deleteMany({
            timestamp: { $gte: invalidationStart }
        });

        // Clear local profile cache
        const { clearProfileCache } = await import('../logic/profile-logic');
        clearProfileCache();

        console.log(`Invalidated computed status cache from ${invalidationStart.toISOString()} onwards and cleared profile cache`);
    }

    /**
     * Get tuning history
     */
    async getTuningHistory(userId: string = 'default', limit: number = 10): Promise<TuningResult[]> {
        const tunings = await InsulinResponseTuning
            .find({ user_id: userId })
            .sort({ created_at: -1 })
            .limit(limit);

        return tunings.map(t => ({
            tuning_id: t.tuning_id,
            status: t.status,
            current_values: t.current_values,
            optimized_values: t.optimized_values,
            analysis_summary: t.analysis_summary
        }));
    }

    /**
     * Get active insulin response parameters
     */
    async getActiveParameters(): Promise<{ dia: number; peak: number; isf: number[] }> {
        // Check system_config for tuned parameters first
        const { tunedParametersService } = await import('./tuned-parameters');
        const tunedParams = await tunedParametersService.getInsulinResponseParameters();

        if (tunedParams) {
            console.log(`Using tuned parameters from tuning ${tunedParams.tuning_id}`);
            return {
                dia: tunedParams.dia,
                peak: tunedParams.peak,
                isf: tunedParams.isf
            };
        }

        // Fallback to profile
        console.log('Using parameters from profile (no tuned parameters found)');
        const profileDoc = await getProfileAtTime(new Date());
        const profileStore = getProfileStore(profileDoc || undefined);
        return {
            dia: profileStore?.dia || 5,
            peak: 45,
            isf: this._extractISFSchedule(profileStore)
        };
    }

    // Private helper methods

    private async _runOptimization(
        tuning_id: string,
        analysis_period_days: number,
        window_hours: number,
        include_activity: boolean
    ): Promise<void> {
        const tuning = await InsulinResponseTuning.findOne({ tuning_id });
        if (!tuning) return;

        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - analysis_period_days * 24 * 60 * 60 * 1000);

            // With Direct Connection, historical data is always available directly from Nightscout DB.
            // No need to perform REST-based historical sync.

            // Generate time windows

            tuning.logs?.push(`Generating time windows from ${startDate.toISOString()} to ${endDate.toISOString()}`);
            await tuning.save();

            const windows = await generateTimeWindows({ endDate, daysBack: analysis_period_days, windowHours: window_hours });

            tuning.logs?.push(`Generated ${windows.length} time windows`);
            await tuning.save();

            // Call Python optimizer
            const pythonApiUrl = process.env.PREDICTIVE_MODELS_URL || 'http://localhost:8000';

            tuning.logs?.push(`Calling Python optimizer at ${pythonApiUrl}`);
            await tuning.save();

            const response = await fetch(`${pythonApiUrl}/api/v1/tune/insulin-response`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    windows: windows,
                    current_dia: tuning.current_values.dia,
                    current_peak: tuning.current_values.peak,
                    current_isf: tuning.current_values.isf,
                    optimize_dia: true,
                    optimize_peak: true,
                    optimize_isf: true,
                    lambda_l2: 0.1,
                    lambda_smooth: 0.05
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Python optimizer returned ${response.status}: ${errorText}`);
            }

            const result = await response.json();

            tuning.logs?.push(`Optimization completed successfully`);

            // Store optimized results
            tuning.optimized_values = {
                dia: result.dia,
                peak: result.peak,
                isf: result.isf,
                dia_confidence: result.dia_confidence,
                peak_confidence: result.peak_confidence,
                isf_confidence: result.isf_confidence,
                r_squared: result.r_squared,
                rmse: result.rmse,
                mae: result.mae,
                windows_analyzed: result.windows_analyzed
            };

            tuning.analysis_summary = {
                total_windows: result.total_windows,
                stable_windows: result.stable_windows,
                meal_windows: result.meal_windows,
                activity_windows: result.activity_windows,
                data_quality_score: result.data_quality_score
            };

            tuning.status = 'completed';
            await tuning.save();

        } catch (error: any) {
            throw new Error(`Optimization failed: ${error.message}`);
        }
    }

    private async _markFailed(tuning_id: string, error_message: string): Promise<void> {
        await InsulinResponseTuning.updateOne(
            { tuning_id },
            {
                status: 'failed',
                error_message,
                $push: { logs: `Failed: ${error_message}` }
            }
        );
    }

    private async _updateSystemConfig(optimized_values: any, tuning_id: string, selection?: ApplyOptions['selection']): Promise<void> {
        const { tunedParametersService } = await import('./tuned-parameters');

        // Get current values to fill in unselected parameters
        const current = await tunedParametersService.getInsulinResponseParameters();

        await tunedParametersService.setInsulinResponseParameters({
            tuning_id,
            dia: selection?.dia !== false ? optimized_values.dia : (current?.dia ?? optimized_values.dia),
            peak: selection?.peak !== false ? optimized_values.peak : (current?.peak ?? optimized_values.peak),
            isf: optimized_values.isf.map((val: number, i: number) =>
                (selection?.isf?.[i] !== false) ? val : (current?.isf?.[i] ?? val)
            )
        });

        console.log(`System config updated with tuning ${tuning_id} (Selective sync: ${JSON.stringify(selection)})`);
    }

    private async _updateNightscoutProfile(optimized_values: any, selection?: ApplyOptions['selection']): Promise<void> {
        const { getNSClient } = await import('../ns/ns-client');
        const nsClient = getNSClient();

        if (!nsClient) {
            console.error('Cannot update Nightscout profile: NS client not configured');
            return;
        }

        try {
            // 1. Get current profile document
            const profileDoc = await getProfileAtTime(new Date());
            if (!profileDoc) {
                console.error('Cannot update Nightscout profile: No active profile found');
                return;
            }

            // 2. Clone and update the profile
            const updatedProfile = JSON.parse(JSON.stringify(profileDoc.toObject ? profileDoc.toObject() : profileDoc));
            const defaultProfileName = updatedProfile.defaultProfile;
            const profileStore = updatedProfile.store[defaultProfileName];

            if (!profileStore) {
                console.error(`Cannot update Nightscout profile: Store "${defaultProfileName}" not found`);
                return;
            }

            // Update DIA
            if (selection?.dia !== false) {
                profileStore.dia = optimized_values.dia;
            }

            // Update Peak
            if (selection?.peak !== false) {
                profileStore.peak = optimized_values.peak;
            }

            // Update ISF (sens)
            if (selection?.isf?.some(s => s !== false) !== false) { // If any ISF block is selected (or if no selection provided)
                const newSens: Array<{ time: string, value: number }> = [];
                const currentSens = profileStore.sens || [];

                for (let block = 0; block < 6; block++) {
                    const hour = block * 4;
                    const timeStr = `${hour.toString().padStart(2, '0')}:00`;

                    if (selection?.isf?.[block] !== false) {
                        newSens.push({
                            time: timeStr,
                            value: Math.round(optimized_values.isf[block] * 10) / 10
                        });
                    } else {
                        // Keep current value if possible
                        const existing = currentSens.find((s: any) => s.time === timeStr);
                        if (existing) {
                            newSens.push(existing);
                        } else {
                            // Fallback to value at time if no exact match
                            // Note: getValueAtTime expects a Date object for the time parameter in this context
                            const date = new Date();
                            date.setHours(hour, 0, 0, 0);
                            const val = getValueAtTime(currentSens, date);
                            newSens.push({ time: timeStr, value: val });
                        }
                    }
                }
                profileStore.sens = newSens;
            }

            // Update metadata
            updatedProfile.startDate = new Date().toISOString();
            updatedProfile.created_at = new Date().toISOString();
            delete updatedProfile._id;
            delete updatedProfile.__v;

            // 3. Post to Nightscout
            await nsClient.postRest('profile', updatedProfile);
            console.log(`Successfully updated Nightscout profile (Selective sync: ${JSON.stringify(selection)})`);

        } catch (error: any) {
            console.error('Error updating Nightscout profile:', error);
            throw new Error(`Failed to update Nightscout profile: ${error.message}`);
        }
    }

    private _extractISFSchedule(profileStore: any): number[] {
        // Extract 6 time blocks (4-hour periods) from profile ISF schedule
        // Time blocks: 00:00-04:00, 04:00-08:00, 08:00-12:00, 12:00-16:00, 16:00-20:00, 20:00-24:00

        if (!profileStore || !profileStore.sens || profileStore.sens.length === 0) {
            // Return default values if no profile data
            return [50, 50, 50, 50, 50, 50];
        }

        const isfSchedule: number[] = [];

        // For each 4-hour block, get the ISF value at the start of that block
        for (let block = 0; block < 6; block++) {
            const hour = block * 4;
            const date = new Date();
            date.setHours(hour, 0, 0, 0);

            // Use getValueAtTime to find the active ISF for this time
            const isf = getValueAtTime(profileStore.sens, date);
            isfSchedule.push(isf || 50); // Default to 50 if not found
        }

        return isfSchedule;
    }

    private _extractICRSchedule(profileStore: any): number[] {
        // Extract 6 time blocks (4-hour periods) from profile ICR schedule

        if (!profileStore || !profileStore.carbratio || profileStore.carbratio.length === 0) {
            // Return default values if no profile data
            return [10, 10, 10, 10, 10, 10];
        }

        const icrSchedule: number[] = [];

        // For each 4-hour block, get the ICR value at the start of that block
        for (let block = 0; block < 6; block++) {
            const hour = block * 4;
            const date = new Date();
            date.setHours(hour, 0, 0, 0);

            const icr = getValueAtTime(profileStore.carbratio, date);
            icrSchedule.push(icr || 10); // Default to 10 if not found
        }

        return icrSchedule;
    }

    private _extractBasalSchedule(profileStore: any): number[] {
        // Extract 6 time blocks (4-hour periods) from profile basal schedule

        if (!profileStore || !profileStore.basal || profileStore.basal.length === 0) {
            // Return default values if no profile data
            return [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
        }

        const basalSchedule: number[] = [];

        // For each 4-hour block, get the basal rate at the start of that block
        for (let block = 0; block < 6; block++) {
            const hour = block * 4;
            const date = new Date();
            date.setHours(hour, 0, 0, 0);

            const basal = getValueAtTime(profileStore.basal, date);
            basalSchedule.push(basal || 1.0); // Default to 1.0 U/hr if not found
        }

        return basalSchedule;
    }

    private _detectPeakTime(profileStore: any): number {
        if (!profileStore) return 45;

        // Dynamic Peak Detection logic from iob-logic
        const curve = profileStore.curve || 'ultra-rapid';
        if (curve === 'rapid-acting') return 55;   // Humalog/Novolog
        if (curve === 'ultra-rapid') return 45;    // Fiasp/Lyumjev
        return 45; // Default to 45m
    }
}

// Export singleton instance
export const insulinResponseTuningService = new InsulinResponseTuningService();
