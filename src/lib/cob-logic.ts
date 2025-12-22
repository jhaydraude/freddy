import { Treatment } from '../db/models.js';

/**
 * Calculates Carbs on Board (COB) for a set of treatments at a specific time.
 * Logic: Linear absorption (standard is ~30g/hr or 0.5g/min).
 */
export function calculateCOB(treatments: any[], atTime: Date, absorptionRate: number = 30): number {
    let totalCOB = 0;
    const nowMs = atTime.getTime();

    for (const t of treatments) {
        if (!t.carbs) continue;

        const treatmentTime = new Date(t.created_at).getTime();
        const agoMinutes = (nowMs - treatmentTime) / (1000 * 60);

        if (agoMinutes < 0) continue;

        const carbsAbsorbed = (agoMinutes / 60) * absorptionRate;
        const remaining = t.carbs - carbsAbsorbed;

        if (remaining > 0) {
            totalCOB += remaining;
        }
    }

    return Math.round(totalCOB * 10) / 10;
}

/**
 * Service to get COB at a specific time.
 */
export async function getCOB(timestamp: string | Date): Promise<number> {
    const date = new Date(timestamp);
    // Fetch treatments for the last 12 hours (standard COB window)
    const treatments = await Treatment.find({
        created_at: { $lte: date.toISOString(), $gte: new Date(date.getTime() - 12 * 60 * 60 * 1000).toISOString() }
    });

    return calculateCOB(treatments, date);
}
