/**
 * profile-explain-logic.ts
 *
 * Profile analysis explain endpoint logic.
 * Builds structured context from a ProfileAnalysis document and calls the configured LLM.
 *
 * Previously: manually constructed and JSON.stringify'd a dataContext object.
 * Now: formats the analysis data into a labelled, structured text block using
 * the same serialization approach as the dashboard explain.
 *
 * Note: ProfileAnalysis uses the legacy statistical model output (IProfileAnalysis).
 * The MealActivityTuning path has its own buildTuningContext() builder (Phase 3).
 */

import { generateExplanation } from './llm-service';
import { PROFILE_EXPLAIN_SYSTEM_PROMPT, generateProfileExplainPrompt } from './prompts';
import type { IProfileAnalysis } from '../db/models';

// ---------------------------------------------------------------------------
// Time block labels (6 four-hour windows)
// ---------------------------------------------------------------------------
const TIME_BLOCKS = [
    '00:00–04:00', '04:00–08:00', '08:00–12:00',
    '12:00–16:00', '16:00–20:00', '20:00–24:00',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const r = (v: number, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;

function formatBlock(label: string, values: number[], confidences: number[][], unit: string, dp = 1): string {
    return values.map((val, i) => {
        const [lo, hi] = confidences[i] ?? [val * 0.8, val * 1.2];
        const relWidth = val !== 0 ? (hi - lo) / Math.abs(val) : 1;
        const confidence = relWidth < 0.25 ? 'high' : relWidth < 0.6 ? 'medium' : 'low';
        return `  ${TIME_BLOCKS[i] ?? `Block ${i + 1}`}: ${r(val, dp)} ${unit} [${r(lo, dp)}–${r(hi, dp)}] ${confidence} confidence`;
    }).join('\n');
}

/**
 * Build a structured, labelled text block from a ProfileAnalysis document.
 * Replaces JSON.stringify(dataContext).
 */
function buildProfileAnalysisContext(analysis: IProfileAnalysis): string {
    const lines: string[] = [];

    // Model quality
    const rSq = analysis.r_squared ?? 0;
    const windows = analysis.windows_analyzed ?? 0;
    const label = rSq > 0.7 ? 'excellent' : rSq > 0.5 ? 'good' : rSq > 0.3 ? 'moderate' : 'poor';
    const dataNote = windows > 100 ? 'high data volume' : windows > 50 ? 'adequate data' : 'limited data';
    const caution = rSq < 0.5
        ? ' Results should be interpreted with caution.'
        : ' Results are statistically meaningful.';
    const qualityLine = `${label} fit (R²=${r(rSq, 2)}, RMSE=${r(analysis.rmse ?? 0, 1)}, MAE=${r(analysis.mae ?? 0, 1)}) — ${dataNote} (${windows} analysis windows).${caution}`;

    lines.push('## Model Quality');
    lines.push(qualityLine);

    // Summary averages
    const avgISF = analysis.estimated_isf.length > 0
        ? r(analysis.estimated_isf.reduce((a, b) => a + b, 0) / analysis.estimated_isf.length)
        : null;
    const avgICR = analysis.estimated_icr.length > 0
        ? r(analysis.estimated_icr.reduce((a, b) => a + b, 0) / analysis.estimated_icr.length)
        : null;
    const avgBasal = analysis.estimated_basal_rates.length > 0
        ? r(analysis.estimated_basal_rates.reduce((a, b) => a + b, 0) / analysis.estimated_basal_rates.length, 3)
        : null;

    lines.push('\n## Estimated Parameter Averages');
    if (avgISF != null) lines.push(`ISF (Insulin Sensitivity Factor): ${avgISF} mg/dL per U`);
    if (avgICR != null) lines.push(`ICR (Insulin-to-Carb Ratio): ${avgICR} g per U`);
    if (avgBasal != null) lines.push(`Basal Rate: ${avgBasal} U/hr`);

    // Time-block breakdown: ISF
    if (analysis.estimated_isf.length > 0) {
        lines.push('\n## Estimated ISF by Time Block');
        lines.push('(mg/dL per unit of insulin | [confidence interval] | confidence level)');
        lines.push(formatBlock('ISF', analysis.estimated_isf, analysis.isf_confidence ?? [], 'mg/dL per U'));
    }

    // ICR
    if (analysis.estimated_icr.length > 0) {
        lines.push('\n## Estimated Carb Ratio (ICR) by Time Block');
        lines.push('(grams of carbs per unit of insulin)');
        lines.push(formatBlock('ICR', analysis.estimated_icr, analysis.icr_confidence ?? [], 'g per U'));
    }

    // Basal
    if (analysis.estimated_basal_rates.length > 0) {
        lines.push('\n## Estimated Basal Rates by Time Block');
        lines.push('(units per hour)');
        lines.push(formatBlock('Basal', analysis.estimated_basal_rates, analysis.basal_confidence ?? [], 'U/hr', 3));
    }

    // Activity coefficients
    const actCoefs = analysis.estimated_activity_coefficients as any;
    if (actCoefs) {
        lines.push('\n## Activity Coefficients');
        if (actCoefs.steps_per_minute != null) {
            const stepsImpact = Math.abs(actCoefs.steps_per_minute) < 0.01
                ? 'no measurable step impact detected'
                : `${actCoefs.steps_per_minute > 0 ? 'raises' : 'lowers'} glucose by ~${r(Math.abs(actCoefs.steps_per_minute), 4)} mg/dL per step/min`;
            lines.push(`Steps: ${stepsImpact}`);
        }
        if (actCoefs.hr_spike != null) {
            lines.push(`Heart rate spike: ${r(actCoefs.hr_spike, 4)} mg/dL per elevated BPM`);
        }
        if (actCoefs.stress_hr != null) {
            lines.push(`Stress HR: ${r(actCoefs.stress_hr, 4)} mg/dL per elevated BPM without steps`);
        }
    }

    // Recommendation
    if (analysis.recommendation) {
        lines.push('\n## Model Recommendation');
        lines.push(analysis.recommendation);
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate an LLM-powered explanation for a profile analysis result.
 */
export async function explainProfileAnalysis(analysis: IProfileAnalysis): Promise<string> {
    const structuredContext = buildProfileAnalysisContext(analysis);

    return generateExplanation({
        system: PROFILE_EXPLAIN_SYSTEM_PROMPT,
        user: generateProfileExplainPrompt(structuredContext),
    });
}
