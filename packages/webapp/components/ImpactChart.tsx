'use client';

import { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Label
} from 'recharts';
import { format } from 'date-fns';
import { CHART_LAYOUT } from '@/lib/chartUtils';

interface ImpactChartProps {
    data: any[]; // Pre-transformed and filtered
    isLoading?: boolean;
    timeDomain?: [number, number];
}

export default function ImpactChart({ data, isLoading, timeDomain }: ImpactChartProps) {
    const chartData = data;

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const point = payload[0].payload.raw || payload[0].payload;
            if (!point) return null;

            const timestamp = point.timestamp || point.meta?.status_date || point.glucose?.timestamp;

            return (
                <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-xl text-sm min-w-[200px]">
                    <p className="text-zinc-400 mb-2 border-b border-zinc-800 pb-1">
                        {timestamp ? format(new Date(timestamp), 'HH:mm') : 'Unknown Time'}
                    </p>
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-orange-300 font-medium">Carb Impact</span>
                            <span className="font-mono text-zinc-200">{(payload[0]?.payload?.carbImpact ?? 0).toFixed(1)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-blue-300 font-medium">Ins. Impact</span>
                            <span className="font-mono text-zinc-200">{(payload[0]?.payload?.insulinImpact ?? 0).toFixed(1)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-violet-400 font-medium">Act. Impact</span>
                            <span className="font-mono text-zinc-200">{(payload[0]?.payload?.activityImpact ?? 0).toFixed(1)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-t border-zinc-800 pt-1 mt-1 opacity-50">
                            <span className="text-emerald-500/80 font-medium">Actual Δ</span>
                            <span className="font-mono text-zinc-300">
                                {(payload[0]?.payload?.actualDelta ?? 0).toFixed(1)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-emerald-400 font-bold">Predicted Δ</span>
                            <span className={`font-mono ${(payload[0]?.payload?.totalImpact ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {(payload[0]?.payload?.totalImpact ?? 0).toFixed(1)}
                            </span>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    if (isLoading || chartData.length === 0) {
        return <div className="w-full h-[150px] bg-zinc-900/40 rounded-xl border border-zinc-800/50 flex items-center justify-center">
            <span className="text-zinc-500 text-sm">Loading impact data...</span>
        </div>;
    }

    return (
        <div className="w-full h-[280px] bg-zinc-900/40 rounded-xl border border-zinc-800/50 p-4 shadow-sm backdrop-blur-sm">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-2">Glucose Impact (Δ)</h3>
            <ResponsiveContainer width="100%" height="85%">
                <LineChart
                    data={chartData}
                    margin={{ ...CHART_LAYOUT.MARGIN, right: CHART_LAYOUT.TOTAL_RIGHT_SPACE }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                        {...CHART_LAYOUT.getXAxisProps(timeDomain)}
                    />
                    <YAxis
                        yAxisId="impact"
                        axisLine={false}
                        tickLine={false}
                        width={CHART_LAYOUT.Y_AXIS_WIDTH_MINIMAL}
                        orientation="right"
                        domain={([min, max]) => {
                            const absMax = Math.max(Math.abs(min || 0), Math.abs(max || 0), 5);
                            return [-absMax, absMax];
                        }}
                    />

                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }} />

                    <Line
                        yAxisId="impact"
                        type="monotone"
                        dataKey="carbImpact"
                        stroke="#fb923c"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0, fill: '#fff' }}
                        animationDuration={1000}
                        connectNulls
                    />

                    <Line
                        yAxisId="impact"
                        type="monotone"
                        dataKey="insulinImpact"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0, fill: '#fff' }}
                        animationDuration={1000}
                        connectNulls
                    />

                    <Line
                        yAxisId="impact"
                        type="monotone"
                        dataKey="activityImpact"
                        stroke="#a78bfa"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0, fill: '#fff' }}
                        animationDuration={1000}
                        connectNulls
                    />

                    <Line
                        yAxisId="impact"
                        type="monotone"
                        dataKey="actualDelta"
                        stroke="#10b981"
                        strokeWidth={4}
                        strokeOpacity={0.35}
                        dot={false}
                        activeDot={false}
                        animationDuration={1000}
                        connectNulls
                    />

                    <Line
                        yAxisId="impact"
                        type="monotone"
                        dataKey="totalImpact"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                        animationDuration={1000}
                        connectNulls
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
