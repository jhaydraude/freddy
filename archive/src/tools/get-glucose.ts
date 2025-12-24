import { getGlucose as getGlucoseLogic } from '../lib/status-logic.js';

export const toolDefinition = {
    name: "get_glucose",
    description: "Get glucose readings. Defaults to latest, or at a specific timestamp. Includes sensor age and device info.",
    inputSchema: {
        type: "object",
        properties: {
            count: { type: "number", description: "Number of readings (default: 1)" },
            timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
        }
    }
};

export async function handler(args: any) {
    const count = (args?.count as number) || 1;
    const timestamp = (args?.timestamp as string);
    const result = await getGlucoseLogic({ timestamp, count });

    return {
        content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
        }]
    };
}
