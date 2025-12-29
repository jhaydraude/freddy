import { webAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "get_glucose",
    description: "Get recent glucose entries (SGV) from Nightscout",
    inputSchema: {
        type: "object",
        properties: {
            count: { type: "number", description: "Number of entries to return (default: 1)" }
        }
    }
};

export async function handler(args: any) {
    const count = (args?.count as number) || 1;

    try {
        const data = await webAppApi.getGlucose(count);
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
