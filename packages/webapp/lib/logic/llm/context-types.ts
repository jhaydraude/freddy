/**
 * context-types.ts
 *
 * Typed interfaces for structured LLM context objects.
 * These replace raw JSON.stringify(dataContext) calls throughout the explain layer.
 *
 * Design principles:
 * - Fields are pre-selected for explanation relevance (not full documents)
 * - Numbers are accompanied by units and plain-language labels
 * - Confidence levels are human-readable strings, not raw CI arrays
 * - Observed facts are separated from model inferences
 */

// ---------------------------------------------------------------------------
// Attribution Context (dashboard explain)
// ---------------------------------------------------------------------------

export interface AttributionComponentContext {
    /** mg/dL impact (or mmol/L, per user units) */
    value: number;
    units: string;
    /** Human-readable interpretation of the magnitude */
    interpretation: string;
}

export interface AttributionTimeframeContext {
    minutes: number;
    label: string; // e.g. "last 30 minutes"
    actual_change: number;
    predicted_change: number;
    unexplained_delta: number;
    units: string;
    model_accuracy: string; // e.g. "model accounted for 85% of the change"
    components: {
        insulin: AttributionComponentContext & { iob_u: number; isf: number };
        carbs: AttributionComponentContext & { cob_g: number; icr: number };
        basal: AttributionComponentContext & { deviation_u_hr: number };
        activity: AttributionComponentContext & {
            data_available: boolean;
            intensity: string;
            steps: number;
            heart_rate: number;
        };
        unexplained: number;
    };
}

export interface GlucoseContext {
    value: number;
    units: string;
    trend: string;
    rate_of_change_per_min: number | null;
    delta_30m: number | null;
}

export interface ActiveInfluencersContext {
    iob: {
        total_u: number;
        bolus_u: number;
        basal_deviation_u: number;
        glucose_impact: number; // expected mg/dL change from IOB alone
        units: string;
    };
    cob: {
        total_g: number;
        active_g: number;    // currently absorbing
        pending_g: number;   // not yet started
        glucose_impact: number;
    };
}

export interface ForecastContext {
    short_term_30m: number;
    eventual_4hr: number;
    min_predicted: number;
    max_predicted: number;
    units: string;
}

export interface DeviceContext {
    sensor_age_hours: number | null;
    sensor_ok: boolean; // age < 168h (7 days)
    pump_site_age_hours: number | null;
    reservoir_units: number | null;
}

/** Structured context for dashboard explain. Replaces JSON.stringify(dataContext). */
export interface AttributionContext {
    // Header: what's happening right now
    as_of: string; // ISO timestamp
    glucose: GlucoseContext;
    influencers: ActiveInfluencersContext;

    // Core explanation: the attribution breakdown
    attribution: AttributionTimeframeContext[];  // all timeframes: 5m, 10m, 15m, 30m

    // Future outlook
    forecast: ForecastContext | null;

    // Device health (context, not primary analysis)
    device: DeviceContext;

    // Narrative hints (from history)
    history_30m_summary: string | null; // e.g. "Glucose rose from 140 to 165 mg/dL in the past 30 minutes"
}

// ---------------------------------------------------------------------------
// Tuning Context (profile explain + tuning explain)
// ---------------------------------------------------------------------------

export interface TuningBlockDiff {
    time_block: string;     // e.g. "00:00–04:00"
    current: number;
    optimized: number;
    change_pct: number;     // % change: +15%, -8%
    confidence: string;     // e.g. "high (18 nights of data)"
    confidence_interval: string; // e.g. "42–56 mg/dL per U"
    direction: 'increase' | 'decrease' | 'unchanged';
}

export interface ModelQualityContext {
    r_squared: number;
    rmse: number;
    mae: number;
    windows_analyzed: number;
    quality_label: string;  // 'excellent' | 'good' | 'moderate' | 'poor'
    quality_note: string;   // plain English interpretation
}

export interface ActivityTuningContext {
    steps_coefficient_current: number;
    steps_coefficient_optimized: number;
    hr_coefficient_current: number;
    hr_coefficient_optimized: number;
    steps_confidence: string;
    hr_confidence: string;
    activity_impact_detected: boolean;
}

/** Structured context for tuning explain. Replaces JSON.stringify(dataContext). */
export interface TuningContext {
    tuning_id: string;
    mode: string;
    analysis_period_days: number;
    units: string;

    // What the model observed
    model_quality: ModelQualityContext;
    data_summary: {
        total_windows: number;
        meal_windows: number;
        activity_windows: number;
        quality_score: number;
        sufficient_data: boolean;
    };

    // Parameter diffs (only include params that actually changed)
    isf_diffs: TuningBlockDiff[];       // Insulin Sensitivity Factor by block
    cr_diffs: TuningBlockDiff[];        // Carb Ratio by block
    basal_diffs: TuningBlockDiff[];     // Basal rates by block
    activity?: ActivityTuningContext;   // Only present if mode includes activity

    // Attribution evidence from the analysis period (injected by tuning explain endpoint)
    attribution_evidence?: {
        period_start: string;
        period_end: string;
        avg_unexplained_by_block: Array<{ time_block: string; avg_unexplained: number; nights: number }>;
    };
}

// ---------------------------------------------------------------------------
// Composed explain context (passed to LLM)
// ---------------------------------------------------------------------------

/** Top-level context object passed to the LLM explain call. */
export interface ExplainContext {
    type: 'dashboard' | 'profile' | 'tuning';
    attribution?: AttributionContext;
    tuning?: TuningContext;
    patterns?: any[]; // Array of surfaced patterns active during this context
}
