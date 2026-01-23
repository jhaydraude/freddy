'use client';

import { useMemo } from 'react';
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

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const point = payload[0].payload;
            return (
                <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-xl text-sm">
                    <p className="text-zinc-400 mb-2 border-b border-zinc-800 pb-1">
                        {format(new Date(point.timestamp), 'HH:mm')}
                    </p>
                    <div className="space-y-1">
                        {point.steps > 0 && (
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-violet-400 font-medium">Steps</span>
                                <span className="font-bold text-white">{point.steps}</span>
                            </div>
                        )}
                        {point.hrAvg && (
                            <div className="flex flex-col border-t border-zinc-800 pt-1 mt-1">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-rose-400 font-medium">Heart Rate</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="font-bold text-white">{point.hrAvg}</span>
                                        <span className="text-xs text-zinc-500">bpm</span>
                                    </div>
                                </div>
                                {(point.hrMin !== point.hrMax) && (
                                    <div className="text-[10px] text-zinc-500 flex justify-between px-1">
                                        <span>Min: {point.hrMin}</span>
                                        <span>Max: {point.hrMax}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };

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
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 px-2">Activity</h3>
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

                    <Tooltip content={<CustomTooltip />} />

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
                        connectNulls
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
                        connectNulls
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
