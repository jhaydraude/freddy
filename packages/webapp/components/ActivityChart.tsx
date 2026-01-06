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

interface ActivityChartProps {
    data: any[];
    isLoading?: boolean;
}

export default function ActivityChart({ data, isLoading }: ActivityChartProps) {
    const chartData = useMemo(() => {
        return data.map(item => ({
            timestamp: item.timestamp,
            steps: item.steps?.count || 0,
            hrAvg: item.heartRate?.bpm_avg || null,
            hrMin: item.heartRate?.bpm_min || null,
            hrMax: item.heartRate?.bpm_max || null,
            // HrRange is for the Area chart to create a band
            hrRange: item.heartRate ? [item.heartRate.bpm_min, item.heartRate.bpm_max] : null,
            raw: item
        }));
    }, [data]);

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
        <div className="w-full h-[250px] bg-zinc-900/40 rounded-xl border border-zinc-800/50 p-4 shadow-sm backdrop-blur-sm">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 px-2">Activity</h3>
            <ResponsiveContainer width="100%" height="80%">
                <ComposedChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                        dataKey="timestamp"
                        tickFormatter={(str) => format(new Date(str), 'HH:mm')}
                        stroke="#52525b"
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={40}
                    />

                    {/* Left Axis: Steps */}
                    <YAxis
                        yAxisId="steps"
                        stroke="#8b5cf6"
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                        orientation="left"
                    />

                    {/* Right Axis: Heart Rate */}
                    <YAxis
                        yAxisId="hr"
                        domain={['dataMin - 5', 'dataMax + 5']}
                        stroke="#f43f5e"
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
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
