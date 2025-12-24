import { generateProfileTrainingData } from '../lib/profile-training-logic.js';

export const toolDefinition = {
    name: "generate_profile_training_data",
    description: "Generate training samples for the profile tuning ML model and automatically train it. Returns both data generation stats and training results.",
    inputSchema: {
        type: "object",
        properties: {
            startDate: { type: "string", description: "Start date ISO format (default: 3 months ago)" },
            endDate: { type: "string", description: "End date ISO format (default: now)" },
            intervalHours: { type: "number", description: "Interval between samples in hours (default: 6)" },
            lookbackWindow: { type: "number", description: "Lookback window for input history in minutes (default: 60)" },
            outcomeWindowHours: { type: "number", description: "Outcome evaluation window in hours (default: 4)" },
            model_name: { type: "string", description: "Name for the trained model (default: profile_tuner)" },
            test_size: { type: "number", description: "Fraction of data for validation 0.0-0.5 (default: 0.2)" },
            parameters: { type: "object", description: "XGBoost hyperparameters (optional)" }
        }
    }
};

export async function handler(args: any) {
    const options: any = {};
    if (args?.startDate) options.startDate = new Date(args.startDate as string);
    if (args?.endDate) options.endDate = new Date(args.endDate as string);
    if (args?.intervalHours !== undefined) options.intervalHours = args.intervalHours as number;
    if (args?.lookbackWindow !== undefined) options.lookbackWindow = args.lookbackWindow as number;
    if (args?.outcomeWindowHours !== undefined) options.outcomeWindowHours = args.outcomeWindowHours as number;

    const result = await generateProfileTrainingData(options);

    // If we have enough samples, automatically train the model
    if (result.count >= 10) {
        try {
            const trainingUrl = process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000';
            const response = await fetch(`${trainingUrl}/api/v1/train/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model_name: args?.model_name || 'profile_tuner',
                    samples: result.samples,
                    test_size: args?.test_size || 0.2,
                    parameters: args?.parameters || {}
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Training API failed: ${response.status} - ${errorText}`);
            }

            const trainingResult = await response.json();

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        data_generation: {
                            samples_generated: result.count,
                            samples_skipped: result.skipped,
                            success_rate: ((result.count / (result.count + result.skipped)) * 100).toFixed(1) + '%'
                        },
                        training: trainingResult
                    }, null, 2)
                }]
            };
        } catch (trainingError: any) {
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        data_generation: {
                            samples_generated: result.count,
                            samples_skipped: result.skipped,
                            successrate: ((result.count / (result.count + result.skipped)) * 100).toFixed(1) + '%'
                        },
                        training_error: trainingError.message,
                        note: "Training data was generated successfully but training failed. You can retry training manually."
                    }, null, 2)
                }]
            };
        }
    } else {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    data_generation: {
                        samples_generated: result.count,
                        samples_skipped: result.skipped
                    },
                    error: `Insufficient samples for training. Generated ${result.count} samples but need at least 10.`
                }, null, 2)
            }]
        };
    }
}
