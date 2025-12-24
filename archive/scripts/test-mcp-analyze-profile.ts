/**
 * Test the holistic profile analyzer via MCP tool
 */

async function testAnalyzeProfile() {
    try {
        console.log('Testing analyze_profile MCP tool...\n');

        // Call via HTTP to the MCP server (MCP Inspector endpoint)
        const response = await fetch('http://localhost:5173/sse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                method: 'tools/call',
                params: {
                    name: 'analyze_profile',
                    arguments: {
                        startDate: '2025-09-23T13:30:00Z',
                        endDate: '2025-12-23T13:30:00Z',
                        windowHours: 4
                    }
                }
            })
        });

        const result = await response.json();
        console.log('Result:', JSON.stringify(result, null, 2));

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

testAnalyzeProfile();
