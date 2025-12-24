import { connectToDatabase } from '@nightmanager/mcp-server/src/db/connection.js'; // Note the .js extension might be necessary or problematic depending on res
import { getStatusHistory } from '@nightmanager/mcp-server/src/lib/history-logic.js';

// Ensure single connection
let isConnected = false;

export async function getMcpHistory(options: any) {
    if (!isConnected) {
        try {
            await connectToDatabase();
            isConnected = true;
        } catch (e) {
            console.error("Failed to connect to DB", e);
            throw e;
        }
    }

    return await getStatusHistory(options);
}
