import { getStatus } from './status-logic.js';
import { getStatusHistory } from './history-logic.js';
import { calculateProjectedGlucose, getGlucosePrediction } from './prediction-logic.js';
import { generateExplanation } from './llm-service.js';
import { EXPLAIN_SYSTEM_PROMPT, generateExplainUserPrompt } from './prompts.js';

export async function explainStatus(timestamp: string | Date = new Date()): Promise<string> {
    const now = new Date(timestamp);
    const nowIso = now.toISOString();

    // 1. Gather Context
    const [currentStatus, history, projection30m, fullPrediction] = await Promise.all([
        getStatus(now),
        getStatusHistory({
            startTime: nowIso,
            windowSize: 60, // Look back 60 minutes
            bucketSize: 5
        }),
        calculateProjectedGlucose(30), // Point prediction
        getGlucosePrediction(now, 240) // 4 hour projection
    ]);

    // 2. Formulate Prompt
    const attribution30m = currentStatus.attribution?.timeframes?.find(tf => tf.minutes === 30);

    const dataContext = {
        current: {
            glucose: `${currentStatus.glucose?.current?.sgv} ${currentStatus.glucose?.units}`,
            trend: currentStatus.glucose?.current?.direction,
            rate_of_change: currentStatus.glucose?.current?.rateOfChange ? `${currentStatus.glucose.current.rateOfChange.toFixed(1)} ${currentStatus.glucose.units}/min` : "unknown",
            delta30m: currentStatus.glucose?.current?.delta30m,
            iob: {
                total: currentStatus.iob?.calculated?.totalIOB,
                bolus: currentStatus.iob?.calculated?.bolusIOB,
                basal_dev: currentStatus.iob?.calculated?.basalIOB
            },
            cob: {
                total: currentStatus.cob?.calculated?.cob,
                active: currentStatus.cob?.calculated?.activeCOB,
                pending: currentStatus.cob?.calculated?.pendingCOB
            }
        },
        attribution_30m: attribution30m ? {
            actual_change: attribution30m.glucoseChange.actual,
            predicted_change: attribution30m.glucoseChange.predicted,
            unexplained_delta: attribution30m.components.unexplained,
            breakdown: {
                insulin: attribution30m.components.insulin.value,
                carbs: attribution30m.components.carbs.value,
                basal: attribution30m.components.basal.value,
                activity: {
                    impact: attribution30m.components.activity.value,
                    intensity: attribution30m.components.activity.intensity,
                    steps: attribution30m.components.activity.steps,
                    heart_rate: attribution30m.components.activity.heartRate,
                    calories: attribution30m.components.activity.calories,
                    stairs: attribution30m.components.activity.stairs,
                    data_available: attribution30m.components.activity.dataAvailable
                }
            }
        } : "Not available",
        device_health: {
            sensor_age_hours: currentStatus.glucose?.sensor?.age,
            sensor_noise: currentStatus.glucose?.sensor?.noise,
            pump_age_hours: currentStatus.pump?.pumpAge,
            reservoir: currentStatus.pump?.reservoir
        },
        history_20m: history.slice(0, 4).map(h => ({
            time: h.meta?.status_date,
            sgv: h.glucose?.current?.sgv
        })),
        projection_30m: projection30m ? {
            predicted_bg: projection30m.projectedBg,
            reasoning: projection30m.activityLines
        } : "Not available",
        long_term_prediction: fullPrediction.length > 0 ? {
            min_bg: Math.min(...fullPrediction.map(p => p.sgv)),
            max_bg: Math.max(...fullPrediction.map(p => p.sgv)),
            eventual_bg: fullPrediction[fullPrediction.length - 1].sgv,
            trend_summary: "4-hour lookahead"
        } : "Not available"
    };

    // 3. Call LLM
    return generateExplanation({
        system: EXPLAIN_SYSTEM_PROMPT,
        user: generateExplainUserPrompt(now.toLocaleTimeString(), dataContext)
    });
}
