import mongoose, { Schema, Document } from 'mongoose';

// ---------------------------------------------------------------------------
// ENTRIES (Glucose Readings)
// ---------------------------------------------------------------------------
export interface IEntry extends Document {
    sgv?: number;         // Glucose value (optional as activity entries don't have it)
    date: number;         // Epoch timestamp
    dateString: string;   // ISO date string
    trend?: number;       // Trend value
    direction?: string;   // Arrow direction (Flat, DoubleUp, etc)
    device?: string;      // Uplink device
    type: string;         // 'sgv' or 'activity'
    heartrate?: number;   // Heart rate (for type: 'activity')
    steps?: number;       // Steps (for type: 'activity')
    identifier?: string;  // Client-side unique ID
    app?: string;         // Source app
}

const EntrySchema = new Schema({
    sgv: { type: Number },
    date: { type: Number, required: true, index: true },
    dateString: { type: String, required: true },
    trend: { type: Number },
    direction: { type: String },
    device: { type: String },
    type: { type: String, default: 'sgv', index: true },
    heartrate: { type: Number },
    steps: { type: Number },
    identifier: { type: String, index: true },
    app: { type: String }
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
    activity_coefficients?: {
        steps_per_minute: number;
        calories: number;
        stairs: number;
        hr_spike: number;
    };
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
    estimated_activity_coefficients?: {
        steps_per_minute: number;
        hr_spike: number;
    };
    activity_confidence?: {
        steps_per_minute: { lower: number, upper: number, std_error: number };
        hr_spike: { lower: number, upper: number, std_error: number };
    };
    r_squared: number;
    rmse: number;
    mae: number;
    windows_analyzed: number;
    windows_filtered_out: number;
    stable_windows: number;
    meal_windows: number;
    recommendation: string;
    tuning_suggestions?: any;
    logs?: string[];
    llm_explanation?: string;
    explanation_generated_at?: Date;
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
    estimated_activity_coefficients: { type: Schema.Types.Mixed },
    activity_confidence: { type: Schema.Types.Mixed },
    r_squared: { type: Number },
    rmse: { type: Number },
    mae: { type: Number },
    windows_analyzed: { type: Number },
    windows_filtered_out: { type: Number },
    stable_windows: { type: Number },
    meal_windows: { type: Number },
    recommendation: { type: String },
    tuning_suggestions: { type: Schema.Types.Mixed },
    logs: [{ type: String }],
    llm_explanation: { type: String },
    explanation_generated_at: { type: Date }
}, { collection: 'profile_analysis' });

export const ProfileAnalysis = mongoose.models.ProfileAnalysis || mongoose.model<IProfileAnalysis>('ProfileAnalysis', ProfileAnalysisSchema);

// DEPRECATED: Activity data has moved to the 'entries' collection (type: 'activity').
// This collection and model are kept for legacy data access only.
// ---------------------------------------------------------------------------
// NEW ACTIVITY (Legacy Collection - Heart Rate, Steps, Exercise)
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

// ---------------------------------------------------------------------------
// SITUATION CLASSIFIER (Tags, Segments, and Windows)
// ---------------------------------------------------------------------------

export interface ISituationTag extends Document {
    tag_id: string;           // e.g., "heavy_activity"
    display_name: string;     // e.g., "Heavy Activity"
    description: string;
    category: "activity" | "nutrition" | "sensor" | "physiological" | "other";
    color: string;            // For UI display
    typical_duration_min: number;
    delayed_impact_hours: number;  // How long after onset it affects glucose
    prediction_adjustments: {
        isf_multiplier?: number;     // e.g., 1.3 for activity
        cob_adjustment?: number;     // e.g., +20 for under-reported carbs
        confidence_penalty?: number; // e.g., 0.5 for noisy sensor
    };
    is_system: boolean;       // System-defined vs user-defined
    is_active: boolean;
    created_at: Date;
}

const SituationTagSchema = new Schema({
    tag_id: { type: String, required: true, unique: true, index: true },
    display_name: { type: String, required: true },
    description: { type: String },
    category: { type: String, enum: ["activity", "nutrition", "sensor", "physiological", "other"], required: true },
    color: { type: String, default: "#666666" },
    typical_duration_min: { type: Number, default: 30 },
    delayed_impact_hours: { type: Number, default: 0 },
    prediction_adjustments: {
        isf_multiplier: { type: Number },
        cob_adjustment: { type: Number },
        confidence_penalty: { type: Number }
    },
    is_system: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now }
}, { collection: 'situation_tags' });

export const SituationTag = mongoose.models.SituationTag || mongoose.model<ISituationTag>('SituationTag', SituationTagSchema);

export interface ISituationSegment extends Document {
    userId: string;
    tagId: string;           // Ref to SituationTag.tag_id
    startTime: Date;
    endTime: Date;
    source: 'manual' | 'model_confirmed' | 'auto_rule';
    confidence: number;
    metadata?: {
        intensity?: number;    // e.g. 1-10 for activity
        notes?: string;
    };
    created_at: Date;
}

const SituationSegmentSchema = new Schema({
    userId: { type: String, required: true, index: true },
    tagId: { type: String, required: true, index: true },
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, required: true, index: true },
    source: { type: String, enum: ['manual', 'model_confirmed', 'auto_rule'], required: true },
    confidence: { type: Number, default: 1.0 },
    metadata: { type: Schema.Types.Mixed },
    created_at: { type: Date, default: Date.now }
}, { collection: 'situation_segments' });

export const SituationSegment = mongoose.models.SituationSegment || mongoose.model<ISituationSegment>('SituationSegment', SituationSegmentSchema);

export interface ISituationWindow extends Document {
    window_id: string;        // UUID
    window_start: Date;
    window_end: Date;
    duration_minutes: number;
    features: Record<string, number>;
    tags: Array<{
        tag_id: string;
        confidence: number;       // 0-1
        source: "manual" | "system_validated" | "system_unvalidated";
        validated_at?: Date;
    }>;
    predicted_tags?: Array<{  // ML model suggestions (before user validation)
        tag_id: string;
        confidence: number;       // 0-1
        source: "model_suggestion";
    }>;
    anomaly_score?: number;
    selection_reason: "anomaly" | "random" | "user_initiated";
    status: "pending" | "labeled" | "skipped";
    created_at: Date;
    labeled_at?: Date;
    labeled_by?: string;
}

const SituationWindowSchema = new Schema({
    window_id: { type: String, required: true, unique: true, index: true },
    window_start: { type: Date, required: true, index: true },
    window_end: { type: Date, required: true, index: true },
    duration_minutes: { type: Number, required: true },
    features: { type: Map, of: Number },
    tags: [{
        tag_id: { type: String, required: true },
        confidence: { type: Number, required: true },
        source: { type: String, enum: ["manual", "system_validated", "system_unvalidated"], required: true },
        validated_at: { type: Date }
    }],
    predicted_tags: [{
        tag_id: { type: String, required: true },
        confidence: { type: Number, required: true },
        source: { type: String, enum: ["model_suggestion"], required: true }
    }],
    anomaly_score: { type: Number },
    selection_reason: { type: String, enum: ["anomaly", "random", "user_initiated"], required: true },
    status: { type: String, enum: ["pending", "labeled", "skipped"], default: "pending", index: true },
    created_at: { type: Date, default: Date.now },
    labeled_at: { type: Date },
    labeled_by: { type: String }
}, { collection: 'situation_windows' });

export const SituationWindow = mongoose.models.SituationWindow || mongoose.model<ISituationWindow>('SituationWindow', SituationWindowSchema);
