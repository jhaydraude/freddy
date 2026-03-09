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
    /** Number of days to look back. Defaults to 30. */
    days?: number;
    /** Explicit start ISO datetime (overrides `days`). */
    start?: string;
    /** Explicit end ISO datetime. Defaults to now. */
    end?: string;
}

/** Resolve a TimeframeInput to concrete { startMs, endMs } epoch timestamps. */
export function resolveTimeframe(input: TimeframeInput = {}): { startMs: number; endMs: number } {
    const endMs = input.end ? new Date(input.end).getTime() : Date.now();
    const startMs = input.start
        ? new Date(input.start).getTime()
        : endMs - (input.days ?? 30) * 24 * 60 * 60 * 1000;
    return { startMs, endMs };
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
}

/** Fetch user context from UserPreference and SystemConfig. Falls back to defaults. */
export async function getUserContext(): Promise<UserContext> {
    try {
        const { UserPreference } = await import('../../../lib/db/models');

        const [unitsPref, tzPref, lowPref, highPref] = await Promise.all([
            // Settings page saves units as key 'units'
            UserPreference.findOne({ userId: 'default', key: 'units' }).lean(),
            UserPreference.findOne({ userId: 'default', key: 'timezone' }).lean(),
            // Thresholds are UserPreferences too (saved from the Settings UI)
            UserPreference.findOne({ userId: 'default', key: 'low_threshold' }).lean(),
            UserPreference.findOne({ userId: 'default', key: 'high_threshold' }).lean(),
        ]);

        const glucoseUnits: 'mg/dL' | 'mmol/L' = (unitsPref as any)?.value ?? 'mg/dL';
        const rawLow: number = (lowPref as any)?.value ?? 70;
        const rawHigh: number = (highPref as any)?.value ?? 180;
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
        };
    } catch {
        return {
            glucoseUnits: 'mg/dL',
            timezone: 'UTC',
            lowThreshold: 70,
            highThreshold: 180,
            lowThresholdMgdl: 70,
            highThresholdMgdl: 180,
        };
    }
}
