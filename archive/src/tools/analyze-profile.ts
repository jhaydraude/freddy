import { generateTimeWindows } from '../lib/profile-analysis-logic.js';
import { resolveActiveProfile, getProfileStore } from '../lib/profile-logic.js';

export const toolDefinition = {
    name: "analyze_profile",
    description: "Holistic profile analysis: estimates ISF, ICR, and 6 basal rates (4-hour blocks) by analyzing time windows. Uses optimization to model the complete insulin-glucose-carb system.",
    inputSchema: {
        type: "object",
        properties: {
            endDate: { type: "string", description: "End date ISO format (default: now)" },
            daysBack: { type: "number", description: "Days of history to analyze (default: 30)" },
            windowHours: { type: "number", description: "Hours per window (default: 2)" }
        }
    }
};

export async function handler(args: any) {
    const endDate = args?.endDate ? new Date(args.endDate as string) : new Date();
    const daysBack = (args?.daysBack as number) || 30;
    const windowHours = (args?.windowHours as number) || 2;

    console.log(`Generating ${windowHours}-hour time windows for ${daysBack} days...`);
    const windows = await generateTimeWindows({ endDate, daysBack, windowHours });

    if (windows.length === 0) {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    error: "No valid time windows generated",
                    date_range: `Last ${daysBack} days ending ${endDate.toISOString()}`
                }, null, 2)
            }]
        };
    }

    // Fetch current active profile
    let currentProfile = null;
    try {
        const profileInfo = await resolveActiveProfile(new Date());
        if (profileInfo?.profileData) {
            currentProfile = profileInfo.profileData;
        } else if (profileInfo?.doc) {
            currentProfile = getProfileStore(profileInfo.doc, profileInfo.activeProfileName);
        }
    } catch (profileError) {
        console.error("Failed to fetch current profile:", profileError);
    }

    try {
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
            const errorText = await response.text();
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        error: `Profile analysis failed: ${response.status}`,
                        details: errorText,
                        windows_generated: windows.length
                    }, null, 2)
                }]
            };
        }

        const analysis = await response.json();

        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    ...analysis,
                    data_info: {
                        windows_generated: windows.length,
                        date_range: `Last ${daysBack} days ending ${endDate.toISOString()}`,
                        window_hours: windowHours,
                        days_analyzed: daysBack
                    }
                }, null, 2)
            }]
        };
    } catch (apiError: any) {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    error: "Failed to call analysis API",
                    message: apiError.message,
                    windows_generated: windows.length,
                    note: "Windows were generated but API call failed. Check if PredictiveModelsService is running."
                }, null, 2)
            }]
        };
    }
}
