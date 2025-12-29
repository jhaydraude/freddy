import { webAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "generate_training_data",
    description: "Generates glucose prediction training samples from historical data",
    inputSchema: {
        type: "object",
        properties: {
            daysBack: { type: "number", description: "Days of history to process (default: 1)" },
            interval: { type: "number", description: "Interval between samples in minutes (default: 5)" },
            windowSize: { type: "number", description: "Lookback window for each sample (default: 20)" }
        }
    }
};

export async function handler(args: any) {
    try {
        const result = await webAppApi.generateGlucoseTrainingData(args);
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
