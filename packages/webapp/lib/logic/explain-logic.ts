/**
 * explain-logic.ts
 *
 * Dashboard explain endpoint logic.
 * Builds structured attribution context and calls the configured LLM provider.
 *
 * Previously: manually constructed a dataContext object and JSON.stringify'd it.
 * Now: uses buildAttributionContext() + serializeExplainContext() for labelled,
 * pre-annotated LLM input that the model can parse without guessing units or field meanings.
 */

import { getStatus } from './status-logic';
import { getGlucosePrediction } from './prediction-logic';
import { SurfacedPattern } from '../db/models';
import { generateExplanation } from './llm-service';
import { buildAttributionContext, serializeExplainContext, buildExplainContext } from './llm';
import { EXPLAIN_SYSTEM_PROMPT, generateExplainUserPrompt } from './prompts';

export async function explainStatus(timestamp: string | Date = new Date()): Promise<string> {
    const now = new Date(timestamp);

    // 1. Gather context — prediction gives us the 4-hour forecast, status gives everything else
    const [currentStatus, fullPrediction] = await Promise.all([
        getStatus(now),
        getGlucosePrediction(now, 240),  // 4-hour projection
    ]);

    // 2. Build structured attribution context (replaces the manual dataContext object)
    const attributionCtx = buildAttributionContext(
        currentStatus,
        fullPrediction.length > 0 ? fullPrediction : null,
        now
    );

    // 2.5 Fetch any active patterns that overlap this hour
    const currentHour = now.getHours();
    const activePatterns = await SurfacedPattern.find({
        status: 'active',
        $or: [
            { time_window: { $exists: false } },
            {
                'time_window.start_hour': { $lte: currentHour },
                'time_window.end_hour': { $gt: currentHour }
            }
        ]
    }).lean();

    const explainCtx = buildExplainContext('dashboard', attributionCtx, undefined, activePatterns);
    const structuredContext = serializeExplainContext(explainCtx);

    // 3. Call the configured LLM provider
    return generateExplanation({
        system: EXPLAIN_SYSTEM_PROMPT,
        user: generateExplainUserPrompt(now.toLocaleTimeString(), structuredContext),
    });
}
