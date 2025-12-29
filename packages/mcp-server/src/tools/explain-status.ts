// Explain status tool refactored to call the WebApp API

export const toolDefinition = {
    name: "explain_status",
    description: "Get a detailed natural language explanation of the current diabetes management status and recommendations",
    inputSchema: {
        type: "object",
        properties: {
            timestamp: { type: "string", description: "ISO timestamp (defaults to now)" }
        }
    }
};

export async function handler(args: any) {
    const timestamp = (args?.timestamp as string) || new Date().toISOString();

    try {
        const response = await fetch(`http://localhost:3000/api/explain?timestamp=${encodeURIComponent(timestamp)}`);
        if (!response.ok) {
            throw new Error(`WebApp API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as { explanation: string };
        return {
            content: [{
                type: "text",
                text: data.explanation || "Could not generate explanation."
            }]
        };
    } catch (error: any) {
        console.error("Failed to fetch explanation from WebApp:", error);
        return {
            content: [{
                type: "text",
                text: `Error fetching explanation: ${error.message}`
            }],
            isError: true
        };
    }
}
