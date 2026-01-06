import { callWebAppApi } from '../api-client.js';

export const toolDefinition = {
    name: "recalculate_statuses",
    description: "Recalculates and caches computed statuses with attribution for a given time range. Useful for invalidating cache after retroactive treatment edits or for pre-warming the cache.",
    inputSchema: {
        type: "object",
        properties: {
            startTime: {
                type: "string",
                description: "Start of time range (ISO timestamp)"
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
        },
        required: ["startTime"]
    }
};

export async function handler(args: any) {
    const startTime = args.startTime as string;
    const endTime = (args?.endTime as string) || new Date().toISOString();
    const bucketSize = (args?.bucketSize as number) || 5;
    const includeAttribution = args?.includeAttribution !== false;

    try {
        const result = await callWebAppApi('/api/cache/recalculate', {
            startTime,
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
