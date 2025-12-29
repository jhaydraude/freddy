import { webAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "get_status",
    description: "Get comprehensive status (Glucose, IOB, COB, Pump, Profile) at a point in time. Includes attribution data by default.",
    inputSchema: {
        type: "object",
        properties: {
            timestamp: { type: "string", description: "ISO timestamp (defaults to now)" },
            includeTimeseries: { type: "boolean", description: "Include historical/future timeseries arrays (default: true)" }
        }
    }
};

export async function handler(args: any) {
    const timestamp = (args?.timestamp as string) || new Date().toISOString();
    const includeTimeseries = args?.includeTimeseries !== false;

    try {
        const status = await webAppApi.getStatus(timestamp, includeTimeseries);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(status, null, 2)
            }]
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
        };
    }
}
