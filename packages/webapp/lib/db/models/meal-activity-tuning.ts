import mongoose, { Document, Schema } from 'mongoose';

/**
 * Meal & Activity Tuning Interface
 * Follow-up pass to optimize Carb Ratio and Activity Coefficients
 * using a fixed Foundation Baseline.
 */
export interface IMealActivityTuning extends Document {
    tuning_id: string;
    user_id: string;
    created_at: Date;
    status: 'syncing' | 'running' | 'completed' | 'failed' | 'applied';
    mode: 'meal' | 'activity' | 'combined';

    config: {
        analysis_period_days: number;
        window_hours: number;
        include_activity: boolean;
        min_windows_required: number;
        baseline_tuning_id?: string; // Optional reference to foundation run
    };

    current_values: {
        dia: number;
        peak: number;
        isf: number[];    // 6 blocks
        basal: number[];  // 12 blocks
        cr: number[];     // 6 blocks
        activity_coefficients: {
            steps: number;
            heartRate: number;
        };
        units: 'mg/dL' | 'mmol/L';
        source: 'profile' | 'foundation_run';
    };

    optimized_values?: {
        dia: number;
        peak: number;
        isf: number[];
        cr: number[];
        basal: number[];
        activity_coefficients: {
            steps: number;
            heartRate: number;
        };

        isf_confidence: [number, number][];
        cr_confidence: [number, number][];
        basal_confidence: [number, number][];
        activity_confidence: {
            steps: [number, number];
            heartRate: [number, number];
        };

        r_squared: number;
        rmse: number;
        mae: number;
        windows_analyzed: number;
    };

    analysis_summary?: {
        total_windows: number;
        meal_windows: number;
        activity_windows: number;
        data_quality_score: number;
        window_distribution?: number[];
    };

    logs?: string[];
    error_message?: string;
    applied_at?: Date;
    applied_by?: string;
}

const MealActivityTuningSchema = new Schema<IMealActivityTuning>({
    tuning_id: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, index: true },
    created_at: { type: Date, required: true, default: Date.now, index: true },
    status: {
        type: String,
        required: true,
        enum: ['syncing', 'running', 'completed', 'failed', 'applied'],
        index: true
    },
    mode: {
        type: String,
        required: true,
        enum: ['meal', 'activity', 'combined'],
        default: 'combined'
    },
    config: {
        analysis_period_days: { type: Number, required: true },
        window_hours: { type: Number, required: true },
        include_activity: { type: Boolean, required: true },
        min_windows_required: { type: Number, required: true },
        baseline_tuning_id: String
    },
    current_values: {
        dia: { type: Number, required: true },
        peak: { type: Number, required: true },
        isf: { type: [Number], required: true },
        basal: { type: [Number], required: true },
        cr: { type: [Number], required: true },
        activity_coefficients: {
            steps: Number,
            heartRate: Number
        },
        units: { type: String, required: true, enum: ['mg/dL', 'mmol/L'] },
        source: { type: String, required: true, enum: ['profile', 'foundation_run'] }
    },
    optimized_values: {
        dia: Number,
        peak: Number,
        isf: [Number],
        cr: [Number],
        basal: [Number],
        activity_coefficients: {
            steps: Number,
            heartRate: Number
        },
        isf_confidence: [[Number]],
        cr_confidence: [[Number]],
        basal_confidence: [[Number]],
        activity_confidence: Schema.Types.Mixed,
        r_squared: Number,
        rmse: Number,
        mae: Number,
        windows_analyzed: Number
    },
    analysis_summary: {
        total_windows: Number,
        meal_windows: Number,
        activity_windows: Number,
        data_quality_score: Number,
        window_distribution: [Number]
    },
    applied_at: Date,
    applied_by: String,
    logs: [String],
    error_message: String
}, {
    collection: 'meal_activity_tuning',
    timestamps: false
});

MealActivityTuningSchema.index({ user_id: 1, created_at: -1 });

export const MealActivityTuning = mongoose.models.MealActivityTuning ||
    mongoose.model<IMealActivityTuning>('MealActivityTuning', MealActivityTuningSchema);
