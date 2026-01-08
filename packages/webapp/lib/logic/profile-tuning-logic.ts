import { ITimeWindow } from './profile-analysis-logic.js';

export interface ITuningSuggestion {
    parameter: 'isf' | 'cr' | 'basal' | 'dia' | 'activity' | 'activity_steps' | 'activity_hr' | 'activity_stairs' | 'activity_calories';
    currentValue: number;
    suggestedValue: number;
    changePercentage: number;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
    sampleCount: number;
}

export interface IProfileTuningResult {
    timestamp: string;
    suggestions: ITuningSuggestion[];
}

/**
 * Higher-level service to analyze historical windows and suggest profile tuning.
 */
export function calculateProfileTuning(
    windows: ITimeWindow[],
    currentProfile: any,
    options: { parameters?: string[] } = {}
): IProfileTuningResult {
    const suggestions: ITuningSuggestion[] = [];
    const params = options.parameters;

    const shouldTune = (p: string) => !params || params.includes(p);

    // Extract current settings
    const currentISF = currentProfile?.sens?.[0]?.value || 50;
    const currentCR = currentProfile?.carbs?.[0]?.value || 10;
    const currentBasal = currentProfile?.basal?.[0]?.value || 1.0;
    const currentDIA = currentProfile?.dia || 5;

    // 1. ISF Tuning (Pure Correction Windows)
    if (shouldTune('isf')) {
        const isfSuggestion = tuneISF(windows, currentISF, currentCR);
        if (isfSuggestion) suggestions.push(isfSuggestion);
    }

    // 2. DIA Tuning (Tails of Corrections)
    if (shouldTune('dia')) {
        const diaSuggestion = tuneDIA(windows, currentDIA);
        if (diaSuggestion) suggestions.push(diaSuggestion);
    }

    // 3. Activity Tuning (Movement Windows)
    if (shouldTune('activity')) {
        const activitySuggestions = tuneGranularActivity(windows, currentProfile?.activity_coefficients);
        suggestions.push(...activitySuggestions);
    }

    // 4. Nighttime Basal Drift
    if (shouldTune('basal')) {
        const basalSuggestion = tuneBasal(windows, currentBasal);
        if (basalSuggestion) suggestions.push(basalSuggestion);
    }

    return {
        timestamp: new Date().toISOString(),
        suggestions
    };
}

function tuneISF(windows: ITimeWindow[], currentISF: number, currentCR: number): ITuningSuggestion | null {
    // Isolate windows: Significant insulin activity, no carbs, low activity
    const cleanWindows = windows.filter(w =>
        w.insulin_activity > 0.5 &&
        w.carbs_consumed === 0 &&
        w.carb_absorption < 0.5 &&
        Math.abs(w.activity_impact) < 2 &&
        w.glucose_readings_count >= 10
    );

    if (cleanWindows.length < 5) return null;

    const observations: number[] = [];
    for (const w of cleanWindows) {
        const actualDrop = w.glucose_start - w.glucose_end;
        const observedISF = actualDrop / w.insulin_activity;

        // Sanity check: 5 to 500 mg/dL per unit
        if (observedISF > 5 && observedISF < 500) {
            observations.push(observedISF);
        }
    }

    if (observations.length < 3) return null;

    const avgObservedISF = observations.reduce((a, b) => a + b, 0) / observations.length;
    const changePct = ((avgObservedISF - currentISF) / currentISF) * 100;

    // Only suggest if change > 10%
    if (Math.abs(changePct) < 10) return null;

    return {
        parameter: 'isf',
        currentValue: Math.round(currentISF * 10) / 10,
        suggestedValue: Math.round(avgObservedISF * 10) / 10,
        changePercentage: Math.round(changePct * 10) / 10,
        confidence: observations.length > 10 ? 'high' : 'medium',
        reason: `Based on ${observations.length} clean correction events where carbs and exercise were negligible.`,
        sampleCount: observations.length
    };
}

function tuneDIA(windows: ITimeWindow[], currentDIA: number): ITuningSuggestion | null {
    // DIA Heuristic: "Residual Drop"
    // Look for windows 4-6 hours after a large bolus.
    // If glucose is still dropping but the model says insulin is almost gone, DIA is too short.
    // If glucose has flattened out but the model says insulin is still active, DIA is too long.

    const observations: number[] = [];

    for (let i = 4; i < windows.length; i++) {
        const w = windows[i];

        // 1. Identify a "Tail Window": insulin was delivered in the last 2-8 hours, 
        // no insulin currently, no carbs, no exercise.
        const recentBoluses = windows.slice(Math.max(0, i - 4), i).map(pw => pw.bolus_insulin || 0);
        const hadRecentBolus = recentBoluses.some(b => b > 1.0);

        const isTailWindow = hadRecentBolus && w.bolus_insulin === 0 && w.carb_absorption < 2 && w.activity_steps < 200;

        if (isTailWindow) {
            const actualDrop = w.glucose_start - w.glucose_end;

            // If we are still dropping > 10 mg/dL but model activity is near zero
            if (actualDrop > 10 && w.insulin_activity < 0.1) {
                observations.push(currentDIA + 1); // Suggest longer DIA
            }
            // If drop is negligible but model activity is still > 0.3
            else if (actualDrop < 5 && w.insulin_activity > 0.3) {
                observations.push(currentDIA - 0.5); // Suggest shorter DIA
            }
        }
    }

    if (observations.length < 3) return null;

    const avgSuggestedDIA = observations.reduce((a, b) => a + b, 0) / observations.length;
    const finalDIA = Math.min(8, Math.max(3, avgSuggestedDIA)); // Clamp between 3h and 8h

    if (Math.abs(finalDIA - currentDIA) < 0.2) return null;

    return {
        parameter: 'dia',
        currentValue: currentDIA,
        suggestedValue: Math.round(finalDIA * 10) / 10,
        changePercentage: Math.round(((finalDIA - currentDIA) / currentDIA) * 1000) / 10,
        confidence: observations.length > 5 ? 'medium' : 'low',
        reason: `Observed glucose trends in the "bolus tail" (4-6h post-delivery) suggest insulin lasts ${finalDIA > currentDIA ? 'longer' : 'shorter'} than ${currentDIA}h.`,
        sampleCount: observations.length
    };
}

function tuneGranularActivity(windows: ITimeWindow[], currentCoeffs?: any): ITuningSuggestion[] {
    const suggestions: ITuningSuggestion[] = [];

    const defaultCoeffs = {
        steps: -1.0,
        hr: +15.0,
        stairs: +10.0,
        calories: -0.4
    };

    const coeffs = {
        steps: currentCoeffs?.steps_per_minute ?? defaultCoeffs.steps,
        hr: currentCoeffs?.hr_spike ?? defaultCoeffs.hr,
        stairs: currentCoeffs?.stairs ?? defaultCoeffs.stairs,
        calories: currentCoeffs?.calories ?? defaultCoeffs.calories
    };

    // 1. Tune Steps (Aerobic)
    // Find windows with high steps but low HR elevation and no stairs/carbs
    const stepWindows = windows.filter(w =>
        w.activity_steps > 1000 &&
        w.activity_heart_rate < 0.2 && // Low HR elevation
        w.carbs_consumed === 0 &&
        w.carb_absorption < 2
    );

    if (stepWindows.length >= 3) {
        let totalSteps = 0;
        let totalObservedNetDrop = 0;
        for (const w of stepWindows) {
            // Observed net drop (adjusted for insulin)
            const netDrop = (w.glucose_start - w.glucose_end) - (w.insulin_activity * 15); // Assume ISF 15 for rough normalization
            totalSteps += w.activity_steps;
            totalObservedNetDrop += netDrop;
        }
        const observedStepCoeff = (totalObservedNetDrop / totalSteps) * 1000; // per 1k steps
        const currentStepCoeff = coeffs.steps * 10; // Simple mapping for internal model

        const changePct = ((observedStepCoeff - currentStepCoeff) / Math.abs(currentStepCoeff)) * 100;
        if (Math.abs(changePct) > 20) {
            suggestions.push({
                parameter: 'activity_steps',
                currentValue: coeffs.steps,
                suggestedValue: Math.round(observedStepCoeff / 10 * 100) / 100,
                changePercentage: Math.round(changePct * 10) / 10,
                confidence: stepWindows.length > 8 ? 'high' : 'medium',
                reason: `Aerobic exercise (steps) shows a ${observedStepCoeff < currentStepCoeff ? 'stronger' : 'weaker'} glucose drop than expected.`,
                sampleCount: stepWindows.length
            });
        }
    }

    // 2. Tune HR Spikes (Anaerobic / Stress)
    const hrWindows = windows.filter(w =>
        w.activity_heart_rate > 0.4 && // Significant HR elevation
        w.activity_steps < 500 &&     // Low movement
        w.carbs_consumed === 0
    );

    if (hrWindows.length >= 3) {
        let totalHRElevation = 0;
        let totalObservedNetRise = 0;
        for (const w of hrWindows) {
            const netRise = (w.glucose_end - w.glucose_start) + (w.insulin_activity * 15);
            totalHRElevation += w.activity_heart_rate;
            totalObservedNetRise += netRise;
        }
        const observedHRCoeff = totalObservedNetRise / totalHRElevation;
        const changePct = ((observedHRCoeff - coeffs.hr) / Math.abs(coeffs.hr)) * 100;

        if (Math.abs(changePct) > 20) {
            suggestions.push({
                parameter: 'activity_hr',
                currentValue: coeffs.hr,
                suggestedValue: Math.round(observedHRCoeff * 10) / 10,
                changePercentage: Math.round(changePct * 10) / 10,
                confidence: hrWindows.length > 5 ? 'medium' : 'low',
                reason: `Heart rate spikes (stress/anaerobic) cause ${observedHRCoeff > 0 ? 'more' : 'less'} of a glucose rise than expected.`,
                sampleCount: hrWindows.length
            });
        }
    }

    return suggestions;
}

function tuneBasal(windows: ITimeWindow[], currentBasal: number): ITuningSuggestion | null {
    // Isolate stable overnight windows
    const nighttimeWindows = windows.filter(w =>
        (w.hour_of_day >= 0 && w.hour_of_day <= 5) &&
        w.insulin_activity < (w.basal_insulin_delivered + 0.2) &&
        w.carb_absorption < 1 &&
        w.activity_steps < 100
    );

    if (nighttimeWindows.length < 5) return null;

    const driftTotal = nighttimeWindows.reduce((sum, w) => sum + (w.glucose_end - w.glucose_start), 0);
    const avgDrift = driftTotal / nighttimeWindows.length;

    // If drifting up/down by > 10 mg/dL per hour on average
    if (Math.abs(avgDrift) < 10) return null;

    return {
        parameter: 'basal',
        currentValue: currentBasal,
        suggestedValue: Math.round((currentBasal + (avgDrift / 50)) * 100) / 100, // 1U roughly = 50 mg/dL drop
        changePercentage: Math.round((avgDrift / 50) / currentBasal * 1000) / 10,
        confidence: 'medium',
        reason: `Avg overnight drift of ${avgDrift.toFixed(1)} mg/dL observed over ${nighttimeWindows.length} windows.`,
        sampleCount: nighttimeWindows.length
    };
}
