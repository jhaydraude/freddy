import { generateExplanation } from './llm-service';
import { PROFILE_EXPLAIN_SYSTEM_PROMPT, generateProfileExplainPrompt } from './prompts';
import type { IProfileAnalysis } from '../db/models';

/**
 * Generate an LLM-powered explanation for a profile analysis result.
 */
export async function explainProfileAnalysis(analysis: IProfileAnalysis): Promise<string> {
    // Calculate averages for summary
    const avgISF = analysis.estimated_isf.reduce((a, b) => a + b, 0) / analysis.estimated_isf.length;
    const avgICR = analysis.estimated_icr.reduce((a, b) => a + b, 0) / analysis.estimated_icr.length;
    const avgBasal = analysis.estimated_basal_rates.reduce((a, b) => a + b, 0) / analysis.estimated_basal_rates.length;

    // Format timeline-based parameters (6 four-hour blocks)
    const timeBlocks = ['00:00-04:00', '04:00-08:00', '08:00-12:00', '12:00-16:00', '16:00-20:00', '20:00-00:00'];

    const timelineISF = analysis.estimated_isf.map((val, idx) => ({
        time: timeBlocks[idx],
        value: Math.round(val * 10) / 10,
        confidence: {
            lower: Math.round(analysis.isf_confidence[idx][0] * 10) / 10,
            upper: Math.round(analysis.isf_confidence[idx][1] * 10) / 10
        }
    }));

    const timelineICR = analysis.estimated_icr.map((val, idx) => ({
        time: timeBlocks[idx],
        value: Math.round(val * 10) / 10,
        confidence: {
            lower: Math.round(analysis.icr_confidence[idx][0] * 10) / 10,
            upper: Math.round(analysis.icr_confidence[idx][1] * 10) / 10
        }
    }));

    const timelineBasal = analysis.estimated_basal_rates.map((val, idx) => ({
        time: timeBlocks[idx],
        value: Math.round(val * 1000) / 1000,
        confidence: {
            lower: Math.round(analysis.basal_confidence[idx][0] * 1000) / 1000,
            upper: Math.round(analysis.basal_confidence[idx][1] * 1000) / 1000
        }
    }));

    // Build enhanced context for LLM
    const dataContext = {
        summary: {
            isf_average: Math.round(avgISF * 10) / 10,
            icr_average: Math.round(avgICR * 10) / 10,
            basal_average: Math.round(avgBasal * 1000) / 1000,
            activity_coefficients: analysis.estimated_activity_coefficients || null
        },
        timeline_parameters: {
            isf_by_time: timelineISF,
            icr_by_time: timelineICR,
            basal_by_time: timelineBasal
        },
        model_quality: {
            r_squared: analysis.r_squared,
            rmse: analysis.rmse,
            mae: analysis.mae,
            interpretation: analysis.r_squared > 0.7 ? 'Excellent fit' :
                analysis.r_squared > 0.5 ? 'Good fit' :
                    analysis.r_squared > 0.3 ? 'Moderate fit' : 'Poor fit'
        },
        activity_analysis: (analysis as any).estimated_activity_coefficients ? {
            steps_coefficient: (analysis as any).estimated_activity_coefficients.steps_per_minute,
            hr_spike_coefficient: (analysis as any).estimated_activity_coefficients.hr_spike,
            stress_hr_coefficient: (analysis as any).estimated_activity_coefficients.stress_hr ?? null,
            confidence: (analysis as any).activity_confidence || null,
            interpretation: Math.abs((analysis as any).estimated_activity_coefficients.steps_per_minute || 0) < 0.01 ?
                'No measurable activity impact detected' :
                'Activity impact detected'
        } : null,
        data_quality: {
            windows_analyzed: analysis.windows_analyzed,
            windows_filtered_out: (analysis as any).windows_filtered_out,
            stable_windows: (analysis as any).stable_windows,
            meal_windows: (analysis as any).meal_windows,
            quality_score: analysis.windows_analyzed > 100 ? 'high' :
                analysis.windows_analyzed > 50 ? 'medium' : 'low',
            sufficient_data: analysis.windows_analyzed >= 50
        },
        tuning_suggestions: (analysis as any).tuning_suggestions || [],
        current_recommendation: analysis.recommendation
    };

    return generateExplanation({
        system: PROFILE_EXPLAIN_SYSTEM_PROMPT,
        user: generateProfileExplainPrompt(dataContext)
    });
}
