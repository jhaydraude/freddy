import mongoose, { Schema } from 'mongoose';

/**
 * Unified Foundation Tuning Interface
 * Synchronously optimizes DIA, Peak, ISF, and Basal Rates.
 */
export interface IUnifiedFoundationTuning {
    tuning_id: string;
    user_id: string;
    created_at: Date;
    status: 'syncing' | 'running' | 'completed' | 'failed' | 'applied';
    sync_progress?: number;

    config: {
        analysis_period_days: number;
        window_hours: number;
        include_activity: boolean;
        min_windows_required: number;
    };

    current_values: {
        dia: number;
        peak: number;
        isf: number[];    // 6 blocks
        basal: number[];  // 12 blocks
        units: 'mg/dL' | 'mmol/L';
        source: 'profile' | 'previous_tuning';
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

    analysis_summary?: {
        total_windows: number;
        stable_windows: number;
        meal_windows: number;
        activity_windows: number;
        data_quality_score: number;
        window_distribution?: number[];  // Number of windows per 2-hour block (12 blocks)
    };

    logs?: string[];
    error_message?: string;
    applied_at?: Date;
    applied_by?: string;
}

const UnifiedFoundationTuningSchema = new Schema<IUnifiedFoundationTuning>({
    tuning_id: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, index: true },
    created_at: { type: Date, required: true, default: Date.now, index: true },
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
        basal: { type: [Number], required: true },
        units: { type: String, required: true, enum: ['mg/dL', 'mmol/L'] },
        source: { type: String, required: true, enum: ['profile', 'previous_tuning'] }
    },
    optimized_values: {
        dia: Number,
        peak: Number,
        isf: [Number],
        basal: [Number],
        dia_confidence: [Number],
        peak_confidence: [Number],
        isf_confidence: [[Number]],
        basal_confidence: [[Number]],
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
        data_quality_score: Number,
        window_distribution: [Number]
    },
    applied_at: Date,
    applied_by: String,
    logs: [String],
    error_message: String
}, {
    collection: 'unified_foundation_tuning',
    timestamps: false
});

UnifiedFoundationTuningSchema.index({ user_id: 1, created_at: -1 });

export const UnifiedFoundationTuning: any = mongoose.models.UnifiedFoundationTuning ||
    mongoose.model<IUnifiedFoundationTuning>('UnifiedFoundationTuning', UnifiedFoundationTuningSchema);
