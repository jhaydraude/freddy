export interface PercentilePoint {
    timestamp: number;
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
}

function getLocalTimeData(date: Date, formatter: Intl.DateTimeFormat | null) {
    if (!formatter) {
        return {
            year: date.getFullYear(),
            month: String(date.getMonth() + 1).padStart(2, '0'),
            day: String(date.getDate()).padStart(2, '0'),
            hour: date.getHours()
        };
    }
    const parts = formatter.formatToParts(date);
    const yr = parts.find(p => p.type === 'year')?.value || String(date.getFullYear());
    const mo = parts.find(p => p.type === 'month')?.value || String(date.getMonth() + 1).padStart(2, '0');
    const da = parts.find(p => p.type === 'day')?.value || String(date.getDate()).padStart(2, '0');
    let hrStr = parts.find(p => p.type === 'hour')?.value || String(date.getHours());
    if (hrStr === '24') hrStr = '00';

    return { year: parseInt(yr, 10), month: mo, day: da, hour: parseInt(hrStr, 10) };
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

export interface ReadingRecord { sgv?: number; timestamp?: string | number | Date; dateString?: string; }

export function calculateStatistics(readings: ReadingRecord[], lowThreshold: number, highThreshold: number, units: string, timeZone?: string) {
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

    const tzFormatter = timeZone ? new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }) : null;

    readings.forEach(r => {
        if (r.sgv) {
            const date = new Date(r.timestamp || r.dateString || 0);
            const { hour } = getLocalTimeData(date, tzFormatter);
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

export interface TreatmentRecord { created_at?: string | number | Date; timestamp?: string | number | Date; date?: string | number | Date; insulin?: number; deliveredInsulin?: number; carbs?: number; }

export function calculateTDDStatistics(boluses: TreatmentRecord[], basals: TreatmentRecord[], timeZone?: string) {
    // 1. Daily totals
    const dailyData: Record<string, { basal: number, bolus: number, date: Date }> = {};

    const tzFormatter = timeZone ? new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }) : null;

    const processRecord = (record: TreatmentRecord, type: 'basal' | 'bolus') => {
        const ts = record.created_at || record.timestamp || record.date;
        if (!ts) return;

        const date = new Date(ts);
        if (isNaN(date.getTime())) return;

        const { year, month, day } = getLocalTimeData(date, tzFormatter);
        const dayKey = `${year}-${month}-${day}`;

        if (!dailyData[dayKey]) {
            // Re-creating a native Date here implies the 'day' zero hour will be server-based, 
            // but for simple sorting and .getDay() it acts as a reliable linear timeline mapping element.
            // Using setFullYear etc ensures we get a predictable relative Date for graphing.
            const sortableDate = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
            dailyData[dayKey] = { basal: 0, bolus: 0, date: sortableDate };
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

    const processHourly = (record: TreatmentRecord, type: 'basal' | 'bolus') => {
        const ts = record.created_at || record.timestamp || record.date;
        if (!ts) return;

        const date = new Date(ts);
        if (isNaN(date.getTime())) return;

        const { year, month, day, hour } = getLocalTimeData(date, tzFormatter);
        const dayKey = `${year}-${month}-${day}`;

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

export interface ActivityRecord { created_at?: string | number | Date; timestamp?: string | number | Date; date?: string | number | Date; steps?: number; heartrate?: number; }

export function calculateActivityStatistics(activities: ActivityRecord[], rangeDays?: number, timeZone?: string) {
    if (activities.length === 0) {
        return null;
    }

    const dailyData: Record<string, { steps: number, hrValues: number[], date: Date }> = {};
    const allHrValues: number[] = [];
    let totalSteps = 0;

    const tzFormatter = timeZone ? new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }) : null;

    activities.forEach(record => {
        const ts = record.created_at || record.timestamp || record.date;
        if (!ts) return;

        const date = new Date(ts);
        if (isNaN(date.getTime())) return;

        const { year, month, day } = getLocalTimeData(date, tzFormatter);
        const dayKey = `${year}-${month}-${day}`;

        if (!dailyData[dayKey]) {
            const sortableDate = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
            dailyData[dayKey] = { steps: 0, hrValues: [], date: sortableDate };
        }

        if (record.steps) {
            dailyData[dayKey].steps += record.steps;
            totalSteps += record.steps;
        }

        if (record.heartrate) {
            dailyData[dayKey].hrValues.push(record.heartrate);
            allHrValues.push(record.heartrate);
        }
    });

    const days = Object.values(dailyData).sort((a, b) => a.date.getTime() - b.date.getTime());

    let avgDailySteps = 0;
    if (totalSteps > 0) {
        const divider = rangeDays && rangeDays > 0 ? rangeDays : (days.length > 0 ? days.length : 1);
        avgDailySteps = totalSteps / divider;
    }

    let hrStats = { min: 0, max: 0, median: 0, mean: 0 };
    if (allHrValues.length > 0) {
        const sortedHr = [...allHrValues].sort((a, b) => a - b);
        hrStats = {
            min: sortedHr[0],
            max: sortedHr[sortedHr.length - 1],
            median: calculatePercentile(sortedHr, 50),
            mean: allHrValues.reduce((a, b) => a + b, 0) / allHrValues.length
        };
    }

    return {
        dailySeries: days.map(d => ({
            date: d.date.toISOString(),
            steps: d.steps,
            medianHeartRate: d.hrValues.length > 0 ? calculatePercentile(d.hrValues, 50) : null,
            maxHeartRate: d.hrValues.length > 0 ? Math.max(...d.hrValues) : null,
            minHeartRate: d.hrValues.length > 0 ? Math.min(...d.hrValues) : null
        })),
        stats: {
            avgDailySteps: Math.round(avgDailySteps),
            totalSteps,
            heartRate: hrStats
        }
    };
}

export function calculateCarbStatistics(treatments: TreatmentRecord[], rangeDays?: number, timeZone?: string) {
    if (treatments.length === 0) {
        return null;
    }

    const dailyData: Record<string, { carbs: number, date: Date }> = {};
    let totalCarbs = 0;

    const tzFormatter = timeZone ? new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }) : null;

    treatments.forEach(record => {
        const carbs = record.carbs || 0;
        if (carbs <= 0) return;

        const ts = record.created_at || record.timestamp || record.date;
        if (!ts) return;

        const date = new Date(ts);
        if (isNaN(date.getTime())) return;

        const { year, month, day } = getLocalTimeData(date, tzFormatter);
        const dayKey = `${year}-${month}-${day}`;

        if (!dailyData[dayKey]) {
            const sortableDate = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
            dailyData[dayKey] = { carbs: 0, date: sortableDate };
        }

        dailyData[dayKey].carbs += carbs;
        totalCarbs += carbs;
    });

    const days = Object.values(dailyData).sort((a, b) => a.date.getTime() - b.date.getTime());

    let avgDailyCarbs = 0;
    if (totalCarbs > 0) {
        const divider = rangeDays && rangeDays > 0 ? rangeDays : (days.length > 0 ? days.length : 1);
        avgDailyCarbs = totalCarbs / divider;
    }

    const calculateStats = (vals: number[]) => {
        if (vals.length === 0) return { median: 0, p95: 0 };
        return {
            median: calculatePercentile(vals, 50),
            p95: calculatePercentile(vals, 95)
        };
    };

    const allTotals = days.map(d => d.carbs);
    const weekdayTotals = days.filter(d => d.date.getDay() >= 1 && d.date.getDay() <= 5).map(d => d.carbs);
    const weekendTotals = days.filter(d => d.date.getDay() === 0 || d.date.getDay() === 6).map(d => d.carbs);

    return {
        dailySeries: days.map(d => ({
            date: d.date.toISOString(),
            carbs: d.carbs,
        })),
        stats: {
            overall: calculateStats(allTotals),
            weekdays: calculateStats(weekdayTotals),
            weekends: calculateStats(weekendTotals),
            totalCarbs,
            avgDailyCarbs: Math.round(avgDailyCarbs)
        }
    };
}
