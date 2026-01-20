import mongoose, { Document, Schema } from 'mongoose';

/**
 * Carb Absorption Tuning Interface
 * Stores tuning run results and history for ICR and absorption optimization
 */
export interface ICarbAbsorptionTuning extends Document {
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
        min_meal_events: number;
    };

    // Current Values (baseline)
    current_values: {
        icr: number[];                     // 6 time blocks
        default_absorption_rate: number;   // g/hr
        min_carb_impact: number;           // mg/dL/5min
        s_curve_params: {
            duration_multiplier: number;
            peak_time_ratio: number;
            min_base_rate: number;
        };
        source: 'profile' | 'previous_tuning';
    };

    // Optimized Results
    optimized_values?: {
        icr: number[];
        default_absorption_rate: number;
        min_carb_impact: number;
        s_curve_params: {
            duration_multiplier: number;
            peak_time_ratio: number;
            min_base_rate: number;
        };

        // Confidence intervals
        icr_confidence: [number, number][];
        absorption_rate_confidence: [number, number];
        min_carb_impact_confidence: [number, number];

        // Quality metrics
        r_squared: number;
        rmse: number;
        mae: number;
        meal_windows_analyzed: number;
    };

    // Analysis Details
    analysis_summary?: {
        total_meal_events: number;
        avg_meal_size: number;
        meal_distribution_by_time: Record<string, number>;
        data_quality_score: number;
    };

    // Application tracking
    applied_at?: Date;
    applied_by?: string;

    // Logs and diagnostics
    logs?: string[];
    error_message?: string;
}

const CarbAbsorptionTuningSchema = new Schema<ICarbAbsorptionTuning>({
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
        min_meal_events: { type: Number, required: true }
    },
    current_values: {
        icr: { type: [Number], required: true },
        default_absorption_rate: { type: Number, required: true },
        min_carb_impact: { type: Number, required: true },
        s_curve_params: {
            duration_multiplier: { type: Number, required: true },
            peak_time_ratio: { type: Number, required: true },
            min_base_rate: { type: Number, required: true }
        },
        source: { type: String, required: true, enum: ['profile', 'previous_tuning'] }
    },
    optimized_values: {
        icr: [Number],
        default_absorption_rate: Number,
        min_carb_impact: Number,
        s_curve_params: {
            duration_multiplier: Number,
            peak_time_ratio: Number,
            min_base_rate: Number
        },
        icr_confidence: [[Number]],
        absorption_rate_confidence: [Number],
        min_carb_impact_confidence: [Number],
        r_squared: Number,
        rmse: Number,
        mae: Number,
        meal_windows_analyzed: Number
    },
    analysis_summary: {
        total_meal_events: Number,
        avg_meal_size: Number,
        meal_distribution_by_time: { type: Map, of: Number },
        data_quality_score: Number
    },
    applied_at: Date,
    applied_by: String,
    logs: [String],
    error_message: String
}, {
    collection: 'carb_absorption_tuning',
    timestamps: false
});

CarbAbsorptionTuningSchema.index({ user_id: 1, created_at: -1 });
CarbAbsorptionTuningSchema.index({ user_id: 1, status: 1 });

export const CarbAbsorptionTuning = mongoose.models.CarbAbsorptionTuning ||
    mongoose.model<ICarbAbsorptionTuning>('CarbAbsorptionTuning', CarbAbsorptionTuningSchema);
