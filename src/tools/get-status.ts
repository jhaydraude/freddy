import { getStatus as getStatusLogic } from '../lib/status-logic.js';

export const toolDefinition = {
    name: "get_status",
    description: "Get current diabetes management status including glucose, IOB, COB, and pump settings.",
    inputSchema: {
        type: "object",
        properties: {
            timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
        }
    }
};

export async function handler(args: any) {
    const timestamp = (args?.timestamp as string) || new Date().toISOString();
    const status = await getStatusLogic(timestamp);

    return {
        content: [{
            type: "text",
            text: JSON.stringify(status, null, 2)
        }]
    };
}
