import { Treatment } from '../db/models.js';
import { resolveActiveProfile, getProfileStore } from './profile-logic.js';

/**
 * Calculates Insulin on Board (IOB) for a set of treatments at a specific time.
 * Logic: Exponential decay based on DIA.
 */
export function calculateIOB(treatments: any[], atTime: Date, dia: number): number {
    const DIA_MINUTES = dia * 60;
    let totalIOB = 0;

    const nowMs = atTime.getTime();

    for (const t of treatments) {
        if (!t.insulin) continue;

        const treatmentTime = new Date(t.created_at).getTime();
        const agoMinutes = (nowMs - treatmentTime) / (1000 * 60);

        if (agoMinutes < 0) continue; // Future treatment?
        if (agoMinutes >= DIA_MINUTES) continue; // Fully absorbed

        // Simple exponential-style decay approximation: (1 - (t/DIA))^2
        // This is a common "good enough" approximation for active insulin.
        const activityRemaining = Math.pow(1 - (agoMinutes / DIA_MINUTES), 2);
        totalIOB += t.insulin * activityRemaining;
    }

    return Math.round(totalIOB * 100) / 100;
}

/**
 * Service to get IOB at a specific time.
 */
export async function getIOB(timestamp: string | Date): Promise<number> {
    const date = new Date(timestamp);
    const profileInfo = await resolveActiveProfile(date);
    if (!profileInfo) return 0;

    const store = getProfileStore(profileInfo.doc, profileInfo.activeProfileName, profileInfo.profileData);
    if (!store) return 0;

    const diaMs = store.dia * 60 * 60 * 1000;
    const treatments = await Treatment.find({
        created_at: { $lte: date.toISOString(), $gte: new Date(date.getTime() - diaMs).toISOString() }
    });

    return calculateIOB(treatments, date, store.dia);
}
