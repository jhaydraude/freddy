import { getGlucosePrediction } from '../lib/prediction-logic.js';
import { ComputedStatus } from '../db/models.js';
import { bucketTimestamp } from '../lib/time-utils.js';

export const toolDefinition = {
    name: "predict_glucose",
    description: "Generate a glucose prediction array starting from a specific timestamp. Projects glucose into the future based on current IOB, COB, and active temp basals. Results are saved to the status cache.",
    inputSchema: {
        type: "object",
        properties: {
            timestamp: { type: "string", description: "ISO timestamp (defaults to now)" },
            durationMinutes: { type: "number", description: "How many minutes to project into the future (default: 120)", default: 120 },
            forceRecalculate: { type: "boolean", description: "Force recalculation even if cached (default: false)" }
        }
    }
};

export async function handler(args: any) {
    const timestamp = (args?.timestamp as string) || new Date().toISOString();
    const durationMinutes = args?.durationMinutes !== undefined ? Number(args.durationMinutes) : 120;
    const forceRecalculate = args?.forceRecalculate === true;

    const targetDate = new Date(timestamp);
    const bucketedDate = bucketTimestamp(targetDate);

    // 1. Try to fetch from cache
    if (!forceRecalculate) {
        const cached = await ComputedStatus.findOne({ timestamp: bucketedDate });
        if (cached?.prediction) {
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        timestamp: bucketedDate.toISOString(),
                        prediction: cached.prediction
                    }, null, 2)
                }]
            };
        }
    }

    // 2. Generate prediction
    const prediction = await getGlucosePrediction(bucketedDate, durationMinutes);

    // 3. Save to cache (upsert)
    const now = new Date();
    await ComputedStatus.findOneAndUpdate(
        { timestamp: bucketedDate },
        {
            $set: {
                prediction,
                updated_at: now,
                version: "1.0"
            },
            $setOnInsert: {
                created_at: now,
                // If it's a new record, we should probably initialize status?
                // But get_status usually handles that. For now, we just save prediction.
                status: {}
            }
        },
        { upsert: true }
    );

    return {
        content: [{
            type: "text",
            text: JSON.stringify({
                timestamp: bucketedDate.toISOString(),
                prediction
            }, null, 2)
        }]
    };
}
