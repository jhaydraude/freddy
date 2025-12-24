import { getIOB } from '../lib/iob-logic.js';
import { DeviceStatus } from '../db/models.js';

export const toolDefinition = {
    name: "get_iob",
    description: "Get comprehensive Insulin on Board (Delivered, Scheduled, and Net) with optional timeseries data",
    inputSchema: {
        type: "object",
        properties: {
            timestamp: { type: "string", description: "ISO timestamp (defaults to now)" },
            includeTimeseries: { type: "boolean", description: "Include historical IOB/activity arrays (default: false)" }
        }
    }
};

export async function handler(args: any) {
    const timestamp = (args?.timestamp as string) || new Date().toISOString();
    const includeTimeseries = args?.includeTimeseries === true;

    const [calcIOB, latestDS] = await Promise.all([
        getIOB(timestamp, includeTimeseries),
        DeviceStatus.findOne({
            "openaps.iob": { $exists: true }
        }).sort({ created_at: -1 })
    ]);

    const reportedIOB = latestDS?.openaps?.iob || null;

    return {
        content: [{
            type: "text",
            text: JSON.stringify({
                timestamp,
                calculated: calcIOB,
                reported: reportedIOB
            }, null, 2)
        }]
    };
}
