import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { connectToDatabase } from "./db/connection.js";
import { resolveActiveProfile, getProfileStore } from "./lib/profile-logic.js";
import { getBasalFromSchedule, getBasalRate } from "./lib/basal-logic.js";
import { getIOB, calculateIOB } from "./lib/iob-logic.js";
import { getCOB, calculateCOB } from "./lib/cob-logic.js";
import { getGraphData } from "./lib/history-logic.js";
import { Treatment, Entry } from "./db/models.js";

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
                name: "get_latest_glucose",
                description: "Get the most recent glucose readings and trend.",
                inputSchema: {
                    type: "object",
                    properties: {
                        count: { type: "number", description: "Number of readings (default 1)", default: 1 }
                    }
                },
            },
            {
                name: "get_calculated_basal",
                description: "Get the effective basal rate (including active temp basals).",
                inputSchema: {
                    type: "object",
                    properties: {
                        timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
                    }
                },
            },
            {
                name: "get_active_profile",
                description: "Get the insulin profile active at a specific time.",
                inputSchema: {
                    type: "object",
                    properties: {
                        timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
                    }
                },
            },
            {
                name: "get_iob",
                description: "Get the current Insulin on Board (IOB).",
                inputSchema: {
                    type: "object",
                    properties: {
                        timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
                    }
                },
            },
            {
                name: "get_cob",
                description: "Get the current Carbs on Board (COB).",
                inputSchema: {
                    type: "object",
                    properties: {
                        timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
                    }
                },
            },
            {
                name: "get_status",
                description: "Get current IOB, COB, and Basal rate.",
                inputSchema: {
                    type: "object",
                    properties: {
                        timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
                    }
                },
            },
            {
                name: "get_history",
                description: "Get glucose and treatment history for a time range.",
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
            case "get_latest_glucose": {
                const count = (args?.count as number) || 1;
                const entries = await Entry.find().sort({ date: -1 }).limit(count);
                return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
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
                const rate = await getBasalRate(timestamp);
                return { content: [{ type: "text", text: JSON.stringify({ rate, timestamp }, null, 2) }] };
            }

            case "get_iob": {
                const timestamp = (args?.timestamp as string) || new Date().toISOString();
                const iob = await getIOB(timestamp);
                return { content: [{ type: "text", text: JSON.stringify({ iob, timestamp }, null, 2) }] };
            }

            case "get_cob": {
                const timestamp = (args?.timestamp as string) || new Date().toISOString();
                const cob = await getCOB(timestamp);
                return { content: [{ type: "text", text: JSON.stringify({ cob, timestamp }, null, 2) }] };
            }

            case "get_status": {
                const timestamp = (args?.timestamp as string) || new Date().toISOString();
                const date = new Date(timestamp);

                const [profileInfo, iob, cob, basal] = await Promise.all([
                    resolveActiveProfile(timestamp),
                    getIOB(timestamp),
                    getCOB(timestamp),
                    getBasalRate(timestamp)
                ]);

                if (!profileInfo) throw new Error("No profile found.");

                const store = getProfileStore(profileInfo.doc || undefined, profileInfo.activeProfileName, profileInfo.profileData || undefined);
                if (!store) throw new Error(`Profile store '${profileInfo.activeProfileName}' not found.`);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            timestamp,
                            basal,
                            iob,
                            cob,
                            activeProfile: profileInfo.activeProfileName,
                            baseProfileDoc: profileInfo.doc?.startDate || "Overridden",
                            units: store.units
                        }, null, 2)
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
 * Main entry point.
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
