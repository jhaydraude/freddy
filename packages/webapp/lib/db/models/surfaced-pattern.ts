import mongoose, { Schema, Document } from 'mongoose';

export type PatternType =
    | 'overnight_unexplained_delta'
    | 'time_of_day_hypo'
    | 'post_activity_drop'
    | 'post_meal_spike'
    | 'time_of_month_sensitivity'
    | 'persistent_high_unexplained';

export interface ISurfacedPattern extends Document {
    pattern_id: string;
    pattern_type: PatternType;
    first_observed: Date;
    last_observed: Date;
    occurrence_count: number;
    days_in_window: number;
    time_window?: {
        start_hour: number;
        end_hour: number;
    };
    magnitude: {
        mean: number;
        max: number;
        direction: 'positive' | 'negative';
    };
    concurrent_factors: {
        mean_iob?: number;
        prior_activity_elevated?: number;
        time_of_month_cluster?: number[];
    };
    confidence: 'high' | 'medium' | 'low';
    status: 'active' | 'resolved' | 'acknowledged';
    acknowledged_at?: Date;
    resolution_notes?: string;
    created_at: Date;
    updated_at: Date;
}

export const SurfacedPatternSchema = new Schema({
    pattern_id: { type: String, required: true, unique: true },
    pattern_type: { type: String, required: true },
    first_observed: { type: Date, required: true },
    last_observed: { type: Date, required: true },
    occurrence_count: { type: Number, required: true },
    days_in_window: { type: Number, required: true },
    time_window: {
        start_hour: { type: Number },
        end_hour: { type: Number }
    },
    magnitude: {
        mean: { type: Number, required: true },
        max: { type: Number, required: true },
        direction: { type: String, enum: ['positive', 'negative'], required: true }
    },
    concurrent_factors: {
        mean_iob: { type: Number },
        prior_activity_elevated: { type: Number },
        time_of_month_cluster: [{ type: Number }]
    },
    confidence: { type: String, enum: ['high', 'medium', 'low'], required: true },
    status: { type: String, enum: ['active', 'resolved', 'acknowledged'], required: true, default: 'active' },
    acknowledged_at: { type: Date },
    resolution_notes: { type: String }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'surfaced_patterns'
});

// Create compound index for fast queries by type and status
SurfacedPatternSchema.index({ pattern_type: 1, status: 1 });
SurfacedPatternSchema.index({ 'time_window.start_hour': 1, 'time_window.end_hour': 1 });

export const SurfacedPattern: any = mongoose.models.SurfacedPattern ||
    mongoose.model<ISurfacedPattern>('SurfacedPattern', SurfacedPatternSchema);
