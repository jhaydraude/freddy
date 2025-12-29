import { webAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "get_profile_analysis_history",
    description: "Retrieve historical profile analysis results",
    inputSchema: {
        type: "object",
        properties: {
            limit: { type: "number", description: "Number of analysis records to retrieve (default: 10)" }
        }
    }
};

export async function handler(args: any) {
    const limit = (args?.limit as number) || 10;
    try {
        const history = await webAppApi.getProfileHistory(limit);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(history, null, 2)
            }]
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
        };
    }
}
