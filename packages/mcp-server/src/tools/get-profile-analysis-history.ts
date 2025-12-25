import { ProfileAnalysis } from '../db/models.js';

export const toolDefinition = {
    name: "get_profile_analysis_history",
    description: "Retrieves the history of profile analysis runs, including estimated parameters and recommendations.",
    inputSchema: {
        type: "object",
        properties: {
            limit: { type: "number", description: "Number of records to return (default: 1)" }
        }
    }
};

export async function handler(args: any) {
    const limit = (args?.limit as number) || 1;

    try {
        const history = await ProfileAnalysis.find({})
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        if (!history || history.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify([], null, 2)
                }]
            };
        }

        // Format dates for better readability
        const formattedHistory = history.map((record: any) => ({
            ...record,
            timestamp: record.timestamp.toISOString()
        }));

        return {
            content: [{
                type: "text",
                text: JSON.stringify(formattedHistory, null, 2)
            }]
        };
    } catch (error: any) {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    error: "Failed to retrieve profile analysis history",
                    message: error.message
                }, null, 2)
            }]
        };
    }
}
