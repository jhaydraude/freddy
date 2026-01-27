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
