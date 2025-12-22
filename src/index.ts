import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { connectToDatabase } from "./db/connection.js";
import { resolveActiveProfile } from "./lib/profile-logic.js";
import { getBasalRate } from "./lib/basal-logic.js";
import { getIOB } from "./lib/iob-logic.js";
import { getCOB } from "./lib/cob-logic.js";
import { getGlucose, getStatus } from "./lib/status-logic.js";
import { getGraphData } from "./lib/history-logic.js";
import { Treatment, DeviceStatus } from "./db/models.js";

const server = new Server(
    {
        name: "nightmanager",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "get_glucose",
                description: "Get glucose readings. Defaults to latest, or at a specific timestamp. Includes sensor age and device info.",
                inputSchema: {
                    type: "object",
                    properties: {
                        timestamp: { type: "string", description: "ISO timestamp for specific point in time" },
                        count: { type: "number", description: "Number of readings to fetch (default 1)" }
                    }
                },
            },
            {
                name: "get_active_profile",
                description: "Get the active profile (ISF, CR, Basal) at a specific time",
                inputSchema: {
                    type: "object",
                    properties: {
                        timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
                    }
                },
            },
            {
                name: "get_calculated_basal",
                description: "Calculate the exact basal rate (accounting for temp basals and profile switches) at a specific time",
                inputSchema: {
                    type: "object",
                    properties: {
                        timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
                    }
                },
            },
            {
                name: "get_iob",
                description: "Get comprehensive Insulin on Board (Delivered, Scheduled, and Net)",
                inputSchema: {
                    type: "object",
                    properties: {
                        timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
                    }
                },
            },
            {
                name: "get_cob",
                description: "Get current Carbs on Board",
                inputSchema: {
                    type: "object",
                    properties: {
                        timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
                    }
                },
            },
            {
                name: "get_status",
                description: "Get a summary of current system status (Basal, IOB, COB, Profile)",
                inputSchema: {
                    type: "object",
                    properties: {
                        timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
                    }
                },
            },
            {
                name: "get_history",
                description: "Get glucose and treatment history for a date range",
                inputSchema: {
                    type: "object",
                    properties: {
                        startDate: { type: "string", description: "ISO start date" },
                        endDate: { type: "string", description: "ISO end date" }
                    },
                    required: ["startDate", "endDate"]
                },
            },
        ],
    };
});

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        await connectToDatabase();

        switch (name) {
            case "get_glucose": {
                const count = (args?.count as number) || 1;
                const timestamp = (args?.timestamp as string);
                const enrichedEntries = await getGlucose({ count, timestamp });
                return { content: [{ type: "text", text: JSON.stringify(enrichedEntries, null, 2) }] };
            }

            case "get_active_profile": {
                const timestamp = (args?.timestamp as string) || new Date().toISOString();
                const profileInfo = await resolveActiveProfile(timestamp);
                if (!profileInfo) {
                    return { content: [{ type: "text", text: "null" }] };
                }
                const { doc, ...cleanProfile } = profileInfo;
                return { content: [{ type: "text", text: JSON.stringify(cleanProfile, null, 2) }] };
            }

            case "get_calculated_basal": {
                const timestamp = (args?.timestamp as string) || new Date().toISOString();
                const basalResult = await getBasalRate(timestamp);
                return { content: [{ type: "text", text: JSON.stringify({ ...basalResult, timestamp }, null, 2) }] };
            }

            case "get_iob": {
                const timestamp = (args?.timestamp as string) || new Date().toISOString();
                const [calcIOB, latestDS] = await Promise.all([
                    getIOB(timestamp),
                    DeviceStatus.findOne().sort({ created_at: -1 })
                ]);

                let pumpIOB: any = null;
                if (latestDS?.pump?.extended?.IOB !== undefined) {
                    pumpIOB = { iob: latestDS.pump.extended.IOB, source: "pump.extended.IOB" };
                } else if (latestDS?.openaps?.iob) {
                    pumpIOB = { ...latestDS.openaps.iob, source: "openaps.iob" };
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            calculated: calcIOB,
                            reported: pumpIOB,
                            timestamp
                        }, null, 2)
                    }]
                };
            }

            case "get_cob": {
                const timestamp = (args?.timestamp as string) || new Date().toISOString();
                const cob = await getCOB(timestamp);
                return { content: [{ type: "text", text: JSON.stringify({ cob, timestamp }, null, 2) }] };
            }

            case "get_status": {
                const timestamp = (args?.timestamp as string) || new Date().toISOString();
                const status = await getStatus(timestamp);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(status, null, 2)
                    }]
                };
            }

            case "get_history": {
                const { startDate, endDate } = args as { startDate: string, endDate: string };
                const data = await getGraphData(startDate, endDate);
                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});

/**
 * Start the server.
 */
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("NightManager MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
