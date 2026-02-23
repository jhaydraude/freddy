// No external date-fns imports needed for current logic

export interface PercentilePoint {
    timestamp: number;
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
}

export interface StatisticsResult {
    percentiles: PercentilePoint[];
    timeInRange: {
        inRange: number;
        high: number;
        low: number;
        totalReadings: number;
    };
    statistics: {
        median: number;
        mean: number;
        stdDev: number;
        hba1c: number;
        cv: number;
    };
    meta: {
        startDate: string;
        endDate: string;
        units: string;
    };
}

export function calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sorted.length) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function estimateHbA1c(meanGlucoseMgDl: number): number {
    // Formula: (mean_glucose + 46.7) / 28.7
    return (meanGlucoseMgDl + 46.7) / 28.7;
}

export function calculateStatistics(readings: any[], lowThreshold: number, highThreshold: number, units: string) {
    if (readings.length === 0) {
        return {
            percentiles: [],
            timeInRange: { inRange: 0, high: 0, low: 0, totalReadings: 0 },
            statistics: { median: 0, mean: 0, stdDev: 0, hba1c: 0, cv: 0 }
        };
    }

    const isMmol = units === 'mmol/L';
    const rawValues = readings.map(r => r.sgv).filter(v => v != null);

    if (rawValues.length === 0) {
        return {
            percentiles: [],
            timeInRange: { inRange: 0, high: 0, low: 0, totalReadings: 0 },
            statistics: { median: 0, mean: 0, stdDev: 0, hba1c: 0, cv: 0 }
        };
    }

    // HbA1c estimation always uses mg/dL
    const sumRaw = rawValues.reduce((a, b) => a + b, 0);
    const meanRaw = sumRaw / rawValues.length;
    const hba1c = estimateHbA1c(meanRaw);

    // Convert values if units are mmol/L
    const values = isMmol
        ? rawValues.map(v => Math.round((v / 18.018) * 10) / 10)
        : rawValues;

    // Basic stats on converted values
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    const squareDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(avgSquareDiff);
    const cv = mean > 0 ? (stdDev / mean) * 100 : 0;

    // Time in range
    let lowCount = 0;
    let inRangeCount = 0;
    let highCount = 0;

    values.forEach(v => {
        if (v < lowThreshold) lowCount++;
        else if (v > highThreshold) highCount++;
        else inRangeCount++;
    });

    const total = values.length;
    const timeInRange = {
        low: (lowCount / total) * 100,
        inRange: (inRangeCount / total) * 100,
        high: (highCount / total) * 100,
        totalReadings: total
    };

    // Percentiles over time (bucketed by hour)
    const hourlyGroups: Map<number, number[]> = new Map();
    for (let i = 0; i < 24; i++) hourlyGroups.set(i, []);

    readings.forEach(r => {
        if (r.sgv) {
            const date = new Date(r.timestamp || r.dateString);
            const hour = date.getHours();
            const val = isMmol
                ? Math.round((r.sgv / 18.018) * 10) / 10
                : r.sgv;
            hourlyGroups.get(hour)?.push(val);
        }
    });

    const percentiles: PercentilePoint[] = [];
    for (let i = 0; i < 24; i++) {
        const hourValues = hourlyGroups.get(i) || [];
        if (hourValues.length > 0) {
            percentiles.push({
                timestamp: i,
                p5: calculatePercentile(hourValues, 5),
                p25: calculatePercentile(hourValues, 25),
                p50: calculatePercentile(hourValues, 50),
                p75: calculatePercentile(hourValues, 75),
                p95: calculatePercentile(hourValues, 95),
            });
        }
    }

    return {
        percentiles,
        timeInRange,
        statistics: {
            median,
            mean,
            stdDev,
            hba1c,
            cv
        }
    };
}

export function calculateTDDStatistics(boluses: any[], basals: any[]) {
    // 1. Daily totals
    const dailyData: Record<string, { basal: number, bolus: number, date: Date }> = {};

    const processRecord = (record: any, type: 'basal' | 'bolus') => {
        const ts = record.created_at || record.timestamp || record.date;
        if (!ts) return;

        const date = new Date(ts);
        if (isNaN(date.getTime())) return;

        // Correct to start of day in local time for grouping, but simpler to use date string formatting if available
        // Assuming we have date objects, we'll group by yyyy-mm-dd
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dayKey = `${year}-${month}-${day}`;

        if (!dailyData[dayKey]) {
            dailyData[dayKey] = { basal: 0, bolus: 0, date: new Date(year, date.getMonth(), date.getDate()) };
        }

        const insulin = record.insulin || record.deliveredInsulin || 0;
        dailyData[dayKey][type] += insulin;
    };

    boluses.forEach(b => processRecord(b, 'bolus'));
    basals.forEach(b => processRecord(b, 'basal'));

    const days = Object.values(dailyData).map(d => ({
        ...d,
        total: d.basal + d.bolus
    })).sort((a, b) => a.date.getTime() - b.date.getTime());

    const calculateStats = (vals: number[]) => {
        if (vals.length === 0) return { median: 0, p95: 0 };
        return {
            median: calculatePercentile(vals, 50),
            p95: calculatePercentile(vals, 95)
        };
    };

    const allTotals = days.map(d => d.total);
    // Weekday: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri. Weekend: 0=Sun, 6=Sat
    const weekdayTotals = days.filter(d => d.date.getDay() >= 1 && d.date.getDay() <= 5).map(d => d.total);
    const weekendTotals = days.filter(d => d.date.getDay() === 0 || d.date.getDay() === 6).map(d => d.total);

    // 2. Hourly Breakdown
    // We want per-hour delivery distribution across all days.
    const hourlyBolus: Map<number, number[]> = new Map();
    const hourlyBasal: Map<number, number[]> = new Map();
    // To correctly aggregate across days, for each day we process, we add to the specific hour bucket
    // For basals, we should have discrete hourly or 5-min buckets passed in from route

    // Group records by day+hour to get delivery per hour for a specific day
    const dayHourData: Record<string, Record<number, { basal: number, bolus: number }>> = {};

    const processHourly = (record: any, type: 'basal' | 'bolus') => {
        const ts = record.created_at || record.timestamp || record.date;
        if (!ts) return;

        const date = new Date(ts);
        if (isNaN(date.getTime())) return;

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dayKey = `${year}-${month}-${day}`;
        const hour = date.getHours();

        if (!dayHourData[dayKey]) dayHourData[dayKey] = {};
        if (!dayHourData[dayKey][hour]) dayHourData[dayKey][hour] = { basal: 0, bolus: 0 };

        const insulin = record.insulin || record.deliveredInsulin || 0;
        dayHourData[dayKey][hour][type] += insulin;
    };

    boluses.forEach(b => processHourly(b, 'bolus'));
    basals.forEach(b => processHourly(b, 'basal'));

    // Now populate hourlyBolus/Basal buckets across all days
    // Initialize 0-23
    for (let i = 0; i < 24; i++) {
        hourlyBolus.set(i, []);
        hourlyBasal.set(i, []);
    }

    Object.values(dayHourData).forEach(dayHours => {
        // for a given day, some hours might have no delivery, they should be 0
        for (let h = 0; h < 24; h++) {
            const data = dayHours[h] || { basal: 0, bolus: 0 };
            hourlyBolus.get(h)!.push(data.bolus);
            hourlyBasal.get(h)!.push(data.basal);
        }
    });

    const hourlyStats = Array.from({ length: 24 }).map((_, hour) => {
        const bolusVals = hourlyBolus.get(hour) || [];
        const basalVals = hourlyBasal.get(hour) || [];
        const totalVals = bolusVals.map((b, i) => b + (basalVals[i] || 0));

        return {
            hour,
            median: calculatePercentile(totalVals, 50),
            p95: calculatePercentile(totalVals, 95),
            basalMedian: calculatePercentile(basalVals, 50),
            bolusMedian: calculatePercentile(bolusVals, 50)
        };
    });

    return {
        dailySeries: days.map(d => ({
            date: d.date.toISOString(), // ISO to pass to UI safely
            total: d.total,
            basal: d.basal,
            bolus: d.bolus
        })),
        stats: {
            overall: calculateStats(allTotals),
            weekdays: calculateStats(weekdayTotals),
            weekends: calculateStats(weekendTotals)
        },
        hourlyStats
    };
}
