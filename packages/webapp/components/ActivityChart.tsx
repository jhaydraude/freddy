'use client';

import { useState, useCallback, useMemo } from 'react';
import {
    ComposedChart,
    Bar,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { CHART_LAYOUT } from '@/lib/chartUtils';

interface ActivityChartProps {
    data: any[]; // Pre-transformed and filtered
    isLoading?: boolean;
    timeDomain?: [number, number];
}

export default function ActivityChart({ data, isLoading, timeDomain }: ActivityChartProps) {
    const chartData = data;
    const [hoverData, setHoverData] = useState<any>(null);

    // Invisible tooltip that captures data for the fixed header bar
    const DataCapture = useCallback(({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const point = payload[0].payload;
            // Use setTimeout to avoid setState during render
            setTimeout(() => setHoverData(point), 0);
        } else {
            setTimeout(() => setHoverData(null), 0);
        }
        return null; // Render nothing — data shown in header bar instead
    }, []);

    if (isLoading) {
        return (
            <div className="w-full h-[200px] flex items-center justify-center bg-zinc-950/30 rounded-xl border border-zinc-800/50 animate-pulse">
                <span className="text-zinc-500 text-sm">Loading activity data...</span>
            </div>
        );
    }

    const hasData = chartData.some(d => d.steps > 0 || d.hrAvg !== null);

    if (!hasData) {
        return (
            <div className="w-full h-[150px] flex items-center justify-center bg-zinc-950/30 rounded-xl border border-zinc-800/50">
                <span className="text-zinc-500 text-sm">No activity recorded for this period</span>
            </div>
        );
    }

    return (
        <div className="w-full h-[180px] bg-zinc-900/40 rounded-xl border border-zinc-800/50 p-4 shadow-sm backdrop-blur-sm">
            {/* Header row: title + hover data bar */}
            <div className="relative flex items-center mb-2 px-2 h-5">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest shrink-0">Activity</h3>

                {hoverData && (
                    <>
                        {/* Time — fixed position after title */}
                        <span className="text-xs font-mono text-zinc-500 ml-4 shrink-0">
                            {format(new Date(hoverData.timestamp), 'HH:mm')}
                        </span>

                        {/* Values — centered over the remaining space */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-in fade-in duration-150">
                            <div className="flex items-center gap-5 text-xs font-mono">
                                {hoverData.steps > 0 && (
                                    <span className="text-violet-400">
                                        <span className="text-zinc-600 mr-1">Steps</span>
                                        {hoverData.steps}
                                    </span>
                                )}
                                {hoverData.hrAvg && (
                                    <span className="text-rose-400">
                                        <span className="text-zinc-600 mr-1">HR</span>
                                        {hoverData.hrAvg}
                                        {hoverData.hrMin !== hoverData.hrMax && (
                                            <span className="text-zinc-600 text-[10px] ml-1">
                                                ({hoverData.hrMin}–{hoverData.hrMax})
                                            </span>
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <ResponsiveContainer width="100%" height="80%">
                <ComposedChart
                    data={chartData}
                    margin={{ ...CHART_LAYOUT.MARGIN, right: CHART_LAYOUT.Y_AXIS_WIDTH_MINIMAL + 80 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                        {...CHART_LAYOUT.getXAxisProps(timeDomain)}
                    />

                    {/* Left Axis: Steps */}
                    <YAxis
                        yAxisId="steps"
                        stroke="#8b5cf6"
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={CHART_LAYOUT.Y_AXIS_WIDTH_GLUCOSE}
                        orientation="left"
                    />

                    {/* Right Axis: Heart Rate */}
                    <YAxis
                        yAxisId="hr"
                        domain={['auto', 'auto']}
                        stroke="#f43f5e"
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={CHART_LAYOUT.Y_AXIS_WIDTH_SECONDARY}
                        orientation="right"
                    />

                    <Tooltip
                        content={<DataCapture />}
                        cursor={{ stroke: '#52525b', strokeWidth: 1 }}
                    />

                    {/* Steps Bar */}
                    <Bar
                        yAxisId="steps"
                        dataKey="steps"
                        fill="#8b5cf6"
                        radius={[2, 2, 0, 0]}
                        opacity={0.6}
                        barSize={8}
                    />

                    {/* HR Range Band */}
                    <Area
                        yAxisId="hr"
                        type="monotone"
                        dataKey="hrRange"
                        stroke="none"
                        fill="#f43f5e"
                        fillOpacity={0.15}
                        connectNulls={false}
                    />

                    {/* HR Average Line */}
                    <Line
                        yAxisId="hr"
                        type="monotone"
                        dataKey="hrAvg"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0, fill: '#fff' }}
                        connectNulls={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
