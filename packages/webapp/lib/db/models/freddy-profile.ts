import mongoose, { Document, Schema } from 'mongoose';
import { getFreddyConn } from '../connection';

export interface IScheduleEntry {
    time: string;
    value: number;
}

export interface IFreddyProfile extends Document {
    name: string;
    description?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;

    // Core Parameters
    dia: number;
    peak: number;
    units: 'mg/dL' | 'mmol/L';

    // Schedules
    isf: IScheduleEntry[];
    basal: IScheduleEntry[];
    icr: IScheduleEntry[];

    // Activity
    activityCoefficients: {
        steps: number;
        heartRate: number;
    };

    // Metadata
    sourceNSProfileId?: string;
}

const ScheduleEntrySchema = new Schema({
    time: { type: String, required: true },
    value: { type: Number, required: true }
}, { _id: false });

const FreddyProfileSchema = new Schema<IFreddyProfile>({
    name: { type: String, required: true, index: true },
    description: String,
    isActive: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },

    dia: { type: Number, required: true, default: 5 },
    peak: { type: Number, required: true, default: 45 },
    units: { type: String, required: true, enum: ['mg/dL', 'mmol/L'], default: 'mg/dL' },

    isf: [ScheduleEntrySchema],
    basal: [ScheduleEntrySchema],
    icr: [ScheduleEntrySchema],

    activityCoefficients: {
        steps: { type: Number, default: -0.1 },
        heartRate: { type: Number, default: 1.0 }
    },

    sourceNSProfileId: { type: String, index: true }
}, {
    collection: 'freddy_profiles',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Helper to get the model on the correct connection
export const FreddyProfile = (function () {
    const name = 'FreddyProfile';
    const dummy = function () { } as unknown as mongoose.Model<IFreddyProfile>;

    return new Proxy(dummy, {
        get(target, prop) {
            const conn = getFreddyConn();
            const model = conn.models[name] || conn.model<IFreddyProfile>(name, FreddyProfileSchema);
            return (model as any)[prop];
        },
        construct(target, args) {
            const conn = getFreddyConn();
            const model = conn.models[name] || conn.model<IFreddyProfile>(name, FreddyProfileSchema);
            return Reflect.construct(model as any, args);
        }
    });
})();
