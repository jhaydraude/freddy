import { webAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "explain_status",
    description: "Get a natural language explanation of the current glucose situation using Gemini AI",
    inputSchema: {
        type: "object",
        properties: {
            timestamp: { type: "string", description: "ISO timestamp of the situation to explain (defaults to now)" }
        }
    }
};

export async function handler(args: any) {
    const timestamp = (args?.timestamp as string) || new Date().toISOString();

    try {
        const explanation = await webAppApi.explainStatus(timestamp);
        return {
            content: [{
                type: "text",
                text: explanation
            }]
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
        };
    }
}
