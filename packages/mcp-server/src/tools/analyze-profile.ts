import { webAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "analyze_profile",
    description: "Holistic profile analysis: estimates ISF, ICR, and 6 basal rates (4-hour blocks) by analyzing time windows. Uses optimization to model the complete insulin-glucose-carb system.",
    inputSchema: {
        type: "object",
        properties: {
            endDate: { type: "string", description: "End date ISO format (default: now)" },
            daysBack: { type: "number", description: "Days of history to analyze (default: 30)" },
            windowHours: { type: "number", description: "Hours per window (default: 2)" }
        }
    }
};

export async function handler(args: any) {
    try {
        const analysis = await webAppApi.analyzeProfile(args);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(analysis, null, 2)
            }]
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
        };
    }
}
