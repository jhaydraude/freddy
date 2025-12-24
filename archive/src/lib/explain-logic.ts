import { getStatus } from './status-logic.js';
import { getStatusHistory } from './history-logic.js';
import { calculateProjectedGlucose } from './prediction-logic.js';
import { generateExplanation } from './llm-service.js';
import { EXPLAIN_SYSTEM_PROMPT, generateExplainUserPrompt } from './prompts.js';

export async function explainStatus(timestamp: string | Date = new Date()): Promise<string> {
    const now = new Date(timestamp);
    const nowIso = now.toISOString();

    // 1. Gather Context
    const [currentStatus, history, projection] = await Promise.all([
        getStatus(now),
        getStatusHistory({
            startTime: nowIso,
            windowSize: 60, // Look back 60 minutes
            bucketSize: 5
        }),
        calculateProjectedGlucose(30) // Predict 30 mins ahead
    ]);

    // 2. Formulate Prompt
    const dataContext = {
        current: {
            glucose: currentStatus.glucose,
            iob: currentStatus.iob,
            cob: currentStatus.cob,
            pump: currentStatus.pump
        },
        history_summary: history.map(h => {
            const { profile, ...rest } = h;
            return rest;
        }),
        projection: projection ? {
            predicted_bg_30m: projection.projectedBg,
            reasoning: projection.activityLines
        } : "Not available"
    };

    // 3. Call LLM
    return generateExplanation({
        system: EXPLAIN_SYSTEM_PROMPT,
        user: generateExplainUserPrompt(now.toLocaleTimeString(), dataContext)
    });
}
