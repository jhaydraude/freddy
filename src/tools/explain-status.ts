import { explainStatus } from '../lib/explain-logic.js';

export const toolDefinition = {
    name: "explain_status",
    description: "Get a detailed natural language explanation of the current diabetes management status and recommendations",
    inputSchema: {
        type: "object",
        properties: {
            timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
        }
    }
};

export async function handler(args: any) {
    const timestamp = (args?.timestamp as string) || new Date().toISOString();
    const explanation = await explainStatus(timestamp);

    return {
        content: [{
            type: "text",
            text: explanation
        }]
    };
}
