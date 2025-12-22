import mongoose, { Schema, Document } from 'mongoose';

// ---------------------------------------------------------------------------
// ENTRIES (Glucose Readings)
// ---------------------------------------------------------------------------
export interface IEntry extends Document {
    sgv: number;          // Glucose value
    date: number;         // Epoch timestamp
    dateString: string;   // ISO date string
    trend: number;        // Trend value
    direction: string;    // Arrow direction (Flat, DoubleUp, etc)
    device: string;       // Uplink device
    type: string;         // 'sgv' is primary
}

const EntrySchema = new Schema({
    sgv: { type: Number, required: true },
    date: { type: Number, required: true, index: true },
    dateString: { type: String, required: true },
    trend: { type: Number },
    direction: { type: String },
    device: { type: String },
    type: { type: String, default: 'sgv' }
}, { collection: 'entries', strict: false });

export const Entry = mongoose.model<IEntry>('Entry', EntrySchema);

// ---------------------------------------------------------------------------
// TREATMENTS (Insulin, Carbs, Temp Basals)
// ---------------------------------------------------------------------------
export interface ITreatment extends Document {
    eventType: string;    // Correction Bolus, Meal Bolus, Temp Basal, etc.
    insulin?: number;     // Units of insulin
    carbs?: number;       // Grams of carbs
    created_at: string;   // ISO string
    enteredBy: string;
    notes?: string;
    duration?: number;    // For temp basals
    percent?: number;     // For temp basals
    rate?: number;        // For temp basals
    profile?: string;     // For profile switches
    timeshift?: number;   // Delay in minutes
    originalDuration?: number; // Duration in minutes (0 means no end)
    profileJson?: string; // Embedded profile data
    percentage?: number;  // Profile percentage (e.g. 130)
}

const TreatmentSchema = new Schema({
    eventType: { type: String, required: true, index: true },
    insulin: { type: Number },
    carbs: { type: Number },
    created_at: { type: String, required: true, index: true },
    enteredBy: { type: String },
    notes: { type: String },
    duration: { type: Number },
    percent: { type: Number },
    rate: { type: Number },
    timeshift: { type: Number },
    originalDuration: { type: Number },
    profileJson: { type: String },
    percentage: { type: Number }
}, { collection: 'treatments', strict: false });

export const Treatment = mongoose.model<ITreatment>('Treatment', TreatmentSchema);

// ---------------------------------------------------------------------------
// PROFILE (User Settings)
// ---------------------------------------------------------------------------
export interface IProfileStore {
    dia: number;          // Duration of insulin action
    carbratio: Array<{ time: string, value: number, timeAsSeconds?: number }>;
    sens: Array<{ time: string, value: number, timeAsSeconds?: number }>;
    basal: Array<{ time: string, value: number, timeAsSeconds?: number }>;
    target_low: Array<{ time: string, value: number, timeAsSeconds?: number }>;
    target_high: Array<{ time: string, value: number, timeAsSeconds?: number }>;
    units: string;        // mg/dL or mmol
}

export interface IProfile extends Document {
    startDate: string;    // ISO string when profile became active
    defaultProfile: string;
    store: Record<string, IProfileStore>;
    created_at: string;
}

const ProfileSchema = new Schema({
    startDate: { type: String, required: true, index: true },
    defaultProfile: { type: String, required: true },
    store: { type: Map, of: Object }, // Store can have multiple profiles by name
    created_at: { type: String }
}, { collection: 'profile', strict: false });

export const Profile = mongoose.model<IProfile>('Profile', ProfileSchema);

// ---------------------------------------------------------------------------
// DEVICE STATUS (Pump & Uploader Status)
// ---------------------------------------------------------------------------
export interface IDeviceStatus extends Document {
    created_at: string;
    pump?: {
        battery?: {
            percent?: number;
            voltage?: number;
            status?: string;
        };
        reservoir?: number;
        clock?: string;
        status?: {
            status?: string;
            timestamp?: string;
        };
        extended?: {
            Version?: string;
            ActiveProfile?: string;
            TempBasalAbsoluteRate?: number;
            TempBasalStart?: string;
            TempBasalRemaining?: number; // minutes
            LastBolus?: string;
            LastBolusAmount?: number;
            BaseBasalRate?: number;
            IOB?: number;
        };
    };
    openaps?: {
        iob?: {
            iob?: number;
            activity?: number;
            basaliob?: number;
            bolusiob?: number;
            timestamp?: string;
        };
        suggested?: any;
        enacted?: any;
    };
    uploaderBattery?: number;
    device?: string;
}

const DeviceStatusSchema = new Schema({
    created_at: { type: String, required: true, index: true },
    pump: {
        battery: {
            percent: Number,
            voltage: Number,
            status: String
        },
        reservoir: Number,
        clock: String,
        status: {
            status: String,
            timestamp: String
        },
        extended: {
            Version: String,
            ActiveProfile: String,
            TempBasalAbsoluteRate: Number,
            TempBasalStart: String,
            TempBasalRemaining: Number,
            LastBolus: String,
            LastBolusAmount: Number,
            BaseBasalRate: Number,
            IOB: Number
        }
    },
    openaps: {
        iob: {
            iob: Number,
            activity: Number,
            basaliob: Number,
            bolusiob: Number,
            timestamp: String
        },
        suggested: Schema.Types.Mixed,
        enacted: Schema.Types.Mixed
    },
    uploaderBattery: Number,
    device: String
}, { collection: 'devicestatus', strict: false });

export const DeviceStatus = mongoose.model<IDeviceStatus>('DeviceStatus', DeviceStatusSchema);
