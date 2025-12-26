import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { connectToDatabase } from "./db/connection.js";

// Import tool handlers
import * as getGlucose from "./tools/get-glucose.js";
import * as getStatus from "./tools/get-status.js";
import * as getStatusHistory from "./tools/get-status-history.js";
import * as getIOB from "./tools/get-iob.js";
import * as getCOB from "./tools/get-cob.js";
import * as explainStatus from "./tools/explain-status.js";
import * as generateTrainingData from "./tools/generate-training-data.js";
import * as generateProfileTrainingData from "./tools/generate-profile-training-data.js";
import * as estimateISF from "./tools/estimate-isf.js";
import * as analyzeProfile from "./tools/analyze-profile.js";
import * as getProfileAnalysisHistory from "./tools/get-profile-analysis-history.js";

// Register all tools
const tools = [
    getGlucose,
    getStatus,
    getStatusHistory,
    getIOB,
    getCOB,
    explainStatus,
    generateTrainingData,
    generateProfileTrainingData,
    estimateISF,
    estimateISF,
    analyzeProfile,
    getProfileAnalysisHistory
];

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
        tools: tools.map(t => t.toolDefinition)
    };
});

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        await connectToDatabase();

        const tool = tools.find(t => t.toolDefinition.name === name);
        if (!tool) {
            throw new Error(`Unknown tool: ${name}`);
        }

        return await tool.handler(args);
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});

/**
 * Start the MCP server.
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
