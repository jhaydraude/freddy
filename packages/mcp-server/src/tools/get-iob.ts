import { webAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "get_iob",
    description: "Get comprehensive Insulin on Board (Delivered, Scheduled, and Net) with optional timeseries data",
    inputSchema: {
        type: "object",
        properties: {
            timestamp: { type: "string", description: "ISO timestamp (defaults to now)" },
            includeTimeseries: { type: "boolean", description: "Include historical IOB/activity arrays (default: true)" }
        }
    }
};

export async function handler(args: any) {
    const timestamp = (args?.timestamp as string) || new Date().toISOString();
    const includeTimeseries = args?.includeTimeseries !== false;

    try {
        const data = await webAppApi.getIOB(timestamp, includeTimeseries);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(data, null, 2)
            }]
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
        };
    }
}
