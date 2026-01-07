/**
 * MCP Client helper for calling NightManager MCP tools
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class NightManagerMCPClient {
    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;

    async connect() {
        // Create client transport
        this.transport = new StdioClientTransport({
            command: 'npx',
            args: ['tsx', 'src/index.ts'],
            cwd: 'd:/Dev/NightManager/packages/mcp-server' // Point to the correct package
        });

        // Create and connect client
        this.client = new Client(
            {
                name: 'data-generator-client',
                version: '1.0.0'
            },
            {
                capabilities: {}
            }
        );

        await this.client.connect(this.transport);
        console.error('Connected to NightManager MCP server');
    }

    async callTool(name: string, args: any): Promise<any> {
        if (!this.client) {
            throw new Error('Client not connected. Call connect() first.');
        }

        const result = (await this.client.callTool({ name, arguments: args })) as any;

        if (!result.content || result.content.length === 0) {
            throw new Error(`No content returned from tool: ${name}`);
        }

        const text = result.content[0].type === 'text' ? result.content[0].text : '';
        return JSON.parse(text);
    }

    async close() {
        if (this.transport) {
            await this.transport.close();
        }
    }
}

// Convenience functions
export async function callMCPTool(toolName: string, args: any): Promise<any> {
    const client = new NightManagerMCPClient();
    try {
        await client.connect();
        return await client.callTool(toolName, args);
    } finally {
        await client.close();
    }
}
