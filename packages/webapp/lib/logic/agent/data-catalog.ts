/**
 * data-catalog.ts
 *
 * Structured metadata describing the Freddy/Nightscout data model.
 * Used to build accurate tool descriptions and validate query_data parameters.
 * Not a runtime dependency — tooling and the agent system prompt reference this.
 */

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

export interface TimeframeInput {
    /** Number of days to look back. */
    days?: number;
    /** Number of hours to look back (can be used instead of or with days). */
    hours?: number;
    /** Explicit start ISO datetime (overrides `days`/`hours`). */
    start?: string;
    /** Explicit end ISO datetime. Defaults to now. */
    end?: string;
}

/** Resolve a TimeframeInput to concrete { startMs, endMs } epoch timestamps. */
export function resolveTimeframe(input: TimeframeInput = {}): { startMs: number; endMs: number } {
    const endMs = input.end ? new Date(input.end).getTime() : Date.now();
    
    let lookbackMs = 0;
    if (input.start) {
        return { startMs: new Date(input.start).getTime(), endMs };
    }
    
    if (input.days != null) lookbackMs += input.days * 24 * 60 * 60 * 1000;
    if (input.hours != null) lookbackMs += input.hours * 60 * 60 * 1000;
    
    // Default to 30 days if nothing provided
    if (lookbackMs === 0) lookbackMs = 30 * 24 * 60 * 60 * 1000;

    return { startMs: endMs - lookbackMs, endMs };
}

// ---------------------------------------------------------------------------
// Allowed collections for query_data
// ---------------------------------------------------------------------------

/** Collections the agent is allowed to query via query_data. */
export const ALLOWED_COLLECTIONS = ['entries', 'treatments', 'activity_records'] as const;
export type AllowedCollection = typeof ALLOWED_COLLECTIONS[number];

/** Human-readable descriptions injected into tool schemas. */
export const COLLECTION_DESCRIPTIONS: Record<AllowedCollection, string> = {
    entries: 'Blood glucose readings (SGV), sensor heartrate, and step counts from the CGM device.',
    treatments: 'Insulin boluses, carb entries, temp basals, profile switches, and other Nightscout treatments.',
    activity_records: 'Structured activity records (workouts, steps sessions) synced from health apps.',
};

/** Fields available for filtering per collection. */
export const COLLECTION_FIELDS: Record<AllowedCollection, string[]> = {
    entries: ['sgv', 'date', 'dateString', 'direction', 'heartrate', 'steps', 'type'],
    treatments: ['eventType', 'insulin', 'carbs', 'created_at', 'duration', 'rate', 'notes'],
    activity_records: ['type', 'startTime', 'endTime', 'data.steps', 'data.heartRate'],
};

/** Valid eventType values for the treatments collection. */
export const TREATMENT_EVENT_TYPES = [
    'Meal Bolus',
    'Correction Bolus',
    'Carb Correction',
    'Temp Basal',
    'Profile Switch',
    'Site Change',
    'Sensor Start',
    'Note',
] as const;

// ---------------------------------------------------------------------------
// User context shape (injected into system prompt at runtime)
// ---------------------------------------------------------------------------

export interface UserContext {
    glucoseUnits: 'mg/dL' | 'mmol/L';
    timezone: string;
    /** Always in the user's display units (mg/dL or mmol/L) — ready to pass to calculateStatistics */
    lowThreshold: number;
    highThreshold: number;
    /** Always mg/dL — for raw SGV comparisons/conversions */
    lowThresholdMgdl: number;
    highThresholdMgdl: number;
    /** Threshold in units for what constitutes a Super Micro Bolus (SMB) vs a normal bolus */
    smbThreshold: number;
}

/** Fetch user context from UserPreference and SystemConfig. Falls back to defaults. */
export async function getUserContext(): Promise<UserContext> {
    try {
        const { UserPreference } = await import('../../../lib/db/models');

        const [unitsPref, tzPref, lowPref, highPref, smbPref] = await Promise.all([
            // Settings page saves units as key 'units'
            UserPreference.findOne({ userId: 'default', key: 'units' }).lean(),
            UserPreference.findOne({ userId: 'default', key: 'timezone' }).lean(),
            // Thresholds are UserPreferences too (saved from the Settings UI)
            UserPreference.findOne({ userId: 'default', key: 'low_threshold' }).lean(),
            UserPreference.findOne({ userId: 'default', key: 'high_threshold' }).lean(),
            UserPreference.findOne({ userId: 'default', key: 'smb_threshold' }).lean(),
        ]);

        const glucoseUnits: 'mg/dL' | 'mmol/L' = (unitsPref as any)?.value ?? 'mg/dL';
        const rawLow: number = (lowPref as any)?.value ?? 70;
        const rawHigh: number = (highPref as any)?.value ?? 180;
        const rawSmb: number = parseFloat((smbPref as any)?.value) || 0.5; // Default to 0.5 U if not set
        const isMmol = glucoseUnits === 'mmol/L';

        return {
            glucoseUnits,
            timezone: (tzPref as any)?.value ?? 'UTC',
            // Thresholds provided by the user are already in their display units
            lowThreshold: rawLow,
            highThreshold: rawHigh,
            // Calculate mg/dL equivalent for internal DB filtering if user is in mmol/L
            lowThresholdMgdl: isMmol ? Math.round(rawLow * 18.018) : rawLow,
            highThresholdMgdl: isMmol ? Math.round(rawHigh * 18.018) : rawHigh,
            smbThreshold: rawSmb,
        };
    } catch {
        return {
            glucoseUnits: 'mg/dL',
            timezone: 'UTC',
            lowThreshold: 70,
            highThreshold: 180,
            lowThresholdMgdl: 70,
            highThresholdMgdl: 180,
            smbThreshold: 0.5,
        };
    }
}
