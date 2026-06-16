import { format } from 'date-fns';

/**
 * Standardized layout configuration for all dashboard charts to ensure 
 * perfect horizontal alignment of synchronization lines.
 * 
 * Total right-side space (120px) is distributed based on individual chart needs.
 */
export const CHART_LAYOUT = {
    // Shared margins
    MARGIN: { top: 10, left: 0, bottom: 0 },

    // Total space reserved on the right side of the plot area for axes and padding
    TOTAL_RIGHT_SPACE: 120,

    // Standard widths for different axis types
    Y_AXIS_WIDTH_GLUCOSE: 60,
    Y_AXIS_WIDTH_SECONDARY: 40,
    Y_AXIS_WIDTH_MINIMAL: 0, // Used when axis is hidden but space is still needed in margin

    /**
     * Helper to get common XAxis props for better maintenance
     */
    getXAxisProps: (timeDomain?: [number, number]) => ({
        dataKey: 'timestamp',
        type: 'number' as const,
        domain: timeDomain || ['dataMin', 'dataMax'],
        tickFormatter: (val: number) => format(new Date(val), 'HH:mm'),
        stroke: '#52525b',
        tick: { fontSize: 10 },
        axisLine: false,
        tickLine: false,
        allowDataOverflow: true,
        minTickGap: 60,
    })
};

/**
 * Transforms raw telemetry data into a flat format optimized for GlucoseChart.
 */
export function transformGlucoseData(data: any[], timeDomain?: [number, number]) {
    const transformed = data
        .filter(item => item.meta?.status_date || item.glucose?.timestamp)
        .map(item => ({
            timestamp: new Date(item.meta?.status_date || item.glucose?.timestamp).getTime(),
            sgv: item.glucose?.current?.sgv || null,
            iob: item.iob?.calculated?.totalIOB ?? null,
            cob: item.cob?.calculated?.cob ?? null,
            basal: item.pump?.basal?.scheduledRate ?? null,
            activeBasal: item.pump?.basal?.activeRate ?? null,
            bolus: item.treatments?.reduce((acc: number, t: any) => acc + (t.insulin && t.insulin > 0.6 ? t.insulin : 0), 0) || null,
            carbs: item.treatments?.reduce((acc: number, t: any) => acc + (t.carbs && t.carbs > 0 ? t.carbs : 0), 0) || null,
            raw: item
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

    if (timeDomain) {
        return transformed.filter(d => d.timestamp >= timeDomain[0] && d.timestamp <= timeDomain[1]);
    }
    return transformed;
}

/**
 * Transforms raw telemetry data into a format for ImpactChart.
 */
export function transformImpactData(data: any[], timeDomain?: [number, number]) {
    const transformed = data
        .filter(item => item.meta?.status_date || item.glucose?.timestamp)
        .map(item => {
            const carbImpact = item.cob?.calculated?.glucoseImpact ?? 0;
            const insulinImpact = (item.iob?.calculated?.glucoseImpact ?? 0) * -1;
            const activityImpact = item.activity?.totalImpact ?? 0;
            const totalImpact = carbImpact + insulinImpact + activityImpact;
            const actualDelta = item.glucose?.current?.delta5m ?? null;
            return {
                timestamp: new Date(item.meta?.status_date || item.glucose?.timestamp).getTime(),
                insulinImpact,
                carbImpact,
                activityImpact,
                totalImpact,
                actualDelta,
                residual: actualDelta != null ? actualDelta - totalImpact : null,
                raw: item
            };
        })
        .sort((a, b) => a.timestamp - b.timestamp);

    if (timeDomain) {
        return transformed.filter(d => d.timestamp >= timeDomain[0] && d.timestamp <= timeDomain[1]);
    }
    return transformed;
}

/**
 * Transforms activity history for ActivityChart.
 *
 * HR confidence:
 *   - hrAvg / hrMin / hrMax / hrRange → confident (worn, real reading)
 *   - hrLowConf → same BPM value but suspected off-body phantom reading:
 *       triggered when steps stopped >15 min ago AND post-step HR range ≤5 BPM.
 *     Chart renders this as a dashed, faded line instead of the solid HR line.
 */
export function transformActivityData(activityHistory: any[], timeDomain?: [number, number]) {
    if (!activityHistory || activityHistory.length === 0) return [];

    const GAP_THRESHOLD_MS = 10 * 60 * 1000; // 10 min = 2× expected 5-min interval
    const STEP_GAP_FOR_OFFBODY_MS = 15 * 60 * 1000; // no steps for 15+ min triggers check
    const OFFBODY_HR_RANGE_THRESHOLD = 5; // BPM — real resting HR varies more than this

    const transformed = activityHistory
        .map(item => {
            const timestamp = new Date(item.timestamp).getTime();
            if (isNaN(timestamp)) return null;

            const hrMin = typeof item.heartRate?.bpm_min === 'number' ? item.heartRate.bpm_min : null;
            const hrMax = typeof item.heartRate?.bpm_max === 'number' ? item.heartRate.bpm_max : null;

            return {
                timestamp,
                steps: typeof item.steps?.count === 'number' ? item.steps.count : 0,
                hrAvg: typeof item.heartRate?.bpm_avg === 'number' ? item.heartRate.bpm_avg : null,
                hrMin,
                hrMax,
                hrRange: (hrMin !== null && hrMax !== null) ? [hrMin, hrMax] : null,
                hrLowConf: null as number | null,
                raw: item
            };
        })
        .filter((d): d is any => d !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

    // Detect suspected off-body periods: steps stopped >15 min ago AND post-step
    // HR is suspiciously flat (≤5 BPM range). Real resting HR on a wrist still
    // varies more than this; phantom optical readings from a desk are nearly constant.
    const lastStepTime = transformed.reduce(
        (acc: number, d: any) => d.steps > 0 ? d.timestamp : acc,
        0
    );

    if (lastStepTime > 0) {
        const postStepPoints = transformed.filter(
            (d: any) => d.timestamp > lastStepTime && d.hrAvg !== null
        );
        const postStepGapMs = postStepPoints.length > 0
            ? postStepPoints[postStepPoints.length - 1].timestamp - lastStepTime
            : 0;

        if (postStepGapMs >= STEP_GAP_FOR_OFFBODY_MS && postStepPoints.length >= 3) {
            const bpms: number[] = postStepPoints.map((d: any) => d.hrAvg);
            const bpmRange = Math.max(...bpms) - Math.min(...bpms);

            if (bpmRange <= OFFBODY_HR_RANGE_THRESHOLD) {
                // Move HR data to low-confidence slot; nulls break the solid line
                for (const d of postStepPoints) {
                    d.hrLowConf = d.hrAvg;
                    d.hrAvg = null;
                    d.hrMin = null;
                    d.hrMax = null;
                    d.hrRange = null;
                }
            }
        }
    }

    // Insert null-HR gap-breaker points where data collection gaps exist.
    // Without these, Recharts draws a straight line across gaps.
    const withGaps: any[] = [];
    for (let i = 0; i < transformed.length; i++) {
        withGaps.push(transformed[i]);

        if (i < transformed.length - 1) {
            const gap = transformed[i + 1].timestamp - transformed[i].timestamp;
            if (gap > GAP_THRESHOLD_MS) {
                withGaps.push({
                    timestamp: transformed[i].timestamp + 60000,
                    steps: 0,
                    hrAvg: null,
                    hrMin: null,
                    hrMax: null,
                    hrRange: null,
                    hrLowConf: null,
                    raw: null
                });
            }
        }
    }

    if (timeDomain) {
        return withGaps.filter(d => d.timestamp >= timeDomain[0] && d.timestamp <= timeDomain[1]);
    }
    return withGaps;
}
