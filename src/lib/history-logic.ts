import { Entry, Treatment } from '../db/models.js';

/**
 * Aggregates glucose and treatment data for a specific time range.
 */
export async function getGraphData(startDate: string | Date, endDate: string | Date) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const [entries, treatments] = await Promise.all([
        Entry.find({
            date: { $gte: start.getTime(), $lte: end.getTime() }
        }).sort({ date: 1 }),
        Treatment.find({
            created_at: { $gte: start.toISOString(), $lte: end.toISOString() }
        }).sort({ created_at: 1 })
    ]);

    return {
        entries,
        treatments
    };
}
