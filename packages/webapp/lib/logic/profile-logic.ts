import { Profile, Treatment } from '../db/models';
import type { IProfile, IProfileStore } from '../db/models';

// Simple cache to prevent excessive DB calls during bulk processing
const profileCache = new Map<string, any>();

/**
 * Resolves the active profile information (document and specific store name) at a specific timestamp.
 */
export async function resolveActiveProfile(timestamp: string | Date): Promise<{ doc: IProfile | null, activeProfileName: string, profileData: IProfileStore | null, expiration?: string | undefined } | null> {
    const targetDate = new Date(timestamp);
    const targetIso = targetDate.toISOString();

    // Check cache for this exact minute (profiles rarely change more frequently)
    const cacheKey = targetIso.substring(0, 16); // YYYY-MM-DDTHH:mm
    if (profileCache.has(cacheKey)) {
        return profileCache.get(cacheKey);
    }

    // 1. Get the base profile document (fallback)
    const baseDoc = await Profile.findOne({
        startDate: { $lte: targetIso }
    }).sort({ startDate: -1 });

    // 2. Fetch all Profile Switch treatments to find the active override
    // We look back at least 24 hours plus some buffer or all of them if needed.
    // Optimally, we want switches that could still be active.
    const switches = await Treatment.find({
        eventType: "Profile Switch"
    }).sort({ created_at: -1 }).limit(50); // Most recent 50 should be plenty

    let activeSwitch: any = null;
    let activeEndMs: number = Infinity;

    for (const s of switches) {
        const createdMs = new Date(s.created_at).getTime();

        // Normalize timeshift (delay). If > 10000, it's likely ms.
        let shiftMs = (s.timeshift || 0);
        if (shiftMs > 10000) {
            // Already in ms
        } else {
            shiftMs = shiftMs * 60 * 1000; // Convert minutes to ms
        }

        const startMs = createdMs + shiftMs;

        // Normalize duration. 
        let durationMs = (s.duration || s.originalDuration || 0);
        if (durationMs > 100000) { // e.g. 2 minutes = 120,000ms
            // Already in ms
        } else if (durationMs > 0) {
            durationMs = durationMs * 60 * 1000; // Convert minutes to ms
        }

        const endMs = durationMs > 0 ? startMs + durationMs : Infinity;

        if (targetDate.getTime() >= startMs && targetDate.getTime() < endMs) {
            activeSwitch = s;
            activeEndMs = endMs;
            break;
        }
    }

    if (activeSwitch) {
        let profileData: IProfileStore | undefined;

        // 1. Get the base data for the switch
        if (activeSwitch.profileJson) {
            try {
                profileData = JSON.parse(activeSwitch.profileJson);
            } catch (e) {
                console.error("Failed to parse profileJson", e);
            }
        } else if (baseDoc) {
            const name = activeSwitch.profile || baseDoc.defaultProfile;
            const store = baseDoc.store instanceof Map ? baseDoc.store.get(name) : (baseDoc.store as any)[name];
            if (store) {
                profileData = JSON.parse(JSON.stringify(store)); // Deep copy
            }
        }

        // 2. Apply Percentage Adjustments
        const percentage = activeSwitch.percentage;
        if (profileData && percentage !== undefined && percentage !== 100 && percentage > 0) {
            const factor = percentage / 100;

            // Basal: Multiply by factor
            if (profileData.basal) {
                profileData.basal = profileData.basal.map(b => ({
                    ...b,
                    value: Math.round(b.value * factor * 1000) / 1000
                }));
            }

            // ISF (sens): Divide by factor
            if (profileData.sens) {
                profileData.sens = profileData.sens.map(s => ({
                    ...s,
                    value: Math.round((s.value / factor) * 100) / 100
                }));
            }

            // I:C (carbratio): Divide by factor
            if (profileData.carbratio) {
                profileData.carbratio = profileData.carbratio.map(c => ({
                    ...c,
                    value: Math.round((c.value / factor) * 100) / 100
                }));
            }
        }

        if (profileData || baseDoc) {
            const result = {
                activeProfileName: activeSwitch.profile || "Overridden",
                profileData: profileData || null,
                doc: baseDoc || null,
                expiration: activeEndMs !== Infinity ? new Date(activeEndMs).toISOString() : undefined
            };
            profileCache.set(cacheKey, result);
            return result;
        }
    }

    if (!baseDoc) return null;

    const result = {
        doc: baseDoc,
        activeProfileName: baseDoc.defaultProfile,
        profileData: null
    };
    profileCache.set(cacheKey, result);
    return result;
}

/**
 * Clears the profile cache. Should be called when a profile is updated or tuning is applied.
 */
export function clearProfileCache(): void {
    profileCache.clear();
}

/**
 * Legacy wrapper: Finds the profile document active at a specific timestamp.
 */
export async function getProfileAtTime(timestamp: string | Date): Promise<IProfile | null> {
    const result = await resolveActiveProfile(timestamp);
    return result?.doc || null;
}

/**
 * Extracts the specific profile store (e.g., 'Standard', 'Default') from a Profile document.
 * If data is already provided (e.g. from profileJSON), it returns that.
 */
export function getProfileStore(profileDoc?: IProfile, profileName?: string, providedData?: IProfileStore): IProfileStore | null {
    if (providedData) return providedData;
    if (!profileDoc) return null;

    const name = profileName || profileDoc.defaultProfile;
    // Mongoose Map access
    let store = profileDoc.store instanceof Map ? profileDoc.store.get(name) : (profileDoc.store as any)[name];

    // Fallback to default if named store not found
    if (!store && profileName && profileName !== profileDoc.defaultProfile) {
        const defaultName = profileDoc.defaultProfile;
        store = profileDoc.store instanceof Map ? profileDoc.store.get(defaultName) : (profileDoc.store as any)[defaultName];
    }

    return store || null;
}

/**
 * Gets the active value from a time-based schedule (ISF, CR, etc.) at a specific time of day.
 * schedule: Array of { time: "HH:mm", value: number }
 */
export function getValueAtTime(schedule: Array<{ time: string, value: number }>, date: Date): number {
    if (!schedule || schedule.length === 0) return 0;

    // Convert current time to "minutes from midnight"
    const minutes = date.getHours() * 60 + date.getMinutes();

    // Sort schedule by time
    const sorted = [...schedule].sort((a, b) => {
        const [aH, aM] = (a.time || "0:0").split(':').map(Number);
        const [bH, bM] = (b.time || "0:0").split(':').map(Number);
        return ((aH || 0) * 60 + (aM || 0)) - ((bH || 0) * 60 + (bM || 0));
    });

    // Find the last entry that is <= current minutes
    let activeValue = sorted[0]?.value || 0;
    for (const entry of sorted) {
        const [h, m] = (entry.time || "0:0").split(':').map(Number);
        const entryMinutes = (h || 0) * 60 + (m || 0);
        if (entryMinutes <= minutes) {
            activeValue = entry.value;
        } else {
            break;
        }
    }

    return activeValue;
}
