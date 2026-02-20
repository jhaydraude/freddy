import mongoose, { Document, Schema } from 'mongoose';

/**
 * Activity Impact Tuning Interface
 * Stores tuning run results and history for activity impact coefficients
 */
export interface IActivityImpactTuning extends Document {
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
    };

    // Current Values (baseline)
    current_values: {
        steps_per_minute: number;
        calories: number;
        stairs: number;
        hr_spike: number;
        stress_hr: number;
    };

    // Optimized Results
    optimized_values?: {
        steps_per_minute: number;
        calories: number;
        stairs: number;
        hr_spike: number;
        stress_hr: number;

        // Confidence intervals
        steps_per_minute_confidence: [number, number];
        calories_confidence: [number, number];
        stairs_confidence: [number, number];
        hr_spike_confidence: [number, number];
        stress_hr_confidence: [number, number];

        // Quality metrics
        r_squared: number;
        rmse: number;
        mae: number;
        windows_analyzed: number;
    };

    // Analysis Details
    analysis_summary?: {
        total_windows: number;
        data_quality_score: number;
    };

    // Application tracking
    applied_at?: Date;
    applied_by?: string;

    // Logs and diagnostics
    logs?: string[];
    error_message?: string;
}

const ActivityImpactTuningSchema = new Schema<IActivityImpactTuning>({
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
        window_hours: { type: Number, required: true }
    },
    current_values: {
        steps_per_minute: { type: Number, required: true },
        calories: { type: Number, required: true },
        stairs: { type: Number, required: true },
        hr_spike: { type: Number, required: true },
        stress_hr: { type: Number, required: true }
    },
    optimized_values: {
        steps_per_minute: Number,
        calories: Number,
        stairs: Number,
        hr_spike: Number,
        stress_hr: Number,

        steps_per_minute_confidence: [Number],
        calories_confidence: [Number],
        stairs_confidence: [Number],
        hr_spike_confidence: [Number],
        stress_hr_confidence: [Number],

        r_squared: Number,
        rmse: Number,
        mae: Number,
        windows_analyzed: Number
    },
    analysis_summary: {
        total_windows: Number,
        data_quality_score: Number
    },
    applied_at: Date,
    applied_by: String,
    logs: [String],
    error_message: String
}, {
    collection: 'activity_impact_tuning',
    timestamps: false
});

// Indexes for efficient queries
ActivityImpactTuningSchema.index({ user_id: 1, created_at: -1 });
ActivityImpactTuningSchema.index({ user_id: 1, status: 1 });

export const ActivityImpactTuning = mongoose.models.ActivityImpactTuning ||
    mongoose.model<IActivityImpactTuning>('ActivityImpactTuning', ActivityImpactTuningSchema);
