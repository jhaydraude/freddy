import dotenv from 'dotenv';
dotenv.config();

const WEBAPP_URL = process.env.WEBAPP_URL || 'http://localhost:3000';

export async function callWebAppApi(endpoint: string, params: Record<string, any> = {}, method: 'GET' | 'POST' = 'GET') {
    const url = new URL(`${WEBAPP_URL}${endpoint}`);

    let options: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (method === 'GET') {
        Object.keys(params).forEach(key => url.searchParams.append(key, String(params[key])));
    } else {
        options.body = JSON.stringify(params);
    }

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WebApp API error (${response.status}): ${errorText}`);
    }

    return await response.json();
}

/**
 * Convenience methods for specific endpoints
 */
export const webAppApi = {
    getIOB: (timestamp?: string, includeTimeseries?: boolean) =>
        callWebAppApi('/api/iob', { timestamp, includeTimeseries }),

    getCOB: (timestamp?: string, includeTimeseries?: boolean) =>
        callWebAppApi('/api/cob', { timestamp, includeTimeseries }),

    getGlucose: (count?: number) =>
        callWebAppApi('/api/glucose', { count }),

    getStatus: (timestamp?: string, includeTimeseries?: boolean) =>
        callWebAppApi('/api/status', { timestamp, includeTimeseries }),

    getPrediction: (timestamp?: string, durationMinutes?: number) =>
        callWebAppApi('/api/predict', { timestamp, durationMinutes }),

    getHistory: (options: any) =>
        callWebAppApi('/api/history', options),

    explainStatus: (timestamp?: string) =>
        callWebAppApi('/api/explain', { timestamp }),

    analyzeProfile: (options: any) =>
        callWebAppApi('/api/profile/analyze', options, 'POST'),

    getProfileHistory: (limit?: number) =>
        callWebAppApi('/api/profile/history', { limit }),

    estimateISF: (options: any) =>
        callWebAppApi('/api/profile/estimate-isf', options, 'POST'),

    generateGlucoseTrainingData: (options: any) =>
        callWebAppApi('/api/training/glucose', options, 'POST'),

    generateProfileTrainingData: (options: any) =>
        callWebAppApi('/api/training/profile', options, 'POST')
};
