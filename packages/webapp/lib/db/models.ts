import mongoose, { Schema } from 'mongoose';
import { getNightscoutConn, getFreddyConn } from './connection';

// Helper to lazily bind a model to the correct connection
function getModel(name: string, schema: any, connectionGetter: () => any, collection?: string): any {
    const dummy = function () { } as any;

    return new Proxy(dummy, {
        get(target, prop) {
            const conn = connectionGetter();
            const model = conn.models[name] || conn.model(name, schema, collection);
            return (model as any)[prop];
        },
        construct(target, args) {
            const conn = connectionGetter();
            const model = conn.models[name] || conn.model(name, schema, collection);
            return Reflect.construct(model as any, args);
        }
    });
}

// ---------------------------------------------------------------------------
// ENTRIES (Glucose Readings) - Nightscout Owned
// ---------------------------------------------------------------------------
export interface IEntry {
    sgv?: number;
    date: number;
    dateString: string;
    trend?: number;
    direction?: string;
    device?: string;
    type: string;
    heartrate?: number;
    steps?: number;
    identifier?: string;
    app?: string;
    stale?: boolean;  // Flagged by stale HR detection — excluded from calculations
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
    app: { type: String },
    stale: { type: Boolean }
}, { collection: 'entries', strict: false });

export const Entry: any = getModel('Entry', EntrySchema, getNightscoutConn, 'entries');

// ---------------------------------------------------------------------------
// TREATMENTS (Insulin, Carbs, Temp Basals) - Nightscout Owned
// ---------------------------------------------------------------------------
export interface ITreatment {
    eventType: string;
    insulin?: number;
    carbs?: number;
    created_at: string;
    enteredBy: string;
    notes?: string;
    duration?: number;
    percent?: number;
    rate?: number;
    profile?: string;
    timeshift?: number;
    originalDuration?: number;
    profileJson?: string;
    percentage?: number;
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

export const Treatment: any = getModel('Treatment', TreatmentSchema, getNightscoutConn, 'treatments');

// ---------------------------------------------------------------------------
// PROFILE (User Settings) - Nightscout Owned
// ---------------------------------------------------------------------------
export interface IProfileStore {
    dia: number;
    carbratio: Array<{ time: string, value: number, timeAsSeconds?: number }>;
    sens: Array<{ time: string, value: number, timeAsSeconds?: number }>;
    basal: Array<{ time: string, value: number, timeAsSeconds?: number }>;
    target_low: Array<{ time: string, value: number, timeAsSeconds?: number }>;
    target_high: Array<{ time: string, value: number, timeAsSeconds?: number }>;
    units: string;
    activity_coefficients?: {
        steps_per_minute: number;
        calories: number;
        stairs: number;
        hr_spike: number;
        stress_hr: number;               // mg/dL per elevated HR without steps
        post_meal_multiplier: number;    // multiplier for post-prandial exercise
    };
}

export interface IProfile {
    _id?: string;
    startDate: string;
    defaultProfile: string;
    store: Record<string, IProfileStore>;
    created_at: string;
}

const ProfileSchema = new Schema({
    startDate: { type: String, required: true, index: true },
    defaultProfile: { type: String, required: true },
    store: { type: Map, of: Object },
    created_at: { type: String }
}, { collection: 'profile', strict: false });

export const Profile: any = getModel('Profile', ProfileSchema, getNightscoutConn, 'profile');

// ---------------------------------------------------------------------------
// DEVICE STATUS (Pump & Uploader Status) - Nightscout Owned
// ---------------------------------------------------------------------------
export interface IDeviceStatus {
    created_at: string;
    pump?: {
        battery?: { percent?: number; voltage?: number; status?: string; };
        reservoir?: number;
        clock?: string;
        status?: { status?: string; timestamp?: string; };
        extended?: {
            Version?: string;
            ActiveProfile?: string;
            TempBasalAbsoluteRate?: number;
            TempBasalStart?: string;
            TempBasalRemaining?: number;
            LastBolus?: string;
            LastBolusAmount?: number;
            BaseBasalRate?: number;
            IOB?: number;
        };
    };
    openaps?: {
        iob?: { iob?: number; activity?: number; basaliob?: number; bolusiob?: number; timestamp?: string; time?: string; };
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
    pump: { type: Schema.Types.Mixed },
    openaps: { type: Schema.Types.Mixed },
    uploaderBattery: Number,
    device: String
}, { collection: 'devicestatus', strict: false });

export const DeviceStatus: any = getModel('DeviceStatus', DeviceStatusSchema, getNightscoutConn, 'devicestatus');

// ---------------------------------------------------------------------------
// COMPUTED STATUS (Freddy Owned)
// ---------------------------------------------------------------------------
export interface IComputedStatus {
    timestamp: Date;
    status: any;
    attribution?: any;
    prediction?: Array<{ timestamp: string, sgv: number }>;
    created_at: Date;
    updated_at: Date;
    version: string;
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

export const ComputedStatus: any = getModel('ComputedStatus', ComputedStatusSchema, getFreddyConn, 'computedstatus');

// ---------------------------------------------------------------------------
// PROFILE ANALYSIS (Freddy Owned)
// ---------------------------------------------------------------------------
export interface IProfileAnalysis {
    timestamp: Date;
    current_profile?: IProfileStore;
    recommended_profile?: IProfileStore;
    estimated_isf: number[];
    estimated_icr: number[];
    estimated_basal_rates: number[];
    isf_confidence: number[][];
    icr_confidence: number[][];
    basal_confidence: number[][];
    r_squared: number;
    rmse: number;
    mae: number;
    windows_analyzed: number;
    recommendation: string;
    estimated_activity_coefficients?: {
        steps_per_minute?: number;
        hr_spike?: number;
        stress_hr?: number;
    };
    [key: string]: unknown;
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
    basal_confidence: { type: Schema.Types.Mixed },
    r_squared: { type: Number },
    rmse: { type: Number },
    mae: { type: Number },
    windows_analyzed: { type: Number },
    recommendation: { type: String }
}, { collection: 'profile_analysis' });

export const ProfileAnalysis: any = getModel('ProfileAnalysis', ProfileAnalysisSchema, getFreddyConn, 'profile_analysis');



// ---------------------------------------------------------------------------
// CONFIGURATION MODELS (Freddy Owned)
// ---------------------------------------------------------------------------
export interface ISystemConfig {
    key: string;
    value: any;
    updated_at: Date;
}

const SystemConfigSchema = new Schema({
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'system_config' });

export const SystemConfig: any = getModel('SystemConfig', SystemConfigSchema, getFreddyConn, 'system_config');

export interface IUserPreference {
    userId: string;
    key: string;
    value: any;
}

const UserPreferenceSchema = new Schema({
    userId: { type: String, required: true, index: true },
    key: { type: String, required: true, index: true },
    value: { type: Schema.Types.Mixed, required: true }
}, { collection: 'user_preferences' });

export const UserPreference: any = getModel('UserPreference', UserPreferenceSchema, getFreddyConn, 'user_preferences');

// ---------------------------------------------------------------------------
// ACTIVITY DATA (Freddy Owned)
// ---------------------------------------------------------------------------
export interface IActivityRecord {
    id: string;
    type: string;
    timestamp?: number;
    startTime?: number;
    endTime?: number;
    data: any;
    metadata: {
        device_id: string;
        source_app: string;
        sync_timestamp?: string;
    };
    created_at: Date;
}

const ActivityRecordSchema = new Schema({
    id: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, index: true },
    timestamp: { type: Number },
    startTime: { type: Number, index: true },
    endTime: { type: Number, index: true },
    data: { type: Schema.Types.Mixed, required: true },
    metadata: {
        device_id: { type: String, required: true },
        source_app: { type: String, required: true },
        sync_timestamp: { type: String }
    },
    created_at: { type: Date, default: Date.now, index: true }
}, { collection: 'activity_records' });

export const ActivityRecord: any = getModel('ActivityRecord', ActivityRecordSchema, getFreddyConn, 'activity_records');

export * from './models/freddy-profile';

