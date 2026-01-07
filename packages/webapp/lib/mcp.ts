import { connectToDatabase } from './db/connection';
import { getStatusHistory } from './logic/history-logic';
import { ProfileAnalysis } from './db/models';
// import { handler as analyzeProfileHandler } from '../../../mcp-server/src/tools/analyze-profile'; // Still need this for now or move tool logic
import { resolveActiveProfile } from './logic/profile-logic';
import { getGlucosePrediction as getPredictionLogic } from './logic/prediction-logic';
import { getStatus, getGlucose } from './logic/status-logic';
import { explainStatus } from './logic/explain-logic';

// Ensure single connection
let isConnected = false;

async function ensureConnected() {
    if (!isConnected) {
        try {
            await connectToDatabase();
            isConnected = true;
        } catch (e) {
            console.error("Failed to connect to DB", e);
            throw e;
        }
    }
}

export async function getMcpHistory(options: any) {
    await ensureConnected();
    return await getStatusHistory(options);
}

export async function getProfileAnalysisHistory(limit: number = 10) {
    await ensureConnected();
    const history = await ProfileAnalysis.find({})
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

    // Serialize for Next.js (Date objects to strings)
    return JSON.parse(JSON.stringify(history));
}

export async function getActiveProfile() {
    await ensureConnected();
    const profile = await resolveActiveProfile(new Date());
    return JSON.parse(JSON.stringify(profile));
}

import { generateTimeWindows } from './logic/profile-analysis-logic';

export async function runProfileAnalysis(options: any) {
    await ensureConnected();

    const endDate = options?.endDate ? new Date(options.endDate as string) : new Date();
    const daysBack = (options?.daysBack as number) || 30;
    const windowHours = (options?.windowHours as number) || 2;

    const windows = await generateTimeWindows({ endDate, daysBack, windowHours });

    if (windows.length === 0) {
        throw new Error("No valid time windows generated");
    }

    let currentProfile = null;
    try {
        const profileInfo = await resolveActiveProfile(new Date());
        if (profileInfo?.profileData) {
            currentProfile = profileInfo.profileData;
        }
    } catch (e) {
        console.error("Profile fetch error", e);
    }

    const analysisUrl = process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${analysisUrl}/api/v1/analyze/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            windows: windows,
            current_profile: currentProfile
        })
    });

    if (!response.ok) {
        throw new Error(`Profile analysis failed: ${response.status}`);
    }

    const analysis = await response.json();

    // Save to DB
    try {
        const analysisRecord = new ProfileAnalysis({
            timestamp: new Date(),
            ...analysis
        });
        await analysisRecord.save();
    } catch (e) {
        console.error("DB Save error", e);
    }

    return {
        ...analysis,
        data_info: {
            windows_generated: windows.length,
            date_range: `Last ${daysBack} days ending ${endDate.toISOString()}`,
            window_hours: windowHours,
            days_analyzed: daysBack
        }
    };
}

export async function getExplanation(timestamp: string) {
    await ensureConnected();
    return await explainStatus(timestamp);
}

export async function getGlucosePrediction(timestamp: string, durationMinutes: number = 240) {
    await ensureConnected();
    return await getPredictionLogic(timestamp, durationMinutes);
}

export async function getAnalysisData(timestamp: string) {
    await ensureConnected();

    const targetDate = new Date(timestamp);
    const fourHoursLater = new Date(targetDate.getTime() + 4 * 60 * 60 * 1000);

    const [historyBefore, statusAt, prediction, historyAfter] = await Promise.all([
        getStatusHistory({
            startTime: timestamp,
            windowSize: 60,
            bucketSize: 5
        }),
        getStatus(timestamp),
        getPredictionLogic(timestamp, 240),
        getStatusHistory({
            startTime: fourHoursLater.toISOString(),
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

import { generateISFEstimationData } from './logic/profile-estimation-logic';
import { generateTrainingData as generateGlucoseTD } from './logic/training-data-logic';
import { generateProfileTrainingData as generateProfileTD } from './logic/profile-training-logic';

export async function runISFEstimation(options: any) {
    await ensureConnected();
    const startDate = options?.startDate ? new Date(options.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = options?.endDate ? new Date(options.endDate) : new Date();

    const result = await generateISFEstimationData(startDate, endDate);

    const trainingUrl = process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${trainingUrl}/api/v1/estimate/isf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: result.events })
    });

    if (!response.ok) {
        throw new Error(`ISF estimation failed: ${response.status}`);
    }

    const estimation = await response.json();
    return {
        ...estimation,
        data_summary: {
            total_events: result.count,
            high_quality_events: result.high_quality_count,
            date_range: `${startDate.toISOString()} to ${endDate.toISOString()}`
        }
    };
}

export async function generateGlucoseTrainingData(options: any) {
    await ensureConnected();
    return await generateGlucoseTD(options);
}

export async function generateProfileTrainingData(options: any) {
    await ensureConnected();
    return await generateProfileTD(options);
}
