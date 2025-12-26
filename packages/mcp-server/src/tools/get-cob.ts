import { getCOB } from '../lib/cob-logic.js';

export const toolDefinition = {
    name: "get_cob",
    description: "Get comprehensive Carbs on Board with optional timeseries data",
    inputSchema: {
        type: "object",
        properties: {
            timestamp: { type: "string", description: "ISO timestamp (defaults to now)" },
            includeTimeseries: { type: "boolean", description: "Include historical COB/absorption arrays (default: true)" }
        }
    }
};

export async function handler(args: any) {
    const timestamp = (args?.timestamp as string) || new Date().toISOString();
    const includeTimeseries = args?.includeTimeseries !== false;

    const result = await getCOB(timestamp, includeTimeseries);

    return {
        content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
        }]
    };
}
