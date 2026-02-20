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
    ReferenceLine
} from 'recharts';
import { format } from 'date-fns';
import { CHART_LAYOUT } from '@/lib/chartUtils';

interface ImpactChartProps {
    data: any[]; // Pre-transformed and filtered
    isLoading?: boolean;
    timeDomain?: [number, number];
}

/**
 * Generate a heuristic hint explaining why the residual might exist.
 */
function getResidualHint(residual: number, cob: number | null, activityImpact: number, timestamp: number): string | null {
    if (Math.abs(residual) <= 3) return null;

    if (residual > 3) {
        // If high positive residual occurs during high predicted negative activity impact,
        // it suggests the activity model is being too aggressive for this short/sudden burst.
        if (activityImpact < -4 && residual > Math.abs(activityImpact) * 0.6) {
            return 'Activity impact potentially overestimated (miscalibration)';
        }
        if (cob && cob > 0) return 'Carbs absorbing faster than modeled';

        // Dawn Phenomenon / Feet on Floor effect typically between 4am and 11am
        const hour = new Date(timestamp).getHours();
        const isMorning = hour >= 4 && hour <= 11;

        return isMorning ? 'Possible unlogged carbs or dawn effect' : 'Possible unlogged carbs';
    }
    // residual < -3
    if (Math.abs(activityImpact) > 0) return 'Possible delayed exercise effect';
    return 'Increased insulin sensitivity?';
}

/** Format a signed number with + prefix */
const signed = (v: number | null | undefined, decimals = 1) => {
    if (v == null) return '--';
    return (v >= 0 ? '+' : '') + v.toFixed(decimals);
};

export default function ImpactChart({ data, isLoading, timeDomain }: ImpactChartProps) {
    const chartData = data;
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

    if (isLoading || chartData.length === 0) {
        return <div className="w-full h-[150px] bg-zinc-900/40 rounded-xl border border-zinc-800/50 flex items-center justify-center">
            <span className="text-zinc-500 text-sm">Loading impact data...</span>
        </div>;
    }

    return (
        <div className="w-full h-[280px] bg-zinc-900/40 rounded-xl border border-zinc-800/50 p-4 shadow-sm backdrop-blur-sm">
            {/* Header row: title + hover data */}
            <div className="relative flex items-center mb-3 px-2 h-10">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest shrink-0">Glucose Impact (Δ)</h3>

                {hoverData && (
                    <>
                        {/* Time — fixed position after title */}
                        <span className="text-xs font-mono text-zinc-500 ml-4 shrink-0">
                            {format(new Date(hoverData.timestamp), 'HH:mm')}
                        </span>

                        {/* Values + Hint stacked in the center */}
                        <div className="absolute inset-x-0 inset-y-0 flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
                            {/* Row 1: Values */}
                            <div className="flex items-center gap-4 text-xs font-mono">
                                <span className="text-emerald-400">
                                    <span className="text-zinc-600 mr-1">Δ</span>
                                    {signed(hoverData.actualDelta)}
                                </span>
                                <span className="text-emerald-500/70">
                                    <span className="text-zinc-600 mr-1">Pred</span>
                                    {signed(hoverData.totalImpact)}
                                </span>
                                <span className="text-zinc-600">│</span>
                                <span className="text-orange-300">
                                    <span className="text-zinc-600 mr-1">Carb</span>
                                    {signed(hoverData.carbImpact)}
                                </span>
                                <span className="text-blue-300">
                                    <span className="text-zinc-600 mr-1">Ins</span>
                                    {signed(hoverData.insulinImpact)}
                                </span>
                                <span className="text-violet-400">
                                    <span className="text-zinc-600 mr-1">Act</span>
                                    {signed(hoverData.activityImpact)}
                                </span>
                                {hoverData.residual != null && Math.abs(hoverData.residual) > 0.5 && (
                                    <span className={hoverData.residual >= 0 ? 'text-amber-400' : 'text-pink-400'}>
                                        <span className="text-zinc-600 mr-1">Res</span>
                                        {signed(hoverData.residual)}
                                    </span>
                                )}
                            </div>

                            {/* Row 2: Hint (centered below) */}
                            {hoverData.residual != null && (
                                <div className="text-[10px] text-orange-400/90 italic h-3 mt-0.5">
                                    {getResidualHint(
                                        hoverData.residual,
                                        hoverData.raw?.cob?.calculated?.cob ?? null,
                                        hoverData.activityImpact ?? 0,
                                        hoverData.timestamp
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <ResponsiveContainer width="100%" height="85%">
                <ComposedChart
                    data={chartData}
                    margin={{
                        ...CHART_LAYOUT.MARGIN,
                        left: 20, // 20 (margin) + 40 (axis) = 60px left total (matches ActivityChart)
                        right: 80 // 80 (margin) + 40 (axis) = 120px right total (matches ActivityChart)
                    }}
                >
                    <defs>
                        {/* Split gradient for residual: amber above zero, pink below */}
                        <linearGradient id="residualGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.25} />
                            <stop offset="50%" stopColor="#fbbf24" stopOpacity={0.08} />
                            <stop offset="50%" stopColor="#f472b6" stopOpacity={0.08} />
                            <stop offset="100%" stopColor="#f472b6" stopOpacity={0.25} />
                        </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                        {...CHART_LAYOUT.getXAxisProps(timeDomain)}
                    />
                    {/* Mirrored axes for visual alignment */}
                    <YAxis
                        yAxisId="impact"
                        axisLine={false}
                        tickLine={false}
                        width={CHART_LAYOUT.Y_AXIS_WIDTH_SECONDARY}
                        orientation="left"
                        tick={{ fontSize: 10, fill: '#71717a' }}
                        tickFormatter={(v) => v >= 0 ? `+${v.toFixed(0)}` : v.toFixed(0)}
                        domain={([min, max]) => {
                            const absMax = Math.min(Math.max(Math.abs(min || 0), Math.abs(max || 0), 5), 20);
                            return [-absMax, absMax];
                        }}
                    />
                    <YAxis
                        yAxisId="impact"
                        axisLine={false}
                        tickLine={false}
                        width={CHART_LAYOUT.Y_AXIS_WIDTH_SECONDARY}
                        orientation="right"
                        tick={{ fontSize: 10, fill: '#71717a' }}
                        tickFormatter={(v) => v >= 0 ? `+${v.toFixed(0)}` : v.toFixed(0)}
                        domain={([min, max]) => {
                            const absMax = Math.min(Math.max(Math.abs(min || 0), Math.abs(max || 0), 5), 20);
                            return [-absMax, absMax];
                        }}
                    />

                    <ReferenceLine yAxisId="impact" y={0} stroke="#3f3f46" strokeWidth={1} />

                    <Tooltip
                        content={<DataCapture />}
                        cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />

                    {/* Residual shaded area — the gap between predicted and actual */}
                    <Area
                        yAxisId="impact"
                        type="monotone"
                        dataKey="residual"
                        fill="url(#residualGradient)"
                        stroke="none"
                        animationDuration={1000}
                        connectNulls
                        isAnimationActive={false}
                    />

                    {/* Component lines — thin and subtle */}
                    <Line
                        yAxisId="impact"
                        type="monotone"
                        dataKey="carbImpact"
                        stroke="#fb923c"
                        strokeWidth={1.5}
                        strokeOpacity={0.7}
                        dot={false}
                        activeDot={{ r: 3, strokeWidth: 0, fill: '#fb923c' }}
                        animationDuration={1000}
                        connectNulls
                    />

                    <Line
                        yAxisId="impact"
                        type="monotone"
                        dataKey="insulinImpact"
                        stroke="#60a5fa"
                        strokeWidth={1.5}
                        strokeOpacity={0.7}
                        dot={false}
                        activeDot={{ r: 3, strokeWidth: 0, fill: '#60a5fa' }}
                        animationDuration={1000}
                        connectNulls
                    />

                    <Line
                        yAxisId="impact"
                        type="monotone"
                        dataKey="activityImpact"
                        stroke="#a78bfa"
                        strokeWidth={1.5}
                        strokeOpacity={0.7}
                        dot={false}
                        activeDot={{ r: 3, strokeWidth: 0, fill: '#a78bfa' }}
                        animationDuration={1000}
                        connectNulls
                    />

                    {/* Predicted total — dashed green */}
                    <Line
                        yAxisId="impact"
                        type="monotone"
                        dataKey="totalImpact"
                        stroke="#10b981"
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 0, fill: '#10b981' }}
                        animationDuration={1000}
                        connectNulls
                    />

                    {/* Actual delta — bold solid green */}
                    <Line
                        yAxisId="impact"
                        type="monotone"
                        dataKey="actualDelta"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 2, fill: '#fff', stroke: '#10b981' }}
                        animationDuration={1000}
                        connectNulls
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
