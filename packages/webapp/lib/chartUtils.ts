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
            return {
                timestamp: new Date(item.meta?.status_date || item.glucose?.timestamp).getTime(),
                insulinImpact,
                carbImpact,
                activityImpact,
                totalImpact: carbImpact + insulinImpact + activityImpact,
                actualDelta: item.glucose?.current?.delta5m ?? null,
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
 */
export function transformActivityData(activityHistory: any[], timeDomain?: [number, number]) {
    if (!activityHistory || activityHistory.length === 0) return [];

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
                raw: item
            };
        })
        .filter((d): d is any => d !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

    if (timeDomain) {
        return transformed.filter(d => d.timestamp >= timeDomain[0] && d.timestamp <= timeDomain[1]);
    }
    return transformed;
}
