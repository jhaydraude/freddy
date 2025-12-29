import { connectToDatabase } from '@nightmanager/mcp-server/src/db/connection.js'; // Note the .js extension might be necessary or problematic depending on res
import { getStatusHistory } from '@nightmanager/mcp-server/src/lib/history-logic.js';
import { ProfileAnalysis, Profile } from '@nightmanager/mcp-server/src/db/models.js';
import { handler as analyzeProfileHandler } from '@nightmanager/mcp-server/src/tools/analyze-profile.js';
import { resolveActiveProfile } from '@nightmanager/mcp-server/src/lib/profile-logic.js';

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

export async function getProfileAnalysisHistory(limit: number = 10) {
    if (!isConnected) {
        await connectToDatabase();
        isConnected = true;
    }
    const history = await ProfileAnalysis.find({})
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

    // Serialize for Next.js (Date objects to strings)
    return JSON.parse(JSON.stringify(history));
}

export async function getActiveProfile() {
    if (!isConnected) {
        await connectToDatabase();
        isConnected = true;
    }
    const profile = await resolveActiveProfile(new Date());
    return JSON.parse(JSON.stringify(profile));
}

export async function runProfileAnalysis(options: any) {
    if (!isConnected) {
        await connectToDatabase();
        isConnected = true;
    }

    // Call the tool handler directly
    // The handler writes to DB if successful
    const result = await analyzeProfileHandler(options);

    // Parse the inner content text if it's a string
    if (result.content?.[0]?.text) {
        try {
            return JSON.parse(result.content[0].text);
        } catch (e) {
            return result.content[0].text;
        }
    }
    return result;
}

import { getGlucosePrediction as getPredictionLogic } from '@nightmanager/mcp-server/src/lib/prediction-logic.js';
import { getStatus } from '@nightmanager/mcp-server/src/lib/status-logic.js';

export async function getGlucosePrediction(timestamp: string, durationMinutes: number = 240) {
    if (!isConnected) {
        await connectToDatabase();
        isConnected = true;
    }
    return await getPredictionLogic(timestamp, durationMinutes);
}

export async function getAnalysisData(timestamp: string) {
    if (!isConnected) {
        await connectToDatabase();
        isConnected = true;
    }

    const targetDate = new Date(timestamp);
    const fourHoursLater = new Date(targetDate.getTime() + 4 * 60 * 60 * 1000);

    const [historyBefore, statusAt, prediction, historyAfter] = await Promise.all([
        // 1. 1 hour of history before
        getStatusHistory({
            startTime: timestamp,
            windowSize: 60,
            bucketSize: 5
        }),
        // 2. Attribution data for that point (Status includes attribution by default)
        getStatus(timestamp),
        // 3. Glucose projections for 4 hours
        getPredictionLogic(timestamp, 240),
        // 4. Actual data from that 4 hour span (if available)
        getStatusHistory({
            startTime: fourHoursLater.toISOString(), // history-logic looks BACK from startTime
            windowSize: 240,
            bucketSize: 5
        })
    ]);

    return {
        historyBefore,
        statusAt,
        prediction,
        historyAfter
    };
}
