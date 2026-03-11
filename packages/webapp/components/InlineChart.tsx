'use client';

import { useEffect, useMemo } from 'react';
import {
    LineChart, BarChart, ComposedChart,
    Line, Bar, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Legend, ReferenceArea
} from 'recharts';
import { BarChart2 } from 'lucide-react';
import { format } from 'date-fns';

// ---------------------------------------------------------------------------
// Types matching the render_chart tool output
// ---------------------------------------------------------------------------

interface SeriesPoint { x: number | string; y: number; }
interface BandPoint { x: number | string; low: number; high: number; }

interface ChartSeries {
    name: string;
    color: string;
    type?: 'line' | 'bar' | 'area';
    data: SeriesPoint[];
}

interface ChartBand {
    name: string;
    color: string;
    data: BandPoint[];
}

export interface InlineChartData {
    title: string;
    chartType: 'line' | 'bar' | 'band' | 'composed';
    series: ChartSeries[];
    bands?: ChartBand[];
    xLabel?: string;
    yLabel?: string;
    targetLow?: number;
    targetHigh?: number;
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;

    // Format timestamp labels
    let displayLabel = label;
    if (typeof label === 'number' && label > 1e10) {
        displayLabel = format(new Date(label), 'MMM d, HH:mm');
    }

    return (
        <div className="bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-xl shadow-2xl text-xs">
            <p className="text-zinc-500 font-bold mb-1">{displayLabel}</p>
            {payload.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
                    <span className="text-zinc-400">{p.name}:</span>
                    <span className="font-mono font-bold text-white">
                        {typeof p.value === 'number' ? p.value.toFixed(1) : Array.isArray(p.value) ? `${p.value[0]?.toFixed(1)}–${p.value[1]?.toFixed(1)}` : p.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatXTick(value: number | string) {
    if (typeof value === 'number' && value > 1e10) {
        return format(new Date(value), 'HH:mm');
    }
    return String(value);
}

// Merge multiple series and bands into a single flat array keyed by x
function mergeData(series: ChartSeries[], bands?: ChartBand[]) {
    const map = new Map<string | number, Record<string, any>>();

    for (const s of series) {
        for (const pt of s.data) {
            const row = map.get(pt.x) || { x: pt.x };
            row[s.name] = pt.y;
            map.set(pt.x, row);
        }
    }

    if (bands) {
        for (const b of bands) {
            for (const pt of b.data) {
                const row = map.get(pt.x) || { x: pt.x };
                row[`${b.name}_range`] = [pt.low, pt.high];
                map.set(pt.x, row);
            }
        }
    }

    return Array.from(map.values()).sort((a, b) => {
        if (typeof a.x === 'number' && typeof b.x === 'number') return a.x - b.x;
        return String(a.x).localeCompare(String(b.x));
    });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InlineChart({ data }: { data: InlineChartData }) {
    useEffect(() => {
        console.log('[InlineChart] rendering with data:', data);
    }, [data]);

    const { title, chartType, series = [], bands = [], yLabel, targetLow, targetHigh } = data;
    const merged = useMemo(() => mergeData(series, bands), [series, bands]);

    if (merged.length === 0) {
        return (
            <div className="w-full bg-zinc-900/60 border border-zinc-800/60 rounded-2xl rounded-tl-sm p-4 flex flex-col items-center justify-center gap-2 min-h-[100px]">
                <BarChart2 className="text-zinc-700" size={24} />
                <p className="text-xs text-zinc-500">No data available for chart: {title}</p>
            </div>
        );
    }

    const commonMargin = { top: 5, right: 10, left: -10, bottom: 0 };
    const commonGrid = <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />;
    const commonXAxis = (
        <XAxis
            dataKey="x"
            stroke="#52525b"
            tick={{ fontSize: 10 }}
            tickFormatter={formatXTick}
            tickLine={false}
            axisLine={false}
        />
    );
    const commonYAxis = (
        <YAxis
            stroke="#52525b"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={45}
            tickFormatter={(v) => yLabel ? `${v}` : v}
        />
    );
    const commonTooltip = <Tooltip content={<ChartTooltip />} />;
    const commonLegend = (
        <Legend
            verticalAlign="top"
            height={30}
            iconType="circle"
            wrapperStyle={{ fontSize: '10px' }}
        />
    );

    const targetBand = targetLow != null && targetHigh != null ? (
        <ReferenceArea y1={targetLow} y2={targetHigh} fill="#10b981" fillOpacity={0.06} />
    ) : null;

    return (
        <div className="w-full bg-zinc-900/60 border border-zinc-800/60 rounded-2xl rounded-tl-sm p-4 space-y-1">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{title}</h4>
            <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    {chartType === 'bar' ? (
                        <BarChart data={merged} margin={commonMargin}>
                            {commonGrid}
                            {commonXAxis}
                            {commonYAxis}
                            {commonTooltip}
                            {commonLegend}
                            {series.map((s) => (
                                <Bar
                                    key={s.name}
                                    dataKey={s.name}
                                    name={s.name}
                                    fill={s.color}
                                    radius={[3, 3, 0, 0]}
                                    isAnimationActive={false}
                                />
                            ))}
                        </BarChart>
                    ) : (
                        /* use ComposedChart for line, band, and composed to allow mixed series rendering */
                        <ComposedChart data={merged} margin={commonMargin}>
                            {commonGrid}
                            {commonXAxis}
                            {commonYAxis}
                            {commonTooltip}
                            {commonLegend}
                            {targetBand}
                            {bands?.map((b) => (
                                <Area
                                    key={b.name}
                                    type="monotone"
                                    dataKey={`${b.name}_range`}
                                    name={b.name}
                                    fill={b.color}
                                    fillOpacity={0.3}
                                    stroke="none"
                                    isAnimationActive={false}
                                />
                            ))}
                            {series.map((s) => {
                                // Default to line unless explicitly set or chartType is bar (handled above)
                                if (s.type === 'bar') {
                                    return (
                                        <Bar
                                            key={s.name}
                                            dataKey={s.name}
                                            name={s.name}
                                            fill={s.color}
                                            radius={[3, 3, 0, 0]}
                                            isAnimationActive={false}
                                        />
                                    );
                                }
                                return (
                                    <Line
                                        key={s.name}
                                        type="monotone"
                                        dataKey={s.name}
                                        name={s.name}
                                        stroke={s.color}
                                        strokeWidth={2}
                                        dot={false}
                                        connectNulls
                                        isAnimationActive={false}
                                    />
                                );
                            })}
                        </ComposedChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}
