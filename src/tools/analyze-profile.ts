import { generateTimeWindows } from '../lib/profile-analysis-logic.js';

export const toolDefinition = {
    name: "analyze_profile",
    description: "Holistic profile analysis: estimates ISF, ICR, and 24 basal rates simultaneously by analyzing 4-hour time windows over a date range. Uses optimization to model the complete insulin-glucose-carb system.",
    inputSchema: {
        type: "object",
        properties: {
            startDate: { type: "string", description: "Start date ISO format (default: 30 days ago)" },
            endDate: { type: "string", description: "End date ISO format (default: now)" },
            windowHours: { type: "number", description: "Hours per window (default: 4)" }
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
    const windowHours = (args?.windowHours as number) || 4;

    console.log(`Generating ${windowHours}-hour time windows...`);
    const windows = await generateTimeWindows({ startDate, endDate, windowHours });

    if (windows.length === 0) {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    error: "No valid time windows generated",
                    date_range: `${startDate.toISOString()} to ${endDate.toISOString()}`
                }, null, 2)
            }]
        };
    }

    try {
        const analysisUrl = process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000';
        const response = await fetch(`${analysisUrl}/api/v1/analyze/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ windows: windows })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        error: `Profile analysis failed: ${response.status}`,
                        details: errorText,
                        windows_generated: windows.length
                    }, null, 2)
                }]
            };
        }

        const analysis = await response.json();

        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    ...analysis,
                    data_info: {
                        windows_generated: windows.length,
                        date_range: `${startDate.toISOString()} to ${endDate.toISOString()}`,
                        window_hours: windowHours
                    }
                }, null, 2)
            }]
        };
    } catch (apiError: any) {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    error: "Failed to call analysis API",
                    message: apiError.message,
                    windows_generated: windows.length,
                    note: "Windows were generated but API call failed. Check if PredictiveModelsService is running."
                }, null, 2)
            }]
        };
    }
}
