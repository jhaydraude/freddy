/**
 * tools.ts
 *
 * Agent tool definitions using Vercel AI SDK's `tool()` helper.
 * Each tool wraps existing Freddy logic functions and returns aggregated
 * summaries — never raw document dumps — to minimise data sent to the LLM.
 */

import { tool } from 'ai';
import { z } from 'zod';

import { resolveTimeframe, getUserContext, ALLOWED_COLLECTIONS, type AllowedCollection } from './data-catalog';
import { getStatus } from '../status-logic';
import { getGlucosePrediction } from '../prediction-logic';
import { calculateStatistics, calculateTDDStatistics, calculateCarbStatistics, calculateActivityStatistics } from '../statistics-logic';
import { resolveActiveProfile, getProfileStore } from '../profile-logic';
import { Entry, Treatment } from '../../db/models';

/** Convert a raw mg/dL SGV to the user's display units. */
const sgvToDisplay = (sgv: number, units: 'mg/dL' | 'mmol/L'): number =>
    units === 'mmol/L' ? Math.round((sgv / 18.018) * 10) / 10 : Math.round(sgv);

// ---------------------------------------------------------------------------
// Shared timeframe schema
// ---------------------------------------------------------------------------

const timeframeSchema = z.object({
    days: z.number().int().min(1).max(365).optional().describe('Number of days to look back (default: 30).'),
    start: z.string().optional().describe('ISO datetime for the start of the period (overrides days).'),
    end: z.string().optional().describe('ISO datetime for the end of the period (default: now).'),
});

// ---------------------------------------------------------------------------
// Tool: analyze_glucose
// ---------------------------------------------------------------------------

const analyzeGlucoseParams = z.object({
    analysis_type: z.enum(['stats', 'history', 'status', 'prediction']).describe(
        'Type of analysis: "stats" for summary statistics, "history" for hour-by-hour pattern, "status" for current live reading, "prediction" for 4-hour forecast.'
    ),
    timeframe: timeframeSchema.optional().describe('Time period for stats and history analyses.'),
    hour_start: z.number().int().min(0).max(23).optional().describe('For stats/history: filter readings from this hour (0-23), e.g. 6 for 6 AM.'),
    hour_end: z.number().int().min(0).max(23).optional().describe('For stats/history: filter readings up to this hour (0-23), e.g. 10 for 10 AM.'),
});

export const analyzeGlucoseTool = tool({
    description: `Analyse blood glucose data. Use for any question about glucose levels, trends, time-in-range, HbA1c, variability, morning/night patterns, or the current/predicted value.`,
    inputSchema: analyzeGlucoseParams,
    execute: async (args: z.infer<typeof analyzeGlucoseParams>) => {
        const { analysis_type, timeframe, hour_start, hour_end } = args;
        const ctx = await getUserContext();

        if (analysis_type === 'status') {
            const status = await getStatus(new Date());
            const g = status.glucose?.current;
            const rawSgv = g?.sgv;
            return {
                glucose: rawSgv != null ? sgvToDisplay(rawSgv, ctx.glucoseUnits) : undefined,
                units: ctx.glucoseUnits,
                direction: g?.direction,
                rate_of_change_per_min: ctx.glucoseUnits === 'mmol/L' && g?.rateOfChange != null
                    ? Math.round((g.rateOfChange / 18.018) * 100) / 100
                    : g?.rateOfChange,
                iob_total: status.iob?.calculated?.totalIOB,
                cob_total: status.cob?.calculated?.cob,
                sensor_age_hours: status.glucose?.sensor?.age,
            };
        }

        if (analysis_type === 'prediction') {
            const prediction = await getGlucosePrediction(new Date(), 240);
            if (!prediction.length) return { error: 'Prediction unavailable — prediction service may be offline.' };
            const sgvs = prediction.map((p: any) => p.sgv as number);
            return {
                current_sgv: sgvToDisplay(prediction[0]?.sgv, ctx.glucoseUnits),
                min_predicted: sgvToDisplay(Math.min(...sgvs), ctx.glucoseUnits),
                max_predicted: sgvToDisplay(Math.max(...sgvs), ctx.glucoseUnits),
                eventual_sgv: sgvToDisplay(prediction[prediction.length - 1]?.sgv, ctx.glucoseUnits),
                units: ctx.glucoseUnits,
                horizon_minutes: 240,
            };
        }

        const { startMs, endMs } = resolveTimeframe(timeframe);

        // Hour-of-day filter helper
        const fmt = Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: ctx.timezone });
        const inHourWindow = (epochMs: number) => {
            if (hour_start === undefined && hour_end === undefined) return true;
            const h = parseInt(fmt.format(new Date(epochMs)), 10);
            return h >= (hour_start ?? 0) && h <= (hour_end ?? 23);
        };

        let entries = await Entry.find({
            date: { $gte: startMs, $lte: endMs },
            sgv: { $exists: true, $gt: 0 },
            type: 'sgv',
        }).lean() as Array<{ sgv: number; date: number }>;

        entries = entries.filter(e => inHourWindow(e.date));

        if (!entries.length) return { error: 'No glucose readings found for the specified period/time filter.' };

        if (analysis_type === 'history') {
            const hourBuckets: Record<number, number[]> = {};
            for (const e of entries) {
                const h = parseInt(fmt.format(new Date(e.date)), 10);
                if (!hourBuckets[h]) hourBuckets[h] = [];
                hourBuckets[h].push(e.sgv); // store raw mg/dL; convert at output
            }
            const pct = (arr: number[], p: number) => {
                const s = [...arr].sort((a, b) => a - b);
                return s[Math.floor(s.length * p / 100)] ?? 0;
            };
            const hourly = Object.entries(hourBuckets).map(([h, vals]) => ({
                hour: parseInt(h, 10),
                p25: sgvToDisplay(pct(vals, 25), ctx.glucoseUnits),
                median: sgvToDisplay(pct(vals, 50), ctx.glucoseUnits),
                p75: sgvToDisplay(pct(vals, 75), ctx.glucoseUnits),
                count: vals.length,
            })).sort((a, b) => a.hour - b.hour);
            return { hourly_medians: hourly, units: ctx.glucoseUnits, days_analysed: Math.round((endMs - startMs) / 86400000) };
        }

        // analysis_type === 'stats'
        const stats = calculateStatistics(entries, ctx.lowThreshold, ctx.highThreshold, ctx.glucoseUnits, ctx.timezone);
        return {
            mean: stats.statistics.mean,
            median: stats.statistics.median,
            std_dev: stats.statistics.stdDev,
            cv_percent: stats.statistics.cv,
            hba1c_estimate: stats.statistics.hba1c,
            time_in_range_percent: stats.timeInRange?.inRange,
            time_high_percent: stats.timeInRange?.high,
            time_low_percent: stats.timeInRange?.low,
            total_readings: stats.timeInRange?.totalReadings,
            units: ctx.glucoseUnits,
            period_start: new Date(startMs).toISOString(),
            period_end: new Date(endMs).toISOString(),
            ...(hour_start !== undefined ? { hour_filter: `${hour_start}:00 – ${hour_end ?? 23}:59` } : {}),
        };
    },
});

// ---------------------------------------------------------------------------
// Tool: analyze_treatments
// ---------------------------------------------------------------------------

const analyzeTreatmentsParams = z.object({
    category: z.enum(['insulin', 'carbs', 'profile']).describe('What treatment data to analyse: insulin TDD, carb intake, or the active profile settings.'),
    timeframe: timeframeSchema.optional(),
});

export const analyzeTreatmentsTool = tool({
    description: `Analyse insulin, carb, and profile data. Use for questions about Total Daily Dose, basal/bolus split, daily carb averages, or the active ISF/ICR/basal schedule.`,
    inputSchema: analyzeTreatmentsParams,
    execute: async (args: z.infer<typeof analyzeTreatmentsParams>) => {
        const { category, timeframe } = args;
        const ctx = await getUserContext();

        if (category === 'profile') {
            const profile = await resolveActiveProfile(new Date());
            if (!profile) return { error: 'No active profile found.' };
            const store = getProfileStore(profile.doc, profile.activeProfileName, profile.profileData);
            if (!store) return { error: 'Could not read profile store.' };
            return {
                profile_name: profile.activeProfileName,
                dia_hours: store.dia,
                units: ctx.glucoseUnits,
                isf_schedule: (store.sens ?? []).map((s: any) => ({ time: s.time, value: s.value })),
                icr_schedule: (store.carbratio ?? []).map((c: any) => ({ time: c.time, value: c.value })),
                basal_schedule: (store.basal ?? []).map((b: any) => ({ time: b.time, rate_u_hr: b.value })),
                low_target: store.target_low?.[0]?.value,
                high_target: store.target_high?.[0]?.value,
            };
        }

        const { startMs, endMs } = resolveTimeframe(timeframe);
        const startIso = new Date(startMs).toISOString();
        const endIso = new Date(endMs).toISOString();
        const periodDays = Math.round((endMs - startMs) / 86400000);

        if (category === 'insulin') {
            const boluses = await Treatment.find({
                eventType: { $in: ['Meal Bolus', 'Correction Bolus', 'Bolus'] },
                created_at: { $gte: startIso, $lte: endIso },
                insulin: { $gt: 0 },
            }).lean();

            // Use the same calculateBasalSummary that the statistics page uses —
            // this handles temp basals, percent adjustments, and profile gaps correctly.
            const { calculateBasalSummary } = await import('../iob-basal');
            const basals = await calculateBasalSummary(new Date(startMs), new Date(endMs));

            const tddStats = calculateTDDStatistics(boluses, basals, ctx.timezone);
            const ds = tddStats.dailySeries;
            const avgBolus = ds.length ? ds.reduce((s: number, d: any) => s + d.bolus, 0) / ds.length : 0;
            const avgBasal = ds.length ? ds.reduce((s: number, d: any) => s + d.basal, 0) / ds.length : 0;
            const overallMedianTDD = tddStats.stats.overall.median;

            return {
                median_tdd: overallMedianTDD,
                avg_bolus_per_day: parseFloat(avgBolus.toFixed(1)),
                avg_basal_per_day: parseFloat(avgBasal.toFixed(1)),
                bolus_basal_split_percent: overallMedianTDD > 0 ? {
                    bolus: Math.round((avgBolus / overallMedianTDD) * 100),
                    basal: Math.round((avgBasal / overallMedianTDD) * 100),
                } : null,
                weekday_median_tdd: tddStats.stats.weekdays.median,
                weekend_median_tdd: tddStats.stats.weekends.median,
                period_days: periodDays,
            };
        }

        // category === 'carbs'
        const carbTreatments = await Treatment.find({
            carbs: { $gt: 0 },
            created_at: { $gte: startIso, $lte: endIso },
        }).lean();

        const carbStats = calculateCarbStatistics(carbTreatments, periodDays, ctx.timezone);
        if (!carbStats) return { error: 'No carb entries found in this period.' };

        // carbStats: { dailySeries, stats: { overall, weekdays, weekends, totalCarbs, avgDailyCarbs } }
        return {
            avg_daily_carbs: carbStats.stats.avgDailyCarbs,
            total_carbs: carbStats.stats.totalCarbs,
            weekday_median_carbs: carbStats.stats.weekdays.median,
            weekend_median_carbs: carbStats.stats.weekends.median,
            total_carb_entries: carbTreatments.length,
            period_days: periodDays,
        };
    },
});

// ---------------------------------------------------------------------------
// Tool: analyze_activities
// ---------------------------------------------------------------------------

const analyzeActivitiesParams = z.object({
    timeframe: timeframeSchema.optional(),
});

export const analyzeActivitiesTool = tool({
    description: `Analyse physical activity data: step counts and heart rate. Use for questions about daily steps, heart rate trends, or exercise patterns.`,
    inputSchema: analyzeActivitiesParams,
    execute: async (args: z.infer<typeof analyzeActivitiesParams>) => {
        const { timeframe } = args;
        const ctx = await getUserContext();
        const { startMs, endMs } = resolveTimeframe(timeframe);
        const rangeDays = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)));

        // Query type:'activity' exactly as the statistics page does
        const activityEntries = await Entry.find({
            date: { $gte: startMs, $lte: endMs },
            type: 'activity',
            stale: { $ne: true },
        }).select('date timestamp created_at steps heartrate').lean() as Array<{ heartrate?: number; steps?: number; date: number }>;

        if (!activityEntries.length) return { error: 'No activity data found in this period.' };

        const actStats = calculateActivityStatistics(activityEntries, rangeDays, ctx.timezone);
        if (!actStats) return { error: 'Could not compute activity statistics.' };

        return {
            avg_daily_steps: actStats.stats.avgDailySteps,
            total_steps: actStats.stats.totalSteps,
            median_heart_rate: actStats.stats.heartRate.median,
            max_heart_rate: actStats.stats.heartRate.max,
            period_days: rangeDays,
        };
    },
});

// ---------------------------------------------------------------------------
// Tool: query_data
// ---------------------------------------------------------------------------

const queryDataParams = z.object({
    collection: z.enum(ALLOWED_COLLECTIONS as unknown as [string, ...string[]]).describe(
        `Which collection to query. Options: ${ALLOWED_COLLECTIONS.join(', ')}.`
    ),
    metric: z.enum(['count', 'sum', 'avg', 'min', 'max']).describe('Aggregation to apply to the field.'),
    field: z.string().describe('Field to aggregate, e.g. "sgv", "insulin", "carbs", "steps", "heartrate".'),
    filter: z.object({
        field_gt: z.number().optional().describe('Filter: field must be greater than this value.'),
        field_lt: z.number().optional().describe('Filter: field must be less than this value.'),
    }).optional().describe('Optional numeric filter on the target field.'),
    timeframe: timeframeSchema.optional(),
    group_by: z.enum(['hour', 'day', 'weekday']).optional().describe('Optional grouping dimension.'),
});

export const queryDataTool = tool({
    description: `Ad-hoc structured data query for questions the other tools don't cover, e.g. "How many times did I go below 55 mg/dL?" or "What was my highest glucose reading this week?". Builds a safe MongoDB aggregation from constrained parameters. IMPORTANT: The 'sgv' field in the database is always stored in mg/dL. When filtering on sgv, always use mg/dL values regardless of the user's display units (convert mmol/L to mg/dL by multiplying by 18).`,
    inputSchema: queryDataParams,
    execute: async (args: z.infer<typeof queryDataParams>) => {
        const { collection, metric, field, filter, timeframe, group_by } = args;
        const ctx = await getUserContext();
        const { startMs, endMs } = resolveTimeframe(timeframe);

        const isEntries = collection === 'entries';
        const dateField = isEntries ? 'date' : 'created_at';
        const dateFilter = isEntries
            ? { $gte: startMs, $lte: endMs }
            : { $gte: new Date(startMs).toISOString(), $lte: new Date(endMs).toISOString() };

        const matchStage: Record<string, any> = { [dateField]: dateFilter };
        if (filter?.field_gt !== undefined) matchStage[field] = { ...matchStage[field], $gt: filter.field_gt };
        if (filter?.field_lt !== undefined) matchStage[field] = { ...matchStage[field], $lt: filter.field_lt };

        const Model = await getModelForCollection(collection as AllowedCollection);
        const pipeline: any[] = [{ $match: matchStage }];

        if (group_by) {
            const groupId = buildGroupId(group_by, dateField, collection as AllowedCollection, ctx.timezone);
            pipeline.push({ $group: { _id: groupId, value: buildAggregateOp(metric, field) } });
            pipeline.push({ $sort: { _id: 1 } });
            const results = await Model.aggregate(pipeline);
            return {
                grouped_results: results.slice(0, 100),
                metric,
                field,
                units: field === 'sgv' ? ctx.glucoseUnits : undefined,
            };
        }

        pipeline.push({ $group: { _id: null, value: buildAggregateOp(metric, field) } });
        const result = await Model.aggregate(pipeline);
        return {
            value: result[0]?.value ?? 0,
            metric,
            field,
            period_start: new Date(startMs).toISOString(),
            period_end: new Date(endMs).toISOString(),
            units: field === 'sgv' ? ctx.glucoseUnits : undefined,
        };
    },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getModelForCollection(collection: AllowedCollection) {
    const { Entry, Treatment, ActivityRecord } = await import('../../db/models');
    const map: Record<AllowedCollection, any> = { entries: Entry, treatments: Treatment, activity_records: ActivityRecord };
    return map[collection];
}

function buildGroupId(group_by: string, dateField: string, collection: AllowedCollection, timezone: string) {
    const dateExpr = collection === 'entries' ? { $toDate: `$${dateField}` } : `$${dateField}`;
    if (group_by === 'hour') return { $hour: { date: dateExpr, timezone } };
    if (group_by === 'day') return { $dateToString: { format: '%Y-%m-%d', date: dateExpr, timezone } };
    if (group_by === 'weekday') return { $dayOfWeek: { date: dateExpr, timezone } };
    return null;
}

function buildAggregateOp(metric: string, field: string) {
    const ops: Record<string, any> = {
        count: { $sum: 1 },
        sum: { $sum: `$${field}` },
        avg: { $avg: `$${field}` },
        min: { $min: `$${field}` },
        max: { $max: `$${field}` },
    };
    return ops[metric] ?? { $sum: 1 };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const agentTools = {
    analyze_glucose: analyzeGlucoseTool,
    analyze_treatments: analyzeTreatmentsTool,
    analyze_activities: analyzeActivitiesTool,
    query_data: queryDataTool,
};
