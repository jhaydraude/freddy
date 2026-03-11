/**
 * tools.ts
 *
 * Agent tool definitions using Vercel AI SDK's `tool()` helper.
 * Each tool wraps existing Freddy logic functions and returns aggregated
 * summaries — never raw document dumps — to minimise data sent to the LLM.
 */

import { tool } from 'ai';
import { z } from 'zod';

// --- Global Configuration ---
export const MAX_CHART_POINTS = 144; // 1 point per 5 mins for 12 hours
export const MAX_TOOL_RETRIES = 3;   // Maximum attempts for a single tool before reporting failure

import { resolveTimeframe, getUserContext, ALLOWED_COLLECTIONS, type AllowedCollection } from './data-catalog';
import { getStatus } from '../status-logic';
import { getGlucosePrediction } from '../prediction-logic';
import { calculateStatistics, calculateTDDStatistics, calculateCarbStatistics, calculateActivityStatistics } from '../statistics-logic';
import { resolveActiveProfile, getProfileStore } from '../profile-logic';
import { Entry, Treatment, ComputedStatus } from '../../db/models';
import { attributeGlucoseChange } from '../attribution-logic';

/** Convert a raw mg/dL SGV to the user's display units. */
const sgvToDisplay = (sgv: number, units: 'mg/dL' | 'mmol/L'): number =>
    units === 'mmol/L' ? Math.round((sgv / 18.018) * 10) / 10 : Math.round(sgv);

// ---------------------------------------------------------------------------
// Shared timeframe schema
// ---------------------------------------------------------------------------

const timeframeSchema = z.object({
    days: z.number().min(0.01).max(365).optional().describe('Number of days to look back (default: 30). Fractional days allowed.'),
    hours: z.number().min(0.1).max(8760).optional().describe('Number of hours to look back.'),
    start: z.string().optional().describe('ISO datetime for the start of the period (overrides days/hours). If no timezone is provided, the user\'s local timezone is assumed.'),
    end: z.string().optional().describe('ISO datetime for the end of the period (default: now). If no timezone is provided, the user\'s local timezone is assumed.'),
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
    description: `Analyse blood glucose trends (AGP, stats, forecasts). Use for questions about TIR, averages, variability, or predicted glucose. Note: All glucose values and thresholds for this tool use mg/dL units.`,
    inputSchema: analyzeGlucoseParams,
    execute: async (args: z.infer<typeof analyzeGlucoseParams>) => {
        try {
            const { analysis_type, timeframe, hour_start, hour_end } = args;
            const ctx = await getUserContext();

            if (analysis_type === 'status') {
                const status = await getStatus(new Date());
                const g = status.glucose?.current;
                // getStatus/getGlucose returns values in User Units. 
                // We need to ensure analyze_glucose returns mg/dL as per requirements.
                const mgdlSgv = (ctx.glucoseUnits === 'mmol/L' && g?.sgv != null) 
                    ? Math.round(g.sgv * 18.018) 
                    : g?.sgv;

                return {
                    glucose: mgdlSgv, 
                    units: 'mg/dL',
                    direction: g?.direction,
                    rate_of_change_per_min: g?.rateOfChange, // Note: this might also be in user units from getStatus
                    sensor_age_hours: status.glucose?.sensor?.age,
                };
            }

            if (analysis_type === 'prediction') {
                const prediction = await getGlucosePrediction(new Date(), 240);
                if (!prediction.length) return { error: 'Prediction unavailable — prediction service may be offline.' };
                const sgvs = prediction.map((p: any) => p.sgv as number);
                return {
                    current_sgv: prediction[0]?.sgv,
                    min_predicted: Math.min(...sgvs),
                    max_predicted: Math.max(...sgvs),
                    eventual_sgv: prediction[prediction.length - 1]?.sgv,
                    units: 'mg/dL',
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

            entries = entries.filter((e: any) => inHourWindow(e.date));

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
                    p5: pct(vals, 5),
                    p25: pct(vals, 25),
                    median: pct(vals, 50),
                    p75: pct(vals, 75),
                    p95: pct(vals, 95),
                    count: vals.length,
                })).sort((a, b) => a.hour - b.hour);
                return { hourly_medians: hourly, units: 'mg/dL', days_analysed: Math.round((endMs - startMs) / 86400000) };
            }

            // analysis_type === 'stats'
            // Use mg/dL thresholds and force mg/dL output
            const stats = calculateStatistics(entries, ctx.lowThresholdMgdl, ctx.highThresholdMgdl, 'mg/dL', ctx.timezone, true);
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
                units: 'mg/dL',
                period_start: new Date(startMs).toISOString(),
                period_end: new Date(endMs).toISOString(),
                ...(hour_start !== undefined ? { hour_filter: `${hour_start}:00 – ${hour_end ?? 23}:59` } : {}),
            };
        } catch (err: any) {
            console.error('[analyze_glucose] execution failed:', err);
            return { error: err.message || String(err) };
        }
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
        try {
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
                    daily_series: ds.map((d: any) => ({ date: d.date, total: d.total, basal: d.basal, bolus: d.bolus })),
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
                daily_series: carbStats.dailySeries.map((d: any) => ({ date: d.date, carbs: d.carbs })),
                total_carb_entries: carbTreatments.length,
                period_days: periodDays,
            };
        } catch (err: any) {
            console.error('[analyze_treatments] execution failed:', err);
            return { error: err.message || String(err) };
        }
    },
});

// ---------------------------------------------------------------------------
// Tool: analyze_status
// ---------------------------------------------------------------------------

const analyzeStatusParams = z.object({
    mode: z.enum(['current', 'history', 'profile']).describe('Status mode: "current" for live data (IOB, COB, Attribution), "history" for a sequence of points (for charts), or "profile" for settings.'),
    timeframe: timeframeSchema.optional().describe('For mode="history": the timeframe to retrieve status history.'),
    timestamp: z.string().optional().describe('For mode="profile": an ISO string timestamp to retrieve the active profile at that time.'),
    datapoints: z.number().optional().describe('For mode="history": target number of points to return. Used for server-side downsampling/bucketing to save tokens.'),
});

export const analyzeStatusTool = tool({
    description: `Access computed metabolic status: IOB (Insulin on Board), COB (Carbs on Board), metabolic attribution (why glucose is moving), and profile settings. ALWAYS use this for understanding insulin/carb impact or for plotting G/IOB/COB trends. Supports server-side downsampling via the "datapoints" parameter (defaults to 144). Tip: The "render_chart" tool knows exactly how many points it needs to display—use this to save tokens. Note: All glucose values and profile settings in this tool use the user's preferred units (mg/dL or mmol/L).`,
    inputSchema: analyzeStatusParams,
    execute: async (args: z.infer<typeof analyzeStatusParams>) => {
        try {
            const { mode, timeframe, timestamp } = args;
            const ctx = await getUserContext();
            const { ComputedStatus } = await import('../../db/models');

            if (mode === 'current') {
                const status = await getStatus(new Date());
                const g = status.glucose?.current;
                return {
                    glucose: g?.sgv,
                    units: ctx.glucoseUnits,
                    direction: g?.direction,
                    iob: status.iob?.calculated?.totalIOB,
                    cob: status.cob?.calculated?.cob,
                    basal_rate: status.pump?.basal?.rate,
                    attribution: status.attribution?.timeframes?.[0]?.components,
                    last_updated: status.meta.status_date,
                };
            }

            if (mode === 'history') {
                const { startMs, endMs } = resolveTimeframe(timeframe);
                const history = await ComputedStatus.find({
                    timestamp: { $gte: new Date(startMs), $lte: new Date(endMs) }
                }).sort({ timestamp: 1 }).lean();

                let rows = history.map((h: any) => ({
                    date: h.timestamp.getTime(),
                    sgv: h.status?.glucose?.current?.sgv,
                    iob: h.status?.iob?.calculated?.totalIOB,
                    cob: h.status?.cob?.calculated?.cob,
                })).filter(r => r.sgv != null);

                // Server-side downsampling/bucketing
                const target = Math.min(args.datapoints || MAX_CHART_POINTS, 500);
                if (rows.length > target) {
                    const bucketSize = Math.floor(rows.length / target);
                    const bucketed: typeof rows = [];
                    
                    for (let i = 0; i < target; i++) {
                        const start = i * bucketSize;
                        const end = (i === target - 1) ? rows.length : (i + 1) * bucketSize;
                        const subset = rows.slice(start, end);
                        
                        if (subset.length === 0) continue;
                        
                        // Use median for values to avoid spike-smearing, mean for dates
                        const midIdx = Math.floor(subset.length / 2);
                        const sortedSgv = [...subset].sort((a,b) => (a.sgv || 0) - (b.sgv || 0));
                        const sortedIob = [...subset].sort((a,b) => (a.iob || 0) - (b.iob || 0));
                        const sortedCob = [...subset].sort((a,b) => (a.cob || 0) - (b.cob || 0));
                        
                        bucketed.push({
                            date: Math.round(subset.reduce((s, r) => s + r.date, 0) / subset.length),
                            sgv: sortedSgv[midIdx].sgv,
                            iob: sortedIob[midIdx].iob,
                            cob: sortedCob[midIdx].cob
                        });
                    }
                    rows = bucketed;
                }

                return {
                    rows,
                    units: ctx.glucoseUnits,
                    count: rows.length,
                    period_start: new Date(startMs).toISOString(),
                    period_end: new Date(endMs).toISOString(),
                };
            }

            if (mode === 'profile') {
                const targetDate = timestamp ? new Date(timestamp) : new Date();
                const status = await getStatus(targetDate);
                return {
                    profile: status.profile,
                    timestamp: status.meta.status_date,
                };
            }

            throw new Error(`Invalid mode: ${mode}`);
        } catch (err: any) {
            console.error('[analyze_status] execution failed:', err);
            return { error: err.message || String(err) };
        }
    },
});

// ---------------------------------------------------------------------------
// Tool: analyze_activities
// ---------------------------------------------------------------------------

const analyzeActivitiesParams = z.object({
    timeframe: timeframeSchema.optional(),
    datapoints: z.number().int().min(1).max(500).optional().describe('Target number of points for time-series charts (defaults to 144). Supports server-side downsampling.'),
});

export const analyzeActivitiesTool = tool({
    description: `Analyse physical activity data: step counts and heart rate. Use for questions about daily steps, heart rate trends, or exercise patterns. This tool returns both summary statistics AND time-series data (steps_series, heartrate_series, heartrate_bands) for plotting. Supports server-side downsampling via the "datapoints" parameter (defaults to 144). Tip: The "render_chart" tool knows exactly how many points it needs to display—use this to save tokens.`,
    inputSchema: analyzeActivitiesParams,
    execute: async (args: z.infer<typeof analyzeActivitiesParams>) => {
        try {
            const { timeframe } = args;
            const ctx = await getUserContext();
            const { startMs, endMs } = resolveTimeframe(timeframe);
            const rangeDays = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)));

            // Query type:'activity' exactly as the statistics page does
            const activityEntries = await Entry.find({
                date: { $gte: startMs, $lte: endMs },
                type: 'activity',
                stale: { $ne: true },
            }).select('date timestamp created_at steps heartrate').sort({ date: 1 }).lean() as Array<{ heartrate?: number; steps?: number; date: number }>;

            if (!activityEntries.length) return { error: 'No activity data found in this period.' };

            const actStats = calculateActivityStatistics(activityEntries, rangeDays, ctx.timezone);
            if (!actStats) return { error: 'Could not compute activity statistics.' };

            // Generate bucketed time-series for charts
            const target = Math.min(args.datapoints || MAX_CHART_POINTS, 500);
            let steps_series: { x: number, y: number }[] = [];
            let heartrate_series: { x: number, y: number }[] = [];
            let heartrate_bands: { x: number, low: number, high: number }[] = [];

            if (activityEntries.length > target) {
                const bucketSize = Math.floor(activityEntries.length / target);
                for (let i = 0; i < target; i++) {
                    const start = i * bucketSize;
                    const end = (i === target - 1) ? activityEntries.length : (i + 1) * bucketSize;
                    const subset = activityEntries.slice(start, end);
                    if (subset.length === 0) continue;

                    const date = Math.round(subset.reduce((s, r) => s + r.date, 0) / subset.length);
                    
                    // Sum steps in period
                    const steps = subset.reduce((s, r) => s + (r.steps || 0), 0);
                    steps_series.push({ x: date, y: steps });

                    // Stats for heart rate
                    const hrs = subset.map(r => r.heartrate).filter(v => v != null) as number[];
                    if (hrs.length > 0) {
                        const sortedHrs = [...hrs].sort((a, b) => a - b);
                        heartrate_series.push({ x: date, y: sortedHrs[Math.floor(sortedHrs.length / 2)] });
                        heartrate_bands.push({ x: date, low: sortedHrs[0], high: sortedHrs[sortedHrs.length - 1] });
                    }
                }
            } else {
                // Small enough to return 1:1
                for (const r of activityEntries) {
                    steps_series.push({ x: r.date, y: r.steps || 0 });
                    if (r.heartrate != null) {
                        heartrate_series.push({ x: r.date, y: r.heartrate });
                        heartrate_bands.push({ x: r.date, low: r.heartrate, high: r.heartrate });
                    }
                }
            }

            return {
                avg_daily_steps: actStats.stats.avgDailySteps,
                total_steps: actStats.stats.totalSteps,
                median_heart_rate: actStats.stats.heartRate.median,
                max_heart_rate: actStats.stats.heartRate.max,
                period_days: rangeDays,
                steps_series: { name: 'Steps', color: '#8b5cf6', type: 'bar', data: steps_series },
                heartrate_series: { name: 'Heart Rate', color: '#f43f5e', type: 'line', data: heartrate_series },
                heartrate_bands: { name: 'HR Range', color: '#f43f5e', data: heartrate_bands },
            };
        } catch (err: any) {
            console.error('[analyze_activities] execution failed:', err);
            return { error: err.message || String(err) };
        }
    },
});

// ---------------------------------------------------------------------------
// Tool: query_data
// ---------------------------------------------------------------------------

const queryDataParams = z.object({
    collection: z.enum(ALLOWED_COLLECTIONS as unknown as [string, ...string[]]).describe(
        `Which collection to query. Options: ${ALLOWED_COLLECTIONS.join(', ')}.`
    ),
    metric: z.enum(['count', 'sum', 'avg', 'min', 'max', 'raw']).describe(
        'Aggregation to apply. Use "raw" to return individual documents (for charting/plotting).'
    ),
    field: z.string().optional().describe('Field to aggregate, e.g. "sgv", "insulin", "carbs", "steps", "heartrate". Ignored when metric="raw".'),
    fields: z.array(z.string()).optional().describe(
        'For metric="raw": which fields to include in each row, e.g. ["date","sgv"]. Omit to return all fields.'
    ),
    filter: z.object({
        field_gt: z.number().optional().describe('Filter: field must be greater than this value.'),
        field_lt: z.number().optional().describe('Filter: field must be less than this value.'),
    }).optional().describe('Optional numeric filter on the target field.'),
    entry_type: z.enum(['sgv', 'activity']).optional().describe(
        'For entries collection: filter by type. Use "sgv" for glucose readings, "activity" for steps/heartrate.'
    ),
    timeframe: timeframeSchema.optional(),
    group_by: z.enum(['hour', 'day', 'weekday']).optional().describe('Optional grouping dimension. Cannot be used with metric="raw".'),
    limit: z.number().int().min(1).max(1000).optional().describe('For metric="raw": max rows to return. Default 500.'),
    sort_field: z.string().optional().describe('For metric="raw": field to sort by. Default: collection timestamp field.'),
    sort_order: z.enum(['asc', 'desc']).optional().describe('For metric="raw": sort direction. Default: asc.'),
});

export const queryDataTool = tool({
    description: `Ad-hoc structured data query. Use for aggregations (e.g. "daily carb sum") and raw extraction (metric="raw") for charts. Note: Glucose (sgv) in 'entries' is always mg/dL. Values in 'treatments' (carbs, insulin) use standard units.`,
    inputSchema: queryDataParams,
    execute: async (args: z.infer<typeof queryDataParams>) => {
        try {
            const { collection, metric, field, fields, filter, entry_type, timeframe, group_by, limit, sort_field, sort_order } = args;
            const ctx = await getUserContext();
            const { startMs, endMs } = resolveTimeframe(timeframe);

            const isEntries = collection === 'entries';
            const isActivity = collection === 'activity_records';
            const dateField = isEntries ? 'date' : 'created_at';

            let dateFilter: any;
            if (isEntries) {
                dateFilter = { $gte: startMs, $lte: endMs };
            } else if (isActivity) {
                dateFilter = { $gte: new Date(startMs), $lte: new Date(endMs) };
            } else {
                dateFilter = { $gte: new Date(startMs).toISOString(), $lte: new Date(endMs).toISOString() };
            }

            const matchStage: Record<string, any> = { [dateField]: dateFilter };
            if (entry_type && isEntries) matchStage['type'] = entry_type;
            if (field) {
                if (filter?.field_gt !== undefined) matchStage[field] = { ...matchStage[field], $gt: filter.field_gt };
                if (filter?.field_lt !== undefined) matchStage[field] = { ...matchStage[field], $lt: filter.field_lt };
            }

            const Model = await getModelForCollection(collection as AllowedCollection);

            // --- RAW mode: return individual documents ---
            if (metric === 'raw') {
                const sortBy = sort_field ?? dateField;
                const sortDir = sort_order === 'desc' ? -1 : 1;
                const cap = Math.min(limit ?? 500, 1000);

                const projection: Record<string, 0 | 1> = { _id: 0 };
                if (fields?.length) {
                    for (const f of fields) projection[f] = 1;
                }

                const rows = await Model.find(matchStage)
                    .select(Object.keys(projection).length > 1 ? projection : undefined)
                    .sort({ [sortBy]: sortDir })
                    .limit(cap)
                    .lean();

                const hasGlucose = isEntries && (entry_type === 'sgv' || fields?.includes('sgv'));

                // Do not convert units here — keep raw database values (e.g., mg/dL for entries)
                return {
                    rows,
                    count: rows.length,
                    units: hasGlucose ? 'mg/dL' : undefined,
                    period_start: new Date(startMs).toISOString(),
                    period_end: new Date(endMs).toISOString(),
                };
            }

            // --- Aggregation modes ---
            if (metric !== 'count' && !field) {
                return { error: `The 'field' parameter is required for metric: ${metric}` };
            }

            const pipeline: any[] = [{ $match: matchStage }];

            if (group_by) {
                const groupId = buildGroupId(group_by, dateField, collection as AllowedCollection, ctx.timezone);
                pipeline.push({ $group: { _id: groupId, value: buildAggregateOp(metric, field || 'sgv') } });
                pipeline.push({ $sort: { _id: 1 } });
                const results = await Model.aggregate(pipeline);
                return {
                    grouped_results: results.slice(0, 100),
                    metric,
                    field,
                    units: field === 'sgv' ? ctx.glucoseUnits : undefined,
                };
            }

            pipeline.push({ $group: { _id: null, value: buildAggregateOp(metric, field || 'sgv') } });
            const result = await Model.aggregate(pipeline);
            return {
                value: result[0]?.value ?? 0,
                metric,
                field,
                period_start: new Date(startMs).toISOString(),
                period_end: new Date(endMs).toISOString(),
                units: field === 'sgv' ? ctx.glucoseUnits : undefined,
            };
        } catch (err: any) {
            console.error('[query_data] execution failed:', err);
            return { error: err.message || String(err) };
        }
    },
});

// ---------------------------------------------------------------------------
// Tool: render_chart
// ---------------------------------------------------------------------------

const chartSeriesSchema = z.object({
    name: z.string().describe('Legend label for this series.'),
    color: z.string().describe('Hex color, e.g. "#10b981".'),
    type: z.enum(['line', 'bar']).optional().describe('Visual type for this specific series. Use "bar" for carbs/events on a line chart.'),
    data: z.array(z.object({
        x: z.union([z.number(), z.string()]).describe('X-axis value: timestamp (epoch ms) for line charts, label string for bar charts.'),
        y: z.number().describe('Y-axis value.'),
    })).describe('Array of data points.'),
});

const chartBandSchema = z.object({
    name: z.string().describe('Legend label for this band, e.g. "5%–95%".'),
    color: z.string().describe('Hex fill color.'),
    data: z.array(z.object({
        x: z.union([z.number(), z.string()]).describe('X-axis value.'),
        low: z.number().describe('Lower bound of the band.'),
        high: z.number().describe('Upper bound of the band.'),
    })).describe('Array of band range points.'),
});

// Helper for downsampling data series
function downsample<T>(data: T[], maxPoints: number): T[] {
    if (data.length <= maxPoints) return data;
    const factor = Math.ceil(data.length / maxPoints);
    return data.filter((_, i) => i % factor === 0);
}

const renderChartParams = z.object({
    title: z.string().describe('Chart title displayed above the chart.'),
    chartType: z.enum(['line', 'bar', 'band', 'composed']).describe(
        'Chart type: "line" for traces, "bar" for daily totals, "band" for percentile/AGP charts, and "composed" for mixed charts (e.g. Glucose line + Carb bars).'
    ),

    // Option A: pass raw series from query_data directly (PRO TIP: Use this for multi-metric charts)
    rawSeries: z.array(z.object({
        rows: z.array(z.record(z.string(), z.unknown())).describe('The rows array from a query_data result.'),
        xField: z.string().describe('Field name for X axis (e.g. "date").'),
        yField: z.string().describe('Field name for Y axis (e.g. "sgv" or "carbs").'),
        name: z.string().describe('Legend label.'),
        color: z.string().describe('Hex color.'),
        type: z.enum(['line', 'bar']).optional().describe('Visual type for this series in a composed chart.'),
    })).optional().describe('Automatically maps multiple raw results into chart series. This is the easiest way to plot multiple metrics together.'),

    // Legacy/Single result option
    rawRows: z.object({
        rows: z.array(z.record(z.string(), z.unknown())).describe('The rows array from query_data.'),
        xField: z.string().describe('X axis field.'),
        yField: z.string().describe('Y axis field.'),
        seriesName: z.string().describe('Label.'),
        seriesColor: z.string().describe('Color.'),
    }).optional().describe('Legacy: maps a single raw result. For multiple results, use "rawSeries" instead.'),

    // Option B: pre-shaped series (for analyze_* tool outputs)
    series: z.array(chartSeriesSchema).optional().describe('Pre-shaped series. Use for analyze_* tool outputs. Omit if using rawSeries.'),
    bands: z.array(chartBandSchema).optional().describe(
        'For chartType="band": shaded range bands. Plot series on top as median line.'
    ),

    xLabel: z.string().optional().describe('X-axis label.'),
    yLabel: z.string().optional().describe('Y-axis label / units suffix.'),
    targetLow: z.number().optional().describe('Target range lower bound (mg/dL or mmol/L depending on context).'),
    targetHigh: z.number().optional().describe('Target range upper bound.'),
});

export const renderChartTool = tool({
    description: `Render an interactive chart inline. Supports multi-metric mapping. Large sets are automatically downsampled to ${MAX_CHART_POINTS} points. You have a budget of ${MAX_TOOL_RETRIES} retries per tool.`,
    inputSchema: renderChartParams,
    execute: async (args: z.infer<typeof renderChartParams>) => {
        try {
            console.log('[render_chart] executing with args:', JSON.stringify(args).slice(0, 500));
            // Map rawSeries to series array
            let finalSeries = args.series ?? [];
            
            if (args.rawSeries) {
                for (const rs of args.rawSeries) {
                    const { rows, xField, yField, name, color, type } = rs;
                    let mapped = (rows as any[])
                        .filter((r) => r[xField] != null && r[yField] != null)
                        .map((r) => ({ x: r[xField] as number | string, y: Number(r[yField]) }));
                    
                    finalSeries.push({ name, color, type, data: downsample(mapped, MAX_CHART_POINTS) });
                }
            } else if (args.rawRows) {
                const { rows, xField, yField, seriesName, seriesColor } = args.rawRows;
                let mapped = (rows as any[])
                    .filter((r) => r[xField] != null && r[yField] != null)
                    .map((r) => ({ x: r[xField] as number | string, y: Number(r[yField]) }));
                
                finalSeries = [{ name: seriesName, color: seriesColor, data: downsample(mapped, MAX_CHART_POINTS) }];
            }

            // Return the final spec
            const { rawRows: _raw, rawSeries: _rs, ...rest } = args;
            return { ...rest, series: finalSeries };
        } catch (err: any) {
            console.error('[render_chart] execution failed:', err);
            return { error: err.message || String(err) };
        }
    },
});


// ---------------------------------------------------------------------------
// Tool: analyze_explain
// ---------------------------------------------------------------------------

const analyzeExplainParams = z.object({
    timeframe: timeframeSchema.optional().describe('Point in time or window to explain. Defaults to "now".'),
});

export const analyzeExplainTool = tool({
    description: `Get a deep, multi-factored explanation of glucose movement. Returns a rich JSON snapshot including current IOB/COB, metabolic attribution (insulin/carb/activity impact from the last 30m), and future forecasts. Use this when the user asks "Why is my blood sugar doing X?" or "What happened at [time]?". Note: All values are automatically converted to the user's preferred units (mg/dL or mmol/L).`,
    inputSchema: analyzeExplainParams,
    execute: async (args: z.infer<typeof analyzeExplainParams>) => {
        try {
            const { timeframe } = args;
            const ctx = await getUserContext();
            const { startMs } = resolveTimeframe(timeframe);
            const targetDate = new Date(startMs);

            // 1. Core status and attribution
            const status = await getStatus(targetDate, true, true);
            const attribution = status.attribution || await attributeGlucoseChange(status);
            const prediction = await getGlucosePrediction(targetDate, 240);

            const isMmol = ctx.glucoseUnits === 'mmol/L';
            const toUnits = (val: number) => isMmol ? Math.round((val / 18.018) * 10) / 10 : Math.round(val * 10) / 10;

            // 2. Format Attribution with unit conversion
            const attr30 = attribution.timeframes?.find((tf: any) => tf.minutes === 30);
            const formattedAttribution = attr30 ? {
                actual_change: toUnits(attr30.glucoseChange.actual),
                predicted_change: toUnits(attr30.glucoseChange.predicted),
                unexplained_delta: toUnits(attr30.components.unexplained),
                breakdown: {
                    insulin_impact: toUnits(attr30.components.insulin.value),
                    carb_impact: toUnits(attr30.components.carbs.value),
                    basal_impact: toUnits(attr30.components.basal.value),
                    activity_impact: toUnits(attr30.components.activity.value),
                },
                activity_details: attr30.components.activity.dataAvailable ? {
                    intensity: attr30.components.activity.intensity,
                    steps: attr30.components.activity.steps,
                    heart_rate: attr30.components.activity.heartRate,
                } : null
            } : null;

            // 3. Package final response
            return {
                timestamp: targetDate.toISOString(),
                units: ctx.glucoseUnits,
                glucose: {
                    value: status.glucose?.current?.sgv,
                    trend: status.glucose?.current?.direction,
                    delta_30m: status.glucose?.current?.delta30m,
                },
                active_influencers: {
                    iob: {
                        total: status.iob?.calculated?.totalIOB,
                        bolus: status.iob?.calculated?.bolusIOB,
                        basal_deviation: status.iob?.calculated?.basalIOB,
                    },
                    cob: {
                        total: status.cob?.calculated?.cob,
                        active_absorption: status.cob?.calculated?.activeCOB,
                    }
                },
                attribution_last_30m: formattedAttribution,
                forecast: prediction.length > 0 ? {
                    short_term_30m: toUnits(prediction.find((p, i) => i === 6)?.sgv || prediction[0].sgv), // ~30 mins is 6 intervals
                    eventual_4hr: toUnits(prediction[prediction.length - 1].sgv),
                    min_predicted: toUnits(Math.min(...prediction.map(p => p.sgv))),
                    max_predicted: toUnits(Math.max(...prediction.map(p => p.sgv))),
                } : null,
                device_status: {
                    sensor_age_hours: status.glucose?.sensor?.age,
                    pump_site_age_hours: status.pump?.pumpAge,
                    reservoir_units: status.pump?.reservoir,
                }
            };
        } catch (err: any) {
            console.error('[analyze_explain] execution failed:', err);
            return { error: err.message || String(err) };
        }
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
    // Robustly convert to Date object before grouping
    const dateExpr = { $toDate: `$${dateField}` };

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
    analyze_status: analyzeStatusTool,
    analyze_explain: analyzeExplainTool,
    query_data: queryDataTool,
    render_chart: renderChartTool,
};

