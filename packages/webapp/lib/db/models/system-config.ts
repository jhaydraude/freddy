import mongoose, { Document, Schema } from 'mongoose';

/**
 * System Configuration Interface
 * Stores system-wide configuration including tuned parameters
 */
export interface ISystemConfig extends Document {
    config_id: string;
    user_id: string;
    updated_at: Date;

    // Tuned insulin response parameters (if applied)
    insulin_response?: {
        tuning_id: string;
        applied_at: Date;
        dia: number;
        peak: number;
        isf: number[];  // 6 time blocks
    };

    // Tuned carb absorption parameters (Phase 2)
    carb_absorption?: {
        tuning_id: string;
        applied_at: Date;
        icr: number[];  // 6 time blocks
        default_absorption_rate: number;
        min_carb_impact: number;
    };

    // Tuned basal rates (Phase 3)
    basal_rates?: {
        tuning_id: string;
        applied_at: Date;
        rates: number[];  // 6 time blocks
    };

    // Tuned activity parameters (Phase 4)
    activity_parameters?: {
        tuning_id: string;
        applied_at: Date;
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
    };

    // Profile Settings
    smb_threshold?: number;

    // Metadata
    version: number;
    notes?: string;
}

const SystemConfigSchema = new Schema<ISystemConfig>({
    config_id: {
        type: String,
        required: true,
        unique: true,
        index: true,
        default: 'system_config'  // Single document per user
    },
    user_id: {
        type: String,
        required: true,
        index: true,
        default: 'default'
    },
    updated_at: {
        type: Date,
        required: true,
        default: Date.now
    },
    insulin_response: {
        tuning_id: String,
        applied_at: Date,
        dia: Number,
        peak: Number,
        isf: [Number]
    },
    carb_absorption: {
        tuning_id: String,
        applied_at: Date,
        icr: [Number],
        default_absorption_rate: Number,
        min_carb_impact: Number
    },
    basal_rates: {
        tuning_id: String,
        applied_at: Date,
        rates: [Number]
    },
    activity_parameters: {
        tuning_id: String,
        applied_at: Date,
        coefficients: {
            steps_per_minute: Number,
            hr_spike: Number,
            calories: Number,
            stairs: Number
        },
        baselines: {
            resting_hr: Number,
            baseline_steps_per_min: Number
        }
    },
    version: {
        type: Number,
        required: true,
        default: 1
    },
    smb_threshold: {
        type: Number,
        default: 0.7
    },
    notes: String
}, {
    collection: 'system_config',
    timestamps: false
});

// Indexes
SystemConfigSchema.index({ user_id: 1, config_id: 1 }, { unique: true });

export const SystemConfig = mongoose.models.SystemConfig ||
    mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);
