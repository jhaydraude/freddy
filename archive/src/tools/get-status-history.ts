import { getStatusHistory } from '../lib/history-logic.js';

export const toolDefinition = {
    name: "get_status_history",
    description: "Get system status history over a window of time at regular intervals",
    inputSchema: {
        type: "object",
        properties: {
            startTime: { type: "string", description: "ISO timestamp for window start (default: now)" },
            windowSize: { type: "number", description: "Window size in minutes (default: 60)" },
            bucketSize: { type: "number", description: "Bucket interval in minutes (default: 5)" }
        }
    }
};

export async function handler(args: any) {
    const result = await getStatusHistory({
        startTime: args?.startTime,
        windowSize: args?.windowSize,
        bucketSize: args?.bucketSize
    });

    return {
        content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
        }]
    };
}
