/**
 * context-builders.ts
 *
 * Builds structured, pre-annotated LLM context objects from raw Freddy data.
 *
 * Replaces JSON.stringify(dataContext) in:
 *   - explain-logic.ts (dashboard explain)
 *   - profile-explain-logic.ts (profile explain)
 *   - tuning/explain/route.ts (tuning explain — Phase 3)
 *
 * Principles:
 * - Select only fields relevant to explanation (not full documents)
 * - Format numbers with units and human-readable labels
 * - Add plain-language confidence levels
 * - Separate observed facts from model inferences
 * - Pass through explanation_hints where available
 */

import type {
    AttributionContext,
    AttributionTimeframeContext,
    TuningContext,
    TuningBlockDiff,
    ModelQualityContext,
    ActivityTuningContext,
    ExplainContext,
} from './context-types';
import type { IStatusResult, IAttributionTimeframe } from '../types';
import type { IMealActivityTuning } from '../../db/models/meal-activity-tuning';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to N decimal places */
const r = (v: number, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Format a mg/dL or mmol/L value with sign */
const signed = (v: number) => (v >= 0 ? `+${r(v)}` : `${r(v)}`);

/** Human-readable model quality label from R² */
function qualityLabel(rSq: number): string {
    if (rSq > 0.7) return 'excellent';
    if (rSq > 0.5) return 'good';
    if (rSq > 0.3) return 'moderate';
    return 'poor';
}

/** Plain-language quality note */
function qualityNote(rSq: number, windows: number): string {
    const label = qualityLabel(rSq);
    const dataNote = windows > 100 ? 'high data volume' : windows > 50 ? 'adequate data volume' : 'limited data volume';
    return `${label} fit (R²=${r(rSq, 2)}) — ${dataNote} (${windows} analysis windows). ${
        rSq < 0.5
            ? 'Results should be interpreted with caution; more stable data periods would improve accuracy.'
            : 'Results are statistically meaningful.'
    }`;
}

/** Confidence interval as human-readable string */
function formatCI(lower: number, upper: number, units: string): string {
    return `${r(lower)}–${r(upper)} ${units}`;
}

/** Confidence label based on CI width relative to estimate */
function confidenceLabel(estimate: number, lower: number, upper: number, windows: number): string {
    if (estimate === 0) return 'insufficient data';
    const relWidth = (upper - lower) / Math.abs(estimate);
    const dataLabel = windows >= 20 ? `${windows} data points` : windows >= 10 ? `${windows} data points (moderate)` : `${windows} data points (limited)`;
    if (relWidth < 0.2) return `high confidence (${dataLabel})`;
    if (relWidth < 0.5) return `medium confidence (${dataLabel})`;
    return `low confidence (${dataLabel}, wide uncertainty range)`;
}

/** 6-block time labels (4-hour windows) */
const TIME_BLOCKS_6 = [
    '00:00–04:00', '04:00–08:00', '08:00–12:00',
    '12:00–16:00', '16:00–20:00', '20:00–24:00',
];

/** 12-block time labels (2-hour windows) */
const TIME_BLOCKS_12 = [
    '00:00–02:00', '02:00–04:00', '04:00–06:00', '06:00–08:00',
    '08:00–10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00',
    '16:00–18:00', '18:00–20:00', '20:00–22:00', '22:00–24:00',
];

// ---------------------------------------------------------------------------
// Attribution context builder
// ---------------------------------------------------------------------------

function buildAttributionTimeframe(
    tf: IAttributionTimeframe,
    units: string
): AttributionTimeframeContext {
    const c = tf.components;
    const totalExplained = c.insulin.value + c.carbs.value + c.basal.value + c.activity.value;
    const actual = tf.glucoseChange.actual;
    const pctExplained = actual !== 0 ? Math.abs(totalExplained / actual) * 100 : 100;
    const accuracyText = actual === 0
        ? 'glucose was stable'
        : `model accounted for ${Math.min(100, Math.round(pctExplained))}% of the change`;

    const label = `last ${tf.minutes} minute${tf.minutes === 1 ? '' : 's'}`;

    return {
        minutes: tf.minutes,
        label,
        actual_change: r(actual),
        predicted_change: r(tf.glucoseChange.predicted),
        unexplained_delta: r(c.unexplained),
        units,
        model_accuracy: accuracyText,
        components: {
            insulin: {
                value: r(c.insulin.value),
                units,
                interpretation: c.insulin.value < -2
                    ? 'active insulin is significantly lowering glucose'
                    : c.insulin.value < -0.5
                    ? 'active insulin is moderately lowering glucose'
                    : 'minimal insulin pressure',
                iob_u: r(c.insulin.activity, 3),
                isf: r(c.insulin.isf),
            },
            carbs: {
                value: r(c.carbs.value),
                units,
                interpretation: c.carbs.value > 2
                    ? 'active carb absorption is significantly raising glucose'
                    : c.carbs.value > 0.5
                    ? 'carb absorption contributing moderate glucose rise'
                    : 'minimal carb impact',
                cob_g: r(c.carbs.absorption, 1),
                icr: r(c.carbs.carbRatio),
            },
            basal: {
                value: r(c.basal.value),
                units,
                interpretation: Math.abs(c.basal.value) < 0.5
                    ? 'basal rate is close to scheduled'
                    : c.basal.value > 0
                    ? `temp basal running below scheduled (+${r(c.basal.deviation, 2)} U/hr deviation)`
                    : `temp basal running above scheduled (${r(c.basal.deviation, 2)} U/hr deviation)`,
                deviation_u_hr: r(c.basal.deviation, 2),
            },
            activity: {
                value: r(c.activity.value),
                units,
                interpretation: !c.activity.dataAvailable
                    ? 'no activity data available'
                    : c.activity.value < -1
                    ? `activity is significantly lowering glucose (${c.activity.intensity} intensity)`
                    : c.activity.value > 1
                    ? `post-activity effect raising glucose (${c.activity.intensity})`
                    : `minimal activity impact (${c.activity.intensity} intensity)`,
                data_available: c.activity.dataAvailable,
                intensity: c.activity.intensity,
                steps: c.activity.steps,
                heart_rate: c.activity.heartRate,
            },
            unexplained: r(c.unexplained),
        },
    };
}

/**
 * Build structured attribution context for dashboard explain.
 * Takes a full IStatusResult and optional prediction data.
 */
export function buildAttributionContext(
    status: IStatusResult,
    prediction: Array<{ sgv: number }> | null,
    asOf: Date
): AttributionContext {
    const g = status.glucose?.current;
    const units = status.glucose?.units ?? 'mg/dL';
    const iob = status.iob?.calculated;
    const cob = status.cob?.calculated;

    // Build history summary from glucose deltas
    let historySummary: string | null = null;
    if (g?.delta30m != null && g.sgv != null) {
        const from30m = r(g.sgv - g.delta30m);
        const direction = g.delta30m > 2 ? 'rose' : g.delta30m < -2 ? 'fell' : 'was stable';
        historySummary = `Glucose ${direction} from ${from30m} to ${r(g.sgv)} ${units} over the past 30 minutes`;
    }

    // Build all timeframes
    const attribution = (status.attribution?.timeframes ?? []).map(tf =>
        buildAttributionTimeframe(tf, units)
    );

    // Build forecast
    let forecast = null;
    if (prediction && prediction.length > 0) {
        const sgvs = prediction.map(p => p.sgv);
        const idx30m = Math.min(6, prediction.length - 1); // 6 × 5min = 30min
        forecast = {
            short_term_30m: r(prediction[idx30m]?.sgv ?? prediction[0].sgv),
            eventual_4hr: r(prediction[prediction.length - 1].sgv),
            min_predicted: r(Math.min(...sgvs)),
            max_predicted: r(Math.max(...sgvs)),
            units,
        };
    }

    const sensorAge = status.glucose?.sensor?.age ?? null;

    return {
        as_of: asOf.toISOString(),
        glucose: {
            value: g?.sgv != null ? r(g.sgv) : 0,
            units,
            trend: g?.direction ?? 'unknown',
            rate_of_change_per_min: g?.rateOfChange != null ? r(g.rateOfChange, 2) : null,
            delta_30m: g?.delta30m != null ? r(g.delta30m) : null,
        },
        influencers: {
            iob: {
                total_u: iob?.totalIOB != null ? r(iob.totalIOB, 2) : 0,
                bolus_u: iob?.bolusIOB != null ? r(iob.bolusIOB, 2) : 0,
                basal_deviation_u: iob?.basalIOB != null ? r(iob.basalIOB, 2) : 0,
                glucose_impact: iob?.glucoseImpact != null ? r(iob.glucoseImpact) : 0,
                units,
            },
            cob: {
                total_g: cob?.cob != null ? r(cob.cob) : 0,
                active_g: cob?.activeCOB != null ? r(cob.activeCOB) : 0,
                pending_g: cob?.pendingCOB != null ? r(cob.pendingCOB) : 0,
                glucose_impact: cob?.glucoseImpact != null ? r(cob.glucoseImpact) : 0,
            },
        },
        attribution,
        forecast,
        device: {
            sensor_age_hours: sensorAge != null ? r(sensorAge, 1) : null,
            sensor_ok: sensorAge != null ? sensorAge < 168 : true,
            pump_site_age_hours: status.pump?.pumpAge != null ? r(status.pump.pumpAge, 1) : null,
            reservoir_units: status.pump?.reservoir ?? null,
        },
        history_30m_summary: historySummary,
    };
}

// ---------------------------------------------------------------------------
// Tuning context builder
// ---------------------------------------------------------------------------

function buildBlockDiffs(
    current: number[],
    optimized: number[],
    confidences: [number, number][],
    blockLabels: string[],
    units: string,
    windowsPerBlock: number
): TuningBlockDiff[] {
    return current.map((cur, i) => {
        const opt = optimized[i] ?? cur;
        const changePct = cur !== 0 ? ((opt - cur) / cur) * 100 : 0;
        const [lo, hi] = confidences[i] ?? [opt * 0.8, opt * 1.2];
        const direction: TuningBlockDiff['direction'] =
            Math.abs(changePct) < 2 ? 'unchanged' : changePct > 0 ? 'increase' : 'decrease';

        return {
            time_block: blockLabels[i] ?? `Block ${i + 1}`,
            current: r(cur),
            optimized: r(opt),
            change_pct: r(changePct),
            confidence: confidenceLabel(opt, lo, hi, windowsPerBlock),
            confidence_interval: formatCI(lo, hi, units),
            direction,
        };
    }).filter(d => d.direction !== 'unchanged'); // Only include changed blocks
}

/**
 * Build structured tuning context for profile and tuning explain endpoints.
 * Produces labeled, annotated diffs rather than raw before/after numbers.
 */
export function buildTuningContext(tuning: IMealActivityTuning): TuningContext {
    const cur = tuning.current_values;
    const opt = tuning.optimized_values;
    const units = cur.units;
    const windows = opt?.windows_analyzed ?? tuning.analysis_summary?.total_windows ?? 0;
    const windowsPerBlock = Math.max(1, Math.floor(windows / 6));

    const modelQuality: ModelQualityContext = {
        r_squared: r(opt?.r_squared ?? 0, 2),
        rmse: r(opt?.rmse ?? 0, 1),
        mae: r(opt?.mae ?? 0, 1),
        windows_analyzed: windows,
        quality_label: qualityLabel(opt?.r_squared ?? 0),
        quality_note: qualityNote(opt?.r_squared ?? 0, windows),
    };

    // ISF diffs (6 blocks — 4 hour each)
    const isfDiffs: TuningBlockDiff[] = opt
        ? buildBlockDiffs(
            cur.isf,
            opt.isf,
            opt.isf_confidence ?? cur.isf.map(() => [0, 0] as [number, number]),
            TIME_BLOCKS_6,
            `${units} per U`,
            windowsPerBlock
        )
        : [];

    // CR diffs (6 blocks)
    const crDiffs: TuningBlockDiff[] = opt
        ? buildBlockDiffs(
            cur.cr,
            opt.cr,
            opt.cr_confidence ?? cur.cr.map(() => [0, 0] as [number, number]),
            TIME_BLOCKS_6,
            `g/U`,
            windowsPerBlock
        )
        : [];

    // Basal diffs (12 blocks — 2 hour each)
    const basalDiffs: TuningBlockDiff[] = opt
        ? buildBlockDiffs(
            cur.basal,
            opt.basal,
            opt.basal_confidence ?? cur.basal.map(() => [0, 0] as [number, number]),
            TIME_BLOCKS_12,
            `U/hr`,
            windowsPerBlock
        )
        : [];

    // Activity context
    let activity: ActivityTuningContext | undefined;
    if (tuning.mode !== 'meal' && opt?.activity_coefficients) {
        const ac = opt.activity_confidence;
        activity = {
            steps_coefficient_current: r(cur.activity_coefficients?.steps ?? 0, 4),
            steps_coefficient_optimized: r(opt.activity_coefficients.steps, 4),
            hr_coefficient_current: r(cur.activity_coefficients?.heartRate ?? 0, 4),
            hr_coefficient_optimized: r(opt.activity_coefficients.heartRate, 4),
            steps_confidence: ac?.steps
                ? confidenceLabel(opt.activity_coefficients.steps, ac.steps[0], ac.steps[1], windows)
                : 'unknown',
            hr_confidence: ac?.heartRate
                ? confidenceLabel(opt.activity_coefficients.heartRate, ac.heartRate[0], ac.heartRate[1], windows)
                : 'unknown',
            activity_impact_detected:
                Math.abs(opt.activity_coefficients.steps) > 0.001 ||
                Math.abs(opt.activity_coefficients.heartRate) > 0.01,
        };
    }

    return {
        tuning_id: tuning.tuning_id,
        mode: tuning.mode,
        analysis_period_days: tuning.config.analysis_period_days,
        units,
        model_quality: modelQuality,
        data_summary: {
            total_windows: windows,
            meal_windows: tuning.analysis_summary?.meal_windows ?? 0,
            activity_windows: tuning.analysis_summary?.activity_windows ?? 0,
            quality_score: tuning.analysis_summary?.data_quality_score ?? 0,
            sufficient_data: windows >= tuning.config.min_windows_required,
        },
        isf_diffs: isfDiffs,
        cr_diffs: crDiffs,
        basal_diffs: basalDiffs,
        activity,
    };
}

// ---------------------------------------------------------------------------
// Compose explain context
// ---------------------------------------------------------------------------

/**
 * Compose a full ExplainContext for the LLM.
 * Used by all three explain endpoints.
 */
export function buildExplainContext(
    type: ExplainContext['type'],
    attribution?: AttributionContext,
    tuning?: TuningContext,
    patterns?: any[]
): ExplainContext {
    return { type, attribution, tuning, patterns };
}

/**
 * Serialize ExplainContext to a formatted string for the LLM user prompt.
 * Produces a structured, labelled text block — not raw JSON.
 */
export function serializeExplainContext(ctx: ExplainContext): string {
    const sections: string[] = [];

    if (ctx.attribution) {
        const a = ctx.attribution;

        sections.push(`## Current Status (as of ${new Date(a.as_of).toLocaleTimeString()})`);
        sections.push(`Glucose: ${a.glucose.value} ${a.glucose.units} — ${a.glucose.trend}${
            a.glucose.rate_of_change_per_min != null
                ? ` (${signed(a.glucose.rate_of_change_per_min)} ${a.glucose.units}/min)`
                : ''
        }`);
        if (a.history_30m_summary) sections.push(a.history_30m_summary);

        sections.push(`\n## Active Metabolic Influencers`);
        const iob = a.influencers.iob;
        sections.push(`IOB: ${iob.total_u} U (bolus: ${iob.bolus_u} U, basal deviation: ${iob.basal_deviation_u} U) → expected glucose impact: ${signed(iob.glucose_impact)} ${iob.units}`);
        const cob = a.influencers.cob;
        sections.push(`COB: ${cob.total_g}g total (${cob.active_g}g actively absorbing, ${cob.pending_g}g pending) → expected glucose impact: ${signed(cob.glucose_impact)} ${iob.units}`);

        if (a.attribution.length > 0) {
            sections.push(`\n## Attribution Breakdown`);
            for (const tf of a.attribution) {
                sections.push(`\n### ${tf.label.charAt(0).toUpperCase() + tf.label.slice(1)}`);
                sections.push(`Actual change: ${signed(tf.actual_change)} ${tf.units} | Predicted: ${signed(tf.predicted_change)} ${tf.units} | Unexplained: ${signed(tf.unexplained_delta)} ${tf.units}`);
                sections.push(`Model accuracy: ${tf.model_accuracy}`);
                sections.push(`Components:`);
                sections.push(`  - Insulin: ${signed(tf.components.insulin.value)} ${tf.units} — ${tf.components.insulin.interpretation}`);
                sections.push(`  - Carbs: ${signed(tf.components.carbs.value)} ${tf.units} — ${tf.components.carbs.interpretation}`);
                sections.push(`  - Basal: ${signed(tf.components.basal.value)} ${tf.units} — ${tf.components.basal.interpretation}`);
                sections.push(`  - Activity: ${signed(tf.components.activity.value)} ${tf.units} — ${tf.components.activity.interpretation}`);
            }
        }

        if (a.forecast) {
            sections.push(`\n## 4-Hour Forecast`);
            sections.push(`30 min: ${a.forecast.short_term_30m} ${a.forecast.units} | 4 hr eventual: ${a.forecast.eventual_4hr} ${a.forecast.units} | Range: ${a.forecast.min_predicted}–${a.forecast.max_predicted} ${a.forecast.units}`);
        }

        sections.push(`\n## Device Status`);
        sections.push(`Sensor age: ${a.device.sensor_age_hours != null ? `${a.device.sensor_age_hours}h` : 'unknown'}${!a.device.sensor_ok ? ' ⚠️ approaching end of life' : ''}`);
        if (a.device.pump_site_age_hours != null) sections.push(`Pump site: ${a.device.pump_site_age_hours}h`);
        if (a.device.reservoir_units != null) sections.push(`Reservoir: ${a.device.reservoir_units} U remaining`);
    }

    if (ctx.tuning) {
        const t = ctx.tuning;

        sections.push(`## Tuning Run Summary`);
        sections.push(`Mode: ${t.mode} | Period: ${t.analysis_period_days} days | Units: ${t.units}`);
        sections.push(`Data: ${t.data_summary.total_windows} analysis windows (${t.data_summary.meal_windows} meal, ${t.data_summary.activity_windows} activity)`);
        sections.push(`\n## Model Quality`);
        sections.push(t.model_quality.quality_note);

        if (t.isf_diffs.length > 0) {
            sections.push(`\n## Insulin Sensitivity Factor (ISF) Changes`);
            for (const d of t.isf_diffs) {
                sections.push(`  ${d.time_block}: ${d.current} → ${d.optimized} ${t.units} per U (${d.change_pct > 0 ? '+' : ''}${d.change_pct}%) — ${d.confidence}`);
                sections.push(`    Confidence interval: ${d.confidence_interval}`);
            }
        }

        if (t.cr_diffs.length > 0) {
            sections.push(`\n## Carb Ratio (CR) Changes`);
            for (const d of t.cr_diffs) {
                sections.push(`  ${d.time_block}: ${d.current} → ${d.optimized} g/U (${d.change_pct > 0 ? '+' : ''}${d.change_pct}%) — ${d.confidence}`);
            }
        }

        if (t.basal_diffs.length > 0) {
            sections.push(`\n## Basal Rate Changes`);
            for (const d of t.basal_diffs) {
                sections.push(`  ${d.time_block}: ${d.current} → ${d.optimized} U/hr (${d.change_pct > 0 ? '+' : ''}${d.change_pct}%) — ${d.confidence}`);
            }
        }

        if (t.activity) {
            sections.push(`\n## Activity Coefficients`);
            const act = t.activity;
            sections.push(`Steps: ${act.steps_coefficient_current} → ${act.steps_coefficient_optimized} (${act.steps_confidence})`);
            sections.push(`Heart rate: ${act.hr_coefficient_current} → ${act.hr_coefficient_optimized} (${act.hr_confidence})`);
            sections.push(`Activity impact detected: ${act.activity_impact_detected ? 'yes' : 'no'}`);
        }

        if (t.attribution_evidence) {
            sections.push(`\n## Attribution Evidence from Analysis Period`);
            sections.push(`Period: ${t.attribution_evidence.period_start} to ${t.attribution_evidence.period_end}`);
            sections.push(`Average unexplained delta by time block:`);
            for (const b of t.attribution_evidence.avg_unexplained_by_block) {
                sections.push(`  ${b.time_block}: avg ${signed(b.avg_unexplained)} ${t.units} (${b.nights} nights)`);
            }
        }
    }



    if (ctx.patterns && ctx.patterns.length > 0) {
        sections.push(`\n## Active Longitudinal Patterns`);
        sections.push(`The background model has detected these recurring patterns active around this time:`);
        for (const p of ctx.patterns) {
            sections.push(`\n### Pattern: ${p.pattern_type.replace(/_/g, ' ').toUpperCase()}`);
            sections.push(`Magnitude: ${p.magnitude.direction === 'positive' ? '+' : '-'}${p.magnitude.mean} mg/dL average error (max ${p.magnitude.max} mg/dL)`);
            sections.push(`Frequency: Seen on ${p.occurrence_count} of the last ${p.days_in_window} days.`);
            if (p.time_window) {
                sections.push(`Time window: ${p.time_window.start_hour}:00 to ${p.time_window.end_hour}:00`);
            }
            sections.push(`Confidence: ${p.confidence}`);
        }
    }

    return sections.join('\n');
}
