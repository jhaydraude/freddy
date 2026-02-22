import { randomUUID } from 'crypto';
import { UnifiedFoundationTuning } from '../db/models/unified-foundation-tuning';
import { getProfileStore, getProfileAtTime, getValueAtTime, resolveActiveProfile } from '../logic/profile-logic';
import { generateTimeWindows } from '../logic/profile-analysis-logic';
import { connectToDatabase } from '../db/connection';
import { normalizeISF, denormalizeISF } from '../logic/unit-conversion';

export interface UnifiedTuningConfig {
    analysis_period_days?: number;
    window_hours?: number;
    include_activity?: boolean;
    min_windows_required?: number;
}

export interface UnifiedTuningResult {
    tuning_id: string;
    status: 'syncing' | 'running' | 'completed' | 'failed' | 'applied';
    current_values: {
        dia: number;
        peak: number;
        isf: number[];
        basal: number[];
    };
    optimized_values?: {
        dia: number;
        peak: number;
        isf: number[];
        basal: number[];
        dia_confidence: [number, number];
        peak_confidence: [number, number];
        isf_confidence: [number, number][];
        basal_confidence: [number, number][];
        r_squared: number;
        rmse: number;
        mae: number;
        windows_analyzed: number;
    };
    logs?: string[];
    error_message?: string;
}

export class UnifiedFoundationTuningService {
    async startTuning(config: UnifiedTuningConfig, userId: string = 'default'): Promise<string> {
        await connectToDatabase();
        const tuning_id = randomUUID();

        const analysis_period_days = config.analysis_period_days || 14;
        const window_hours = config.window_hours || 2;
        const include_activity = config.include_activity !== false;
        const min_windows_required = config.min_windows_required || 15;

        const profileInfo = await resolveActiveProfile(new Date());
        const profileStore = getProfileStore(profileInfo?.doc || undefined, profileInfo?.activeProfileName, profileInfo?.profileData || undefined);

        const current_values = {
            dia: profileStore?.dia || 5.0,
            peak: this._detectPeakTime(profileStore),
            isf: this._extractISFSchedule(profileStore, 6),   // 4-hour blocks
            basal: this._extractBasalSchedule(profileStore, 12), // 2-hour blocks
            units: (profileStore?.units || 'mg/dL').toLowerCase().includes('mmol') ? 'mmol/L' : 'mg/dL' as 'mg/dL' | 'mmol/L',
            source: 'profile' as const
        };

        const tuning = new UnifiedFoundationTuning({
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
            current_values,
            logs: [`Unified Foundation Tuning started at ${new Date().toISOString()}`]
        });

        await tuning.save();

        this._runOptimization(tuning_id, analysis_period_days, window_hours)
            .catch(error => {
                console.error(`Unified tuning ${tuning_id} failed:`, error);
                this._markFailed(tuning_id, error.message);
            });

        return tuning_id;
    }

    private async _runOptimization(tuning_id: string, analysis_period_days: number, window_hours: number): Promise<void> {
        const tuning = await UnifiedFoundationTuning.findOne({ tuning_id });
        if (!tuning) return;

        try {
            const endDate = new Date();
            // Use existing logic for window generation
            const windows = await generateTimeWindows({
                endDate,
                daysBack: analysis_period_days,
                windowHours: window_hours
            });

            // Filter for foundation-quality windows (mostly basal-ish, but including bolus tails)
            const foundationWindows = windows.filter(w =>
                w.data_quality.readings_count >= 6 &&
                w.isolation_confidence !== undefined &&
                w.isolation_confidence >= 0.1 && // Reduced from 0.2
                w.carb_absorption <= 5.0 && // Increased from 2.0 to catch more late-night data
                Math.abs(w.unexplained_residual || 0) <= 50 // Filter out unlogged carbs/sensor errors
            );

            tuning.logs.push(`Found ${foundationWindows.length} foundation-compatible windows.`);
            await tuning.save();

            if (foundationWindows.length < tuning.config.min_windows_required) {
                throw new Error(`Insufficient foundation windows (${foundationWindows.length}). Need at least ${tuning.config.min_windows_required}.`);
            }

            tuning.logs.push('Calling the predictive-models Python API for Unified Foundation Optimization...');
            await tuning.save();

            // Normalize ISF to mg/dL for consistent mathematical analysis in Python
            const normalizedISF = tuning.current_values.isf.map(v => normalizeISF(v, tuning.current_values.units));

            const response = await fetch(`${process.env.PREDICTIVE_MODELS_URL || 'http://localhost:8000'}/api/v1/tune/unified-foundation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    windows: foundationWindows,
                    current_dia: tuning.current_values.dia,
                    current_peak: tuning.current_values.peak,
                    current_isf: normalizedISF,
                    current_basal: tuning.current_values.basal
                })
            });

            if (!response.ok) {
                const err = await response.json();
                const errorStr = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
                throw new Error(errorStr || 'Python API failed');
            }

            const optimized = await response.json();

            // Denormalize ISF back to user's units
            optimized.isf = optimized.isf.map((v: number) => denormalizeISF(v, tuning.current_values.units));
            optimized.isf_confidence = optimized.isf_confidence.map((range: [number, number]) => [
                denormalizeISF(range[0], tuning.current_values.units),
                denormalizeISF(range[1], tuning.current_values.units)
            ]);

            tuning.status = 'completed';
            // Calculate time-of-day distribution for foundation windows (2-hour bins)
            const distribution = new Array(12).fill(0);
            foundationWindows.forEach(w => {
                const hour = w.hour_of_day;
                const bin = Math.floor(hour / 2);
                distribution[bin]++;
            });

            tuning.optimized_values = optimized;
            tuning.analysis_summary = {
                total_windows: windows.length,
                stable_windows: windows.filter(w => w.is_stable).length,
                meal_windows: windows.filter(w => w.has_meals).length,
                activity_windows: windows.filter(w => w.activity_steps > 0).length,
                data_quality_score: optimized.data_quality_score,
                window_distribution: distribution
            };
            tuning.logs.push('Unified optimization complete.');
            await tuning.save();

        } catch (error: any) {
            tuning.status = 'failed';
            tuning.error_message = error.message;
            tuning.logs.push(`Error: ${error.message}`);
            await tuning.save();
        }
    }

    private _markFailed(tuning_id: string, message: string) {
        UnifiedFoundationTuning.findOneAndUpdate({ tuning_id }, {
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

    private _detectPeakTime(profileStore: any): number {
        if (!profileStore) return 45;
        const curve = profileStore.curve || 'ultra-rapid';
        if (curve === 'rapid-acting') return 55;
        if (curve === 'ultra-rapid') return 45;
        return 45;
    }
}

export const unifiedFoundationTuningService = new UnifiedFoundationTuningService();
