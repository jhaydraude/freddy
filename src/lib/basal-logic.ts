import { Treatment } from '../db/models.js';
import { resolveActiveProfile, getProfileStore } from './profile-logic.js';

/**
 * Calculates the scheduled basal rate for a given time of day.
 * basalSchedule: Array of { time: "HH:mm", value: number }
 */
export function getBasalFromSchedule(basalSchedule: Array<{ time: string, value: number }>, date: Date): number {
    // Convert current time to "minutes from midnight"
    const minutes = date.getHours() * 60 + date.getMinutes();

    // Sort schedule by time (just in case)
    const sorted = [...basalSchedule].sort((a, b) => {
        const [aH, aM] = (a.time || "0:0").split(':').map(Number);
        const [bH, bM] = (b.time || "0:0").split(':').map(Number);
        return ((aH || 0) * 60 + (aM || 0)) - ((bH || 0) * 60 + (bM || 0));
    });

    // Find the last entry that is <= current minutes
    let activeRate = sorted[0]?.value || 0;
    for (const entry of sorted) {
        const [h, m] = (entry.time || "0:0").split(':').map(Number);
        const entryMinutes = (h || 0) * 60 + (m || 0);
        if (entryMinutes <= minutes) {
            activeRate = entry.value;
        } else {
            break;
        }
    }

    return activeRate;
}

/**
 * Service to get the current basal rate, accounting for active Temp Basals.
 */
export async function getBasalRate(timestamp: string | Date): Promise<number> {
    const date = new Date(timestamp);
    const profileInfo = await resolveActiveProfile(date);
    if (!profileInfo) return 0;

    const store = getProfileStore(profileInfo.doc, profileInfo.activeProfileName, profileInfo.profileData);
    if (!store) return 0;

    const scheduledRate = getBasalFromSchedule(store.basal, date);

    // Look for active Temp Basal in treatments
    // We look back 24 hours to be safe, though temp basals are usually short.
    const lookback = new Date(date.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const treatments = await Treatment.find({
        eventType: "Temp Basal",
        created_at: { $gte: lookback, $lte: date.toISOString() }
    }).sort({ created_at: -1 });

    for (const t of treatments) {
        const createdMs = new Date(t.created_at).getTime();
        const durationMs = (t.duration || 0) * 60 * 1000;
        const endMs = createdMs + durationMs;

        if (date.getTime() >= createdMs && date.getTime() < endMs) {
            // Found an active temp basal
            if (t.rate !== undefined) {
                return t.rate; // Absolute temp basal
            } else if (t.percent !== undefined) {
                // Percentage temp basal
                const adjusted = scheduledRate * (1 + (t.percent / 100));
                return Math.round(adjusted * 1000) / 1000;
            }
        }
    }

    return scheduledRate;
}
