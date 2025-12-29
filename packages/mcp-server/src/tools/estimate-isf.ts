import { webAppApi } from '../api-client.js';

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
    try {
        const result = await webAppApi.estimateISF(args);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }]
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
        };
    }
}
