import { SystemConfig } from '../db/models';

/**
 * Service for managing tuned parameters in system config
 */
export class TunedParametersService {
    private static readonly INSULIN_RESPONSE_KEY = 'tuned_insulin_response';
    private static readonly CARB_ABSORPTION_KEY = 'tuned_carb_absorption';
    private static readonly BASAL_RATES_KEY = 'tuned_basal_rates';
    private static readonly ACTIVITY_PARAMS_KEY = 'tuned_activity_parameters';

    /**
     * Store tuned insulin response parameters
     */
    async setInsulinResponseParameters(params: {
        tuning_id: string;
        dia: number;
        peak: number;
        isf: number[];
    }): Promise<void> {
        await SystemConfig.findOneAndUpdate(
            { key: TunedParametersService.INSULIN_RESPONSE_KEY },
            {
                key: TunedParametersService.INSULIN_RESPONSE_KEY,
                value: {
                    ...params,
                    applied_at: new Date()
                },
                updated_at: new Date()
            },
            { upsert: true, new: true }
        );
    }

    /**
     * Get tuned insulin response parameters
     */
    async getInsulinResponseParameters(): Promise<{
        tuning_id: string;
        dia: number;
        peak: number;
        isf: number[];
        applied_at: Date;
    } | null> {
        const config = await SystemConfig.findOne({
            key: TunedParametersService.INSULIN_RESPONSE_KEY
        });

        return config?.value || null;
    }

    /**
     * Clear tuned insulin response parameters (revert to profile)
     */
    async clearInsulinResponseParameters(): Promise<void> {
        await SystemConfig.deleteOne({
            key: TunedParametersService.INSULIN_RESPONSE_KEY
        });
    }

    /**
     * Check if insulin response parameters are tuned
     */
    async hasInsulinResponseParameters(): Promise<boolean> {
        const count = await SystemConfig.countDocuments({
            key: TunedParametersService.INSULIN_RESPONSE_KEY
        });
        return count > 0;
    }

    /**
     * Store tuned carb absorption parameters (Phase 2)
     */
    async setCarbAbsorptionParameters(params: {
        tuning_id: string;
        icr: number[];
        default_absorption_rate: number;
        min_carb_impact: number;
        s_curve_params: {
            duration_multiplier: number;
            peak_time_ratio: number;
            min_base_rate: number;
        };
    }): Promise<void> {
        await SystemConfig.findOneAndUpdate(
            { key: TunedParametersService.CARB_ABSORPTION_KEY },
            {
                key: TunedParametersService.CARB_ABSORPTION_KEY,
                value: {
                    ...params,
                    applied_at: new Date()
                },
                updated_at: new Date()
            },
            { upsert: true, new: true }
        );
    }

    /**
     * Get tuned carb absorption parameters
     */
    async getCarbAbsorptionParameters(): Promise<any | null> {
        const config = await SystemConfig.findOne({
            key: TunedParametersService.CARB_ABSORPTION_KEY
        });
        return config?.value || null;
    }

    /**
     * Store tuned basal rates (Phase 3)
     */
    async setBasalRates(params: {
        tuning_id: string;
        rates: number[];
    }): Promise<void> {
        await SystemConfig.findOneAndUpdate(
            { key: TunedParametersService.BASAL_RATES_KEY },
            {
                key: TunedParametersService.BASAL_RATES_KEY,
                value: {
                    ...params,
                    applied_at: new Date()
                },
                updated_at: new Date()
            },
            { upsert: true, new: true }
        );
    }

    /**
     * Get tuned basal rates
     */
    async getBasalRates(): Promise<any | null> {
        const config = await SystemConfig.findOne({
            key: TunedParametersService.BASAL_RATES_KEY
        });
        return config?.value || null;
    }

    /**
     * Store tuned activity parameters (Phase 4)
     */
    async setActivityParameters(params: {
        tuning_id: string;
        coefficients: {
            steps_per_minute: number;
            hr_spike: number;
            calories: number;
            stairs: number;
        };
        baselines?: {
            resting_hr: number;
            baseline_steps_per_min: number;
        };
    }): Promise<void> {
        await SystemConfig.findOneAndUpdate(
            { key: TunedParametersService.ACTIVITY_PARAMS_KEY },
            {
                key: TunedParametersService.ACTIVITY_PARAMS_KEY,
                value: {
                    ...params,
                    applied_at: new Date()
                },
                updated_at: new Date()
            },
            { upsert: true, new: true }
        );
    }

    /**
     * Get tuned activity parameters
     */
    async getActivityParameters(): Promise<any | null> {
        const config = await SystemConfig.findOne({
            key: TunedParametersService.ACTIVITY_PARAMS_KEY
        });
        return config?.value || null;
    }

    /**
     * Get all tuned parameters summary
     */
    async getAllTunedParameters(): Promise<{
        insulin_response: any | null;
        carb_absorption: any | null;
        basal_rates: any | null;
        activity_parameters: any | null;
    }> {
        const [insulinResponse, carbAbsorption, basalRates, activityParams] = await Promise.all([
            this.getInsulinResponseParameters(),
            this.getCarbAbsorptionParameters(),
            this.getBasalRates(),
            this.getActivityParameters()
        ]);

        return {
            insulin_response: insulinResponse,
            carb_absorption: carbAbsorption,
            basal_rates: basalRates,
            activity_parameters: activityParams
        };
    }

    /**
     * Clear all tuned parameters (revert to profile defaults)
     */
    async clearAllTunedParameters(): Promise<void> {
        await SystemConfig.deleteMany({
            key: {
                $in: [
                    TunedParametersService.INSULIN_RESPONSE_KEY,
                    TunedParametersService.CARB_ABSORPTION_KEY,
                    TunedParametersService.BASAL_RATES_KEY,
                    TunedParametersService.ACTIVITY_PARAMS_KEY
                ]
            }
        });
    }
}

// Export singleton instance
export const tunedParametersService = new TunedParametersService();
