import { callWebAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "recalculate_statuses",
    description: "Recalculates and caches computed statuses with attribution for a recent window of time. Useful for invalidating cache after retroactive treatment edits or for pre-warming the cache.",
    inputSchema: {
        type: "object",
        properties: {
            hoursBack: {
                type: "number",
                description: "Number of hours to look back from the end time (default: 4)"
            },
            endTime: {
                type: "string",
                description: "End of time range (ISO timestamp, defaults to now)"
            },
            bucketSize: {
                type: "number",
                description: "Bucket size in minutes (default: 5)"
            },
            includeAttribution: {
                type: "boolean",
                description: "Include attribution calculations (default: true)"
            }
        }
    }
};

export async function handler(args: any) {
    const hoursBack = (args?.hoursBack as number) || 4;
    const endTime = (args?.endTime as string) || new Date().toISOString();
    const bucketSize = (args?.bucketSize as number) || 5;
    const includeAttribution = args?.includeAttribution !== false;

    try {
        const result = await callWebAppApi('/api/cache/recalculate', {
            hoursBack,
            endTime,
            bucketSize,
            includeAttribution
        }, 'POST');

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
