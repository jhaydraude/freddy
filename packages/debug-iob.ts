
import { connectToDatabase } from '../mcp-server/src/db/connection.js';
import { getStatus } from '../mcp-server/src/lib/status-logic.js';

async function main() {
    await connectToDatabase();
    console.log("Connected to DB");

    const result = await getStatus(new Date().toISOString());
    console.log("IOB Result:", JSON.stringify(result.iob, null, 2));

    process.exit(0);
}

main().catch(console.error);
