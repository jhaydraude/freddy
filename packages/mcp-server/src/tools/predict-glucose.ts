import { webAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "predict_glucose",
    description: "Generates a glucose prediction array by projecting glucose into the future until impacts are zero",
    inputSchema: {
        type: "object",
        properties: {
            timestamp: { type: "string", description: "The point in time to start the prediction from (defaults to now)" },
            durationMinutes: { type: "number", description: "Minutes to project into the future (default: 240)" }
        }
    }
};

export async function handler(args: any) {
    const timestamp = (args?.timestamp as string) || new Date().toISOString();
    const durationMinutes = (args?.durationMinutes as number) || 240;

    try {
        const prediction = await webAppApi.getPrediction(timestamp, durationMinutes);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(prediction, null, 2)
            }]
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
        };
    }
}
