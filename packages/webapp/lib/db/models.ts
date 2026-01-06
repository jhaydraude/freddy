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

export const Entry = mongoose.models.Entry || mongoose.model<IEntry>('Entry', EntrySchema);

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

export const Treatment = mongoose.models.Treatment || mongoose.model<ITreatment>('Treatment', TreatmentSchema);

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

export const Profile = mongoose.models.Profile || mongoose.model<IProfile>('Profile', ProfileSchema);

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
            time?: string;
        };
        suggested?: any;
        enacted?: any;
    };
    uploaderBattery?: number;
    device?: string;
    configuration?: {
        sensitivityConfiguration?: {
            openaps_smb_min_5m_carbimpact?: number;
            absorption_cutoff?: number;
            autosens_min?: number;
            autosens_max?: number;
        };
    };
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
            timestamp: String,
            time: String
        },
        suggested: Schema.Types.Mixed,
        enacted: Schema.Types.Mixed
    },
    uploaderBattery: Number,
    device: String
}, { collection: 'devicestatus', strict: false });

export const DeviceStatus = mongoose.models.DeviceStatus || mongoose.model<IDeviceStatus>('DeviceStatus', DeviceStatusSchema);

// ---------------------------------------------------------------------------
// COMPUTED STATUS (Cached Status Snapshots - WRITE ALLOWED)
// ---------------------------------------------------------------------------
export interface IComputedStatus extends Document {
    timestamp: Date;          // Bucketed to 5-minute intervals (floor)
    status: any;              // Complete IStatusResult from getStatus()
    attribution?: {           // Optional: Added by attribution tool
        "5min"?: any;
        "10min"?: any;
        "15min"?: any;
        "30min"?: any;
    };
    prediction?: Array<{ timestamp: string, sgv: number }>;
    created_at: Date;         // When first computed
    updated_at: Date;         // When last recalculated
    version: string;          // Schema version
}

const ComputedStatusSchema = new Schema({
    timestamp: { type: Date, required: true, unique: true, index: true },
    status: { type: Schema.Types.Mixed, required: true },
    attribution: { type: Schema.Types.Mixed },
    prediction: { type: Schema.Types.Mixed },
    created_at: { type: Date, required: true, index: true },
    updated_at: { type: Date, required: true, index: true },
    version: { type: String, default: "1.0" }
}, { collection: 'computedstatus' });

export const ComputedStatus = mongoose.models.ComputedStatus || mongoose.model<IComputedStatus>('ComputedStatus', ComputedStatusSchema);

// ---------------------------------------------------------------------------
// PROFILE ANALYSIS (Analysis History)
// ---------------------------------------------------------------------------
export interface IProfileAnalysis extends Document {
    timestamp: Date;
    current_profile?: IProfileStore;
    recommended_profile?: IProfileStore;
    estimated_isf: number[];
    estimated_icr: number[];
    estimated_basal_rates: number[];
    isf_confidence: number[][];       // [[lower, upper], ...]
    icr_confidence: number[][];       // [[lower, upper], ...]
    basal_confidence: number[][];   // [[lower, upper], ...]
    r_squared: number;
    rmse: number;
    mae: number;
    windows_analyzed: number;
    windows_filtered_out: number;
    stable_windows: number;
    meal_windows: number;
    recommendation: string;
}

const ProfileAnalysisSchema = new Schema({
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    current_profile: { type: Schema.Types.Mixed },
    recommended_profile: { type: Schema.Types.Mixed },
    estimated_isf: [{ type: Number }],
    estimated_icr: [{ type: Number }],
    estimated_basal_rates: [{ type: Number }],
    isf_confidence: { type: Schema.Types.Mixed },
    icr_confidence: { type: Schema.Types.Mixed },
    basal_confidence: { type: Schema.Types.Mixed }, // Array of arrays
    r_squared: { type: Number },
    rmse: { type: Number },
    mae: { type: Number },
    windows_analyzed: { type: Number },
    windows_filtered_out: { type: Number },
    stable_windows: { type: Number },
    meal_windows: { type: Number },
    recommendation: { type: String }
}, { collection: 'profile_analysis' });

export const ProfileAnalysis = mongoose.models.ProfileAnalysis || mongoose.model<IProfileAnalysis>('ProfileAnalysis', ProfileAnalysisSchema);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// NEW ACTIVITY (Heart Rate, Steps, Exercise - Based on UploadRequest Spec)
// ---------------------------------------------------------------------------

export interface IActivityRecord extends Document {
    id: string;            // UUID for idempotency
    type: 'heart_rate' | 'steps' | 'exercise';
    timestamp?: number;    // Epoch ms for point data
    startTime?: number;    // Epoch ms for intervals
    endTime?: number;      // Epoch ms for intervals
    data: any;             // HeartRateData, StepsData, or ExerciseData
    metadata: {
        device_id: string;
        source_app: string;
        sync_timestamp?: string;
    };
    created_at: Date;
}

const ActivityRecordSchema = new Schema({
    id: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['heart_rate', 'steps', 'exercise'], required: true, index: true },
    timestamp: { type: Number, index: true },
    startTime: { type: Number, index: true },
    endTime: { type: Number, index: true },
    data: { type: Schema.Types.Mixed, required: true },
    metadata: {
        device_id: { type: String, required: true },
        source_app: { type: String, required: true },
        sync_timestamp: { type: String }
    },
    created_at: { type: Date, default: Date.now, index: true }
}, { collection: 'activities', strict: false });

export const ActivityRecord = mongoose.models.ActivityRecord || mongoose.model<IActivityRecord>('ActivityRecord', ActivityRecordSchema);
