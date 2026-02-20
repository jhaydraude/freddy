import mongoose, { Document, Schema } from 'mongoose';

export interface IBasalRateTuning extends Document {
    tuning_id: string;
    user_id: string;
    created_at: Date;
    status: 'syncing' | 'running' | 'completed' | 'failed' | 'applied';
    sync_progress?: number;

    config: {
        analysis_period_days: number;
        window_hours: number;
        min_basal_events: number;
    };

    current_values: {
        rates: number[];  // 12 blocks
        source: 'profile' | 'previous_tuning';
    };

    optimized_values?: {
        rates: number[];  // 12 blocks
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

    logs: string[];
    error_message?: string;
    applied_at?: Date;
    applied_by?: string;
}

const BasalRateTuningSchema = new Schema<IBasalRateTuning>({
    tuning_id: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, index: true },
    created_at: { type: Date, required: true, index: true },
    status: {
        type: String,
        required: true,
        enum: ['syncing', 'running', 'completed', 'failed', 'applied'],
        index: true
    },
    sync_progress: Number,

    config: {
        analysis_period_days: { type: Number, required: true },
        window_hours: { type: Number, required: true },
        min_basal_events: { type: Number, required: true }
    },

    current_values: {
        rates: [{ type: Number }],
        source: { type: String, enum: ['profile', 'previous_tuning'], required: true }
    },

    optimized_values: {
        rates: [{ type: Number }],
        rates_confidence: [[Number]],
        drift_per_block: [{ type: Number }],
        windows_per_block: [{ type: Number }],
        rmse: Number,
        mae: Number,
        r_squared: Number,
        clean_windows_analyzed: Number
    },

    analysis_summary: {
        data_quality_score: Number
    },

    logs: [{ type: String }],
    error_message: String,

    applied_at: { type: Date, index: true },
    applied_by: String

}, {
    collection: 'basal_rate_tunings',
    timestamps: false
});

// Avoid Mongoose OverwriteModelError
export const BasalRateTuning = mongoose.models.BasalRateTuning ||
    mongoose.model<IBasalRateTuning>('BasalRateTuning', BasalRateTuningSchema);
