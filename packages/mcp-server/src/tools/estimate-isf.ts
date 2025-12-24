import { generateISFEstimationData } from '../lib/profile-estimation-logic.js';

export const toolDefinition = {
    name: "estimate_isf",
    description: "Estimate ISF from historical insulin correction events. Analyzes observed glucose changes from corrections (accounting for all IOB) to calculate empirical ISF.",
    inputSchema: {
        type: "object",
        properties: {
            startDate: { type: "string", description: "Start date ISO format (default: 30 days ago)" },
            endDate: { type: "string", description: "End date ISO format (default: now)" }
        }
    }
};

export async function handler(args: any) {
    const startDate = args?.startDate
        ? new Date(args.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = args?.endDate
        ? new Date(args.endDate as string)
        : new Date();

    const result = await generateISFEstimationData(startDate, endDate);

    try {
        const trainingUrl = process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000';
        const response = await fetch(`${trainingUrl}/api/v1/estimate/isf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: result.events })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        error: `ISF estimation failed: ${response.status}`,
                        details: errorText,
                        events_found: result.count,
                        high_quality: result.high_quality_count
                    }, null, 2)
                }]
            };
        }

        const estimation = await response.json();

        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    ...estimation,
                    data_summary: {
                        total_events: result.count,
                        high_quality_events: result.high_quality_count,
                        date_range: `${startDate.toISOString()} to ${endDate.toISOString()}`
                    }
                }, null, 2)
            }]
        };
    } catch (apiError: any) {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    error: "Failed to call estimation API",
                    message: apiError.message,
                    events_collected: result.count,
                    note: "Events were found but API call failed. Check if PredictiveModelsService is running."
                }, null, 2)
            }]
        };
    }
}
