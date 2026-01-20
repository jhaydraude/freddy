import mongoose, { Document, Schema } from 'mongoose';

/**
 * Insulin Response Tuning Interface
 * Stores tuning run results and history for DIA, Peak Time, and ISF optimization
 */
export interface IInsulinResponseTuning extends Document {
    // Metadata
    tuning_id: string;
    user_id: string;
    created_at: Date;
    status: 'syncing' | 'running' | 'completed' | 'failed' | 'applied';
    sync_progress?: number; // 0-100

    // Input Configuration
    config: {
        analysis_period_days: number;
        window_hours: number;
        include_activity: boolean;
        min_windows_required: number;
    };

    // Current Values (baseline)
    current_values: {
        dia: number;
        peak: number;
        isf: number[];  // 6 time blocks
        source: 'profile' | 'previous_tuning';
    };

    // Optimized Results
    optimized_values?: {
        dia: number;
        peak: number;
        isf: number[];  // 6 time blocks

        // Confidence intervals
        dia_confidence: [number, number];
        peak_confidence: [number, number];
        isf_confidence: [number, number][];

        // Quality metrics
        r_squared: number;
        rmse: number;
        mae: number;
        windows_analyzed: number;
    };

    // Analysis Details
    analysis_summary?: {
        total_windows: number;
        stable_windows: number;
        meal_windows: number;
        activity_windows: number;
        data_quality_score: number;
    };

    // Application tracking
    applied_at?: Date;
    applied_by?: string;

    // Logs and diagnostics
    logs?: string[];
    error_message?: string;
}

const InsulinResponseTuningSchema = new Schema<IInsulinResponseTuning>({
    tuning_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    user_id: {
        type: String,
        required: true,
        index: true
    },
    created_at: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },
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
        include_activity: { type: Boolean, required: true },
        min_windows_required: { type: Number, required: true }
    },
    current_values: {
        dia: { type: Number, required: true },
        peak: { type: Number, required: true },
        isf: { type: [Number], required: true },
        source: { type: String, required: true, enum: ['profile', 'previous_tuning'] }
    },
    optimized_values: {
        dia: Number,
        peak: Number,
        isf: [Number],
        dia_confidence: [Number],
        peak_confidence: [Number],
        isf_confidence: [[Number]],
        r_squared: Number,
        rmse: Number,
        mae: Number,
        windows_analyzed: Number
    },
    analysis_summary: {
        total_windows: Number,
        stable_windows: Number,
        meal_windows: Number,
        activity_windows: Number,
        data_quality_score: Number
    },
    applied_at: Date,
    applied_by: String,
    logs: [String],
    error_message: String
}, {
    collection: 'insulin_response_tuning',
    timestamps: false
});

// Indexes for efficient queries
InsulinResponseTuningSchema.index({ user_id: 1, created_at: -1 });
InsulinResponseTuningSchema.index({ user_id: 1, status: 1 });
// Note: tuning_id already has unique index from field definition above

export const InsulinResponseTuning = mongoose.models.InsulinResponseTuning ||
    mongoose.model<IInsulinResponseTuning>('InsulinResponseTuning', InsulinResponseTuningSchema);
