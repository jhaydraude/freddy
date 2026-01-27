'use client';

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    ReferenceArea
} from 'recharts';

interface PercentileChartProps {
    data: any[];
    units?: string;
    targetLow?: number;
    targetHigh?: number;
    isLoading?: boolean;
}

export default function PercentileChart({ data, units = 'mg/dL', targetLow = 70, targetHigh = 180, isLoading }: PercentileChartProps) {
    if (isLoading) {
        return (
            <div className="w-full h-[400px] flex items-center justify-center bg-zinc-900/40 rounded-2xl border border-zinc-800/50">
                <span className="text-zinc-500 animate-pulse">Loading statistics...</span>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-[400px] flex items-center justify-center bg-zinc-900/40 rounded-2xl border border-zinc-800/50">
                <span className="text-zinc-500">No data available for this range</span>
            </div>
        );
    }

    const yMax = units === 'mmol/L' ? 20 : 350;

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl shadow-2xl backdrop-blur-md">
                    <p className="text-xs font-bold text-zinc-500 mb-2 border-b border-zinc-800 pb-1">
                        Time: {label}:00
                    </p>
                    <div className="space-y-1.5">
                        {payload.map((p: any) => (
                            <div key={p.dataKey} className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></div>
                                    <span className="text-xs text-zinc-400 capitalize">{p.name === 'p50' ? 'Median' : p.name}:</span>
                                </div>
                                <span className="text-xs font-mono font-bold text-white">
                                    {p.value?.toFixed(units === 'mmol/L' ? 1 : 0)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="w-full h-[450px] bg-zinc-900/40 rounded-2xl border border-zinc-800/50 p-6 pt-2">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Glucose Percentiles (24h AGP style)</h3>
            <ResponsiveContainer width="100%" height="90%">
                <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                        dataKey="timestamp"
                        stroke="#52525b"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(h) => `${h}:00`}
                        interval={2}
                    />
                    <YAxis
                        stroke="#52525b"
                        tick={{ fontSize: 10 }}
                        domain={[0, 'auto']}
                        width={40}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        verticalAlign="top"
                        height={36}
                        iconType="circle"
                        wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
                        formatter={(value) => <span className="text-zinc-400 uppercase tracking-wider font-bold">{value === 'p50' ? 'Median' : value}</span>}
                    />

                    <ReferenceArea
                        y1={targetLow}
                        y2={targetHigh}
                        fill="#10b981"
                        fillOpacity={0.05}
                    />

                    {/* Percentile Lines */}
                    <Line
                        type="monotone"
                        dataKey="p95"
                        name="p95"
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        strokeDasharray="5 5"
                        dot={false}
                        isAnimationActive={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="p75"
                        name="p75"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="p50"
                        name="p50"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={false}
                        isAnimationActive={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="p25"
                        name="p25"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="p5"
                        name="p5"
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        strokeDasharray="5 5"
                        dot={false}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
