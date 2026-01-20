import mongoose, { Schema, Document } from 'mongoose';
import { getNightscoutConn, getFreddyConn } from './connection';

// Helper to lazily bind a model to the correct connection
function getModel<T>(name: string, schema: Schema, connectionGetter: () => mongoose.Connection, collection?: string) {
    // We use a dummy function as target so the Proxy is recognized as a constructor
    const dummy = function () { } as unknown as mongoose.Model<T & Document>;

    return new Proxy(dummy, {
        get(target, prop) {
            const conn = connectionGetter();
            const model = conn.models[name] || conn.model<T & Document>(name, schema, collection);
            return (model as any)[prop];
        },
        construct(target, args) {
            const conn = connectionGetter();
            const model = conn.models[name] || conn.model<T & Document>(name, schema, collection);
            return Reflect.construct(model as any, args);
        }
    });
}

// ---------------------------------------------------------------------------
// ENTRIES (Glucose Readings) - Nightscout Owned
// ---------------------------------------------------------------------------
export interface IEntry extends Document {
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

export const Entry = getModel<IEntry>('Entry', EntrySchema, getNightscoutConn, 'entries');

// ---------------------------------------------------------------------------
// TREATMENTS (Insulin, Carbs, Temp Basals) - Nightscout Owned
// ---------------------------------------------------------------------------
export interface ITreatment extends Document {
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

export const Treatment = getModel<ITreatment>('Treatment', TreatmentSchema, getNightscoutConn, 'treatments');

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
    };
}

export interface IProfile extends Document {
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

export const Profile = getModel<IProfile>('Profile', ProfileSchema, getNightscoutConn, 'profile');

// ---------------------------------------------------------------------------
// DEVICE STATUS (Pump & Uploader Status) - Nightscout Owned
// ---------------------------------------------------------------------------
export interface IDeviceStatus extends Document {
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

export const DeviceStatus = getModel<IDeviceStatus>('DeviceStatus', DeviceStatusSchema, getNightscoutConn, 'devicestatus');

// ---------------------------------------------------------------------------
// COMPUTED STATUS (Freddy Owned)
// ---------------------------------------------------------------------------
export interface IComputedStatus extends Document {
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

export const ComputedStatus = getModel<IComputedStatus>('ComputedStatus', ComputedStatusSchema, getFreddyConn, 'computedstatus');

// ---------------------------------------------------------------------------
// PROFILE ANALYSIS (Freddy Owned)
// ---------------------------------------------------------------------------
export interface IProfileAnalysis extends Document {
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

export const ProfileAnalysis = getModel<IProfileAnalysis>('ProfileAnalysis', ProfileAnalysisSchema, getFreddyConn, 'profile_analysis');

// ---------------------------------------------------------------------------
// SITUATION CLASSIFIER (Freddy Owned)
// ---------------------------------------------------------------------------
export interface ISituationTag extends Document {
    tag_id: string;
    display_name: string;
    category: string;
}

const SituationTagSchema = new Schema({
    tag_id: { type: String, required: true, unique: true, index: true },
    display_name: { type: String, required: true },
    category: { type: String, required: true }
}, { collection: 'situation_tags' });

export const SituationTag = getModel<ISituationTag>('SituationTag', SituationTagSchema, getFreddyConn, 'situation_tags');

export interface ISituationSegment extends Document {
    userId: string;
    tagId: string;
    startTime: Date;
    endTime: Date;
}

const SituationSegmentSchema = new Schema({
    userId: { type: String, required: true, index: true },
    tagId: { type: String, required: true, index: true },
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, required: true, index: true }
}, { collection: 'situation_segments' });

export const SituationSegment = getModel<ISituationSegment>('SituationSegment', SituationSegmentSchema, getFreddyConn, 'situation_segments');

export interface ISituationWindow extends Document {
    window_id: string;
    window_start: Date;
    window_end: Date;
    features: Record<string, number>;
}

const SituationWindowSchema = new Schema({
    window_id: { type: String, required: true, unique: true, index: true },
    window_start: { type: Date, required: true, index: true },
    window_end: { type: Date, required: true, index: true },
    features: { type: Map, of: Number }
}, { collection: 'situation_windows' });

export const SituationWindow = getModel<ISituationWindow>('SituationWindow', SituationWindowSchema, getFreddyConn, 'situation_windows');

// ---------------------------------------------------------------------------
// CONFIGURATION MODELS (Freddy Owned)
// ---------------------------------------------------------------------------
export interface ISystemConfig extends Document {
    key: string;
    value: any;
    updated_at: Date;
}

const SystemConfigSchema = new Schema({
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'system_config' });

export const SystemConfig = getModel<ISystemConfig>('SystemConfig', SystemConfigSchema, getFreddyConn, 'system_config');

export interface IUserPreference extends Document {
    userId: string;
    key: string;
    value: any;
}

const UserPreferenceSchema = new Schema({
    userId: { type: String, required: true, index: true },
    key: { type: String, required: true, index: true },
    value: { type: Schema.Types.Mixed, required: true }
}, { collection: 'user_preferences' });

export const UserPreference = getModel<IUserPreference>('UserPreference', UserPreferenceSchema, getFreddyConn, 'user_preferences');
