import { webAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "get_status_history",
    description: "Retrieve a series of historical status points. Useful for training data or trend analysis.",
    inputSchema: {
        type: "object",
        properties: {
            startTime: { type: "string", description: "ISO timestamp representing the END of the window (looks backward from here)" },
            windowSize: { type: "number", description: "Minutes of history to retrieve (default: 60)" },
            bucketSize: { type: "number", description: "Bucket size in minutes (default: 5)" }
        }
    }
};

export async function handler(args: any) {
    try {
        const data = await webAppApi.getHistory(args);
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
