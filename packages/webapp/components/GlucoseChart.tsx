'use client';

import { useState, useCallback } from 'react';
import {
    ComposedChart,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    ReferenceArea
} from 'recharts';
import { format } from 'date-fns';
import { CHART_LAYOUT } from '@/lib/chartUtils';

export interface VisibleLines {
    glucose: boolean;
    iob: boolean;
    cob: boolean;
    insulinImpact: boolean;
    carbImpact: boolean;
    basal: boolean;
}

export interface HighlightRange {
    start: string;
    end: string;
    label?: string;
}

interface GlucoseChartProps {
    data: any[];
    isLoading?: boolean;
    loadingType?: 'fetch' | 'recalculate';
    visibleLines: VisibleLines;
    onClick?: (data: any) => void;
    highlightRange?: HighlightRange;
    timeDomain?: [number, number];
    targetLow?: number;
    targetHigh?: number;
    units?: string;
}

export default function GlucoseChart({ data, isLoading, visibleLines, timeDomain, targetLow = 70, targetHigh = 180, units = 'mg/dL' }: GlucoseChartProps) {
    const [hoverData, setHoverData] = useState<any>(null);

    // Invisible tooltip that captures data for the header bar
    const DataCapture = useCallback(({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const point = payload[0].payload;
            setTimeout(() => setHoverData(point), 0);
        } else {
            setTimeout(() => setHoverData(null), 0);
        }
        return null;
    }, []);

    // Custom legend renderer that appends hover values inline
    const renderLegend = useCallback((props: any) => {
        const { payload } = props;
        if (!payload) return null;

        // Map dataKey -> hover value
        const valueMap: Record<string, string> = {};
        if (hoverData) {
            if (hoverData.sgv != null) valueMap['sgv'] = typeof hoverData.sgv === 'number' ? hoverData.sgv.toFixed(units === 'mmol/L' ? 1 : 0) : '';
            if (hoverData.iob != null) valueMap['iob'] = hoverData.iob.toFixed(2);
            if (hoverData.cob != null) valueMap['cob'] = hoverData.cob.toFixed(0) + 'g';
            if (hoverData.activeBasal != null) valueMap['activeBasal'] = hoverData.activeBasal.toFixed(2);
            if (hoverData.basal != null) valueMap['basal'] = hoverData.basal.toFixed(2);
        }

        return (
            <div className="flex items-center justify-center gap-4 text-[11px]">
                {hoverData && (
                    <span className="text-zinc-500 font-mono text-xs mr-1">
                        {format(new Date(hoverData.timestamp), 'HH:mm')}
                    </span>
                )}
                {payload.map((entry: any, index: number) => {
                    const val = valueMap[entry.dataKey];
                    return (
                        <span key={index} className="flex items-center gap-1" style={{ color: entry.color }}>
                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: entry.color }}></span>
                            <span className="text-zinc-400">{entry.value}</span>
                            {val && <span className="font-mono font-bold" style={{ color: entry.color }}>({val})</span>}
                        </span>
                    );
                })}
            </div>
        );
    }, [hoverData, units]);

    // Helper to detect if data is in mg/dL based on values
    // If values are generally > 30, it is likely mg/dL
    const isDataMgDl = data.length > 0 && data.some(d => d.sgv > 30);
    const shouldConvert = units === 'mmol/L' && isDataMgDl;

    // Transform data if unit conversion is needed
    const chartData = shouldConvert
        ? data.map(d => ({ ...d, sgv: d.sgv ? d.sgv / 18 : null }))
        : data;

    // Filter data to match the visible time domain for accurate gradient calculation
    const visibleData = timeDomain
        ? chartData.filter(d => d.timestamp >= timeDomain[0] && d.timestamp <= timeDomain[1])
        : chartData;

    // Calculate gradient offsets based on VISIBLE data
    const glucoseValues = visibleData.map(d => d.sgv).filter(v => v != null);

    const dataMax = Math.max(...glucoseValues);
    const dataMin = Math.min(...glucoseValues);

    // Calculate separate maxes for IOB and Basal
    const iobValues = visibleData.map(d => d.iob).filter(v => v != null);
    const basalValues = visibleData.flatMap(d => [d.basal, d.activeBasal].filter(v => v != null));
    const cobValues = visibleData.map(d => d.cob).filter(v => v != null);

    const iobMax = Math.max(...iobValues, 1);
    const basalMax = Math.max(...basalValues, 0.1);
    const cobMaxData = Math.max(...cobValues, 0);
    const cobMax = cobMaxData > 0 ? cobMaxData * 1.1 : 100;

    const axisMax = Math.max(dataMax, targetHigh);
    const yMax = axisMax > 0 ? axisMax * 1.1 : (units === 'mmol/L' ? 22 : 400);

    // Squash Basal below benchmark (4mmol/L or 72mg/dL)
    const benchmark = units === 'mmol/L' ? 4 : 72;
    const targetBasalMax = (basalMax * yMax) / (benchmark * 0.8);
    const finalBasalMax = Math.max(targetBasalMax, basalMax * 1.1, 1);

    const iobDomain = [0, iobMax * 1.1];
    const basalDomain = [0, finalBasalMax];
    const cobDomain = [0, cobMax];


    const calculateOffset = (target: number) => {
        if (dataMax === dataMin) return 0;
        const offset = (dataMax - target) / (dataMax - dataMin);
        return Math.max(0, Math.min(1, offset));
    };

    const offsetHigh = calculateOffset(targetHigh);
    const offsetLow = calculateOffset(targetLow);

    const renderIobDot = useCallback((props: any) => {
        const { cx, cy, payload } = props;
        if (!payload || !payload.raw || !payload.raw.treatments || cx == null || cy == null) return <g></g>;

        const ts = payload.timestamp;
        const bucketStart = ts - 5 * 60 * 1000;
        
        const bucketTreatments = payload.raw.treatments.filter((t: any) => {
            const tTime = new Date(t.created_at).getTime();
            return tTime > bucketStart && tTime <= ts && t.insulin > 0;
        });

        if (bucketTreatments.length === 0) return <g></g>;

        const isBolus = bucketTreatments.some((t: any) => t.bolusType === 'BOLUS');
        const isSMB = bucketTreatments.some((t: any) => t.bolusType === 'SMB');

        if (isBolus) {
            return (
                <circle key={`dot-${ts}`} cx={cx} cy={cy} r={5} fill="#60a5fa" stroke="#1e3a8a" strokeWidth={1.5} />
            );
        } else if (isSMB) {
            return (
                <circle key={`dot-${ts}`} cx={cx} cy={cy} r={3} fill="#60a5fa" fillOpacity={0.4} stroke="none" />
            );
        }
        return <g></g>;
    }, []);
    if (isLoading && data.length === 0) {
        return (
            <div className="w-full h-[350px] flex items-center justify-center bg-zinc-900/40 rounded-xl border border-zinc-800/50">
                <span className="text-zinc-500">Loading...</span>
            </div>
        );
    }


    return (
        <div className="w-full h-[350px] bg-zinc-900/40 rounded-xl border border-zinc-800/50 p-4">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                    data={chartData}
                    margin={{
                        top: 5,
                        right: 60, // 60 (margin/gutter) + 30 (iob) + 30 (cob) = 120px total
                        left: 20,  // 20 (margin) + 40 (axis) = 60px total
                        bottom: 0
                    }}
                >
                    <defs>
                        <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={0} stopColor="#eab308" stopOpacity={1} />
                            <stop offset={offsetHigh} stopColor="#eab308" stopOpacity={1} />
                            <stop offset={offsetHigh} stopColor="#10b981" stopOpacity={1} />
                            <stop offset={offsetLow} stopColor="#10b981" stopOpacity={1} />
                            <stop offset={offsetLow} stopColor="#f43f5e" stopOpacity={1} />
                            <stop offset={1} stopColor="#f43f5e" stopOpacity={1} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />

                    <XAxis
                        {...CHART_LAYOUT.getXAxisProps(timeDomain)}
                    />

                    {/* Left Axis: Glucose */}
                    <YAxis
                        yAxisId="glucose"
                        orientation="left"
                        stroke="#10b981"
                        domain={[0, yMax]}
                        tick={{ fontSize: 10 }}
                        width={40}
                        axisLine={false}
                        tickLine={false}
                    />

                    {/* Right Axes */}
                    <YAxis
                        yAxisId="iob"
                        orientation="right"
                        stroke="#3b82f6"
                        domain={iobDomain}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => v.toFixed(1)}
                        width={30}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        yAxisId="basal"
                        orientation="right"
                        stroke="#0ea5e9"
                        domain={basalDomain}
                        tick={false}
                        width={0}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        yAxisId="cob"
                        orientation="right"
                        stroke="#f97316"
                        domain={cobDomain}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => v.toFixed(0)}
                        width={30}
                        axisLine={false}
                        tickLine={false}
                    />

                    <Tooltip
                        content={<DataCapture />}
                        cursor={{ stroke: '#52525b', strokeWidth: 1 }}
                    />
                    <Legend content={renderLegend} verticalAlign="top" height={36} />

                    {/* Target Range Band */}
                    <ReferenceArea
                        yAxisId="glucose"
                        y1={targetLow}
                        y2={targetHigh}
                        fill="#10b981"
                        fillOpacity={0.05}
                    />

                    {/* Active Basal (Deep Layer) */}
                    {visibleLines.basal && (
                        <Area
                            yAxisId="basal"
                            type="stepAfter"
                            dataKey="activeBasal"
                            name="Actual Basal"
                            stroke="#0ea5e9"
                            strokeWidth={2}
                            fill="#0ea5e9"
                            fillOpacity={0.2}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}

                    {visibleLines.basal && (
                        <Line
                            yAxisId="basal"
                            type="stepAfter"
                            dataKey="basal"
                            name="Scheduled Basal"
                            stroke="#ffffff"
                            strokeWidth={2}
                            strokeOpacity={0.6}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}

                    {visibleLines.glucose && (
                        <Line
                            yAxisId="glucose"
                            type="monotone"
                            dataKey="sgv"
                            name="Glucose"
                            stroke="url(#splitColor)"
                            strokeWidth={4}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}

                    {visibleLines.iob && (
                        <Line
                            yAxisId="iob"
                            type="monotone"
                            dataKey="iob"
                            name="IOB"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={renderIobDot}
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}

                    {visibleLines.cob && (
                        <Line
                            yAxisId="cob"
                            type="monotone"
                            dataKey="cob"
                            name="COB"
                            stroke="#f97316"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
