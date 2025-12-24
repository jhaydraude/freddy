import { getStatus as getStatusLogic } from '../lib/status-logic.js';
import { getIOB } from '../lib/iob-logic.js';
import { getCOB } from '../lib/cob-logic.js';
import { attributeGlucoseChange } from '../lib/attribution-logic.js';
import { ComputedStatus } from '../db/models.js';
import { bucketTimestamp } from '../lib/time-utils.js';

export const toolDefinition = {
    name: "get_status",
    description: "Get current diabetes management status including glucose, IOB, COB, and pump settings. Optionally include glucose change attribution. Results are cached in 5-minute buckets for performance.",
    inputSchema: {
        type: "object",
        properties: {
            timestamp: { type: "string", description: "ISO timestamp (defaults to now)" },
            forceRecalculate: { type: "boolean", description: "Force recalculation even if cached (default: false)" },
            includeAttribution: { type: "boolean", description: "Include glucose change attribution analysis (default: false)" }
        }
    }
};

export async function handler(args: any) {
    const timestamp = (args?.timestamp as string) || new Date().toISOString();
    const forceRecalculate = args?.forceRecalculate === true;
    const includeAttribution = args?.includeAttribution === true;

    const targetDate = new Date(timestamp);
    const bucketedDate = bucketTimestamp(targetDate);

    // Try to fetch cached status
    if (!forceRecalculate) {
        const cached = await ComputedStatus.findOne({ timestamp: bucketedDate });
        if (cached) {
            // If we need attribution but cached doesn't have it, recalculate
            if (includeAttribution && !cached.attribution) {
                // Fall through to recalculation
            } else {
                // Return cached status (with or without attribution)
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            ...cached.status,
                            attribution: cached.attribution || undefined
                        }, null, 2)
                    }]
                };
            }
        }
    }

    // Calculate base status
    let status = await getStatusLogic(bucketedDate);

    // If attribution requested, enhance status with timeseries and calculate attribution
    let attribution = undefined;
    if (includeAttribution) {
        // Get IOB and COB with timeseries for attribution
        const [iobWithTimeseries, cobWithTimeseries] = await Promise.all([
            getIOB(bucketedDate, true),  // includeTimeseries = true
            getCOB(bucketedDate, true)   // includeTimeseries = true
        ]);

        // Replace IOB and COB in status with timeseries versions
        status = {
            ...status,
            iob: iobWithTimeseries,
            cob: cobWithTimeseries
        };

        // Calculate attribution
        const attributionResult = await attributeGlucoseChange(status);
        attribution = {
            "5min": attributionResult.timeframes.find(t => t.timeframe === '5min'),
            "10min": attributionResult.timeframes.find(t => t.timeframe === '10min'),
            "15min": attributionResult.timeframes.find(t => t.timeframe === '15min'),
            "30min": attributionResult.timeframes.find(t => t.timeframe === '30min')
        };
    }

    // Store in cache (upsert)
    const now = new Date();
    await ComputedStatus.findOneAndUpdate(
        { timestamp: bucketedDate },
        {
            $set: {
                status,
                attribution,
                updated_at: now,
                version: "1.0"
            },
            $setOnInsert: {
                created_at: now
            }
        },
        { upsert: true }
    );

    return {
        content: [{
            type: "text",
            text: JSON.stringify({
                ...status,
                attribution: attribution || undefined
            }, null, 2)
        }]
    };
}
