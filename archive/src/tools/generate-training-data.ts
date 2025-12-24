import { generateTrainingData } from '../lib/training-data-logic.js';

export const toolDefinition = {
    name: "generate_training_data",
    description: "Generate training samples for the glucose prediction ML model. Returns status_history inputs paired with actual glucose 60min later.",
    inputSchema: {
        type: "object",
        properties: {
            startDate: { type: "string", description: "Start date ISO format (default: 7 days ago)" },
            endDate: { type: "string", description: "End date ISO format (default: now)" },
            intervalHours: { type: "number", description: "Interval between samples in hours (default: 1)" },
            includeInterventions: { type: "boolean", description: "Include samples with carb/insulin interventions (default: false)" }
        }
    }
};

export async function handler(args: any) {
    const options: any = {};
    if (args?.startDate) options.startDate = new Date(args.startDate as string);
    if (args?.endDate) options.endDate = new Date(args.endDate as string);
    if (args?.intervalHours !== undefined) options.intervalHours = args.intervalHours as number;
    if (args?.includeInterventions !== undefined) options.includeInterventions = args.includeInterventions as boolean;

    const result = await generateTrainingData(options);

    return {
        content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
        }]
    };
}
