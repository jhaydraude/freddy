import { webAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "generate_profile_training_data",
    description: "Generates profile analysis training samples by identifying stable and meal windows",
    inputSchema: {
        type: "object",
        properties: {
            daysBack: { type: "number", description: "Days of history to process (default: 30)" },
            windowHours: { type: "number", description: "Hours per window (default: 2)" }
        }
    }
};

export async function handler(args: any) {
    try {
        const result = await webAppApi.generateProfileTrainingData(args);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }]
        };
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
        };
    }
}
