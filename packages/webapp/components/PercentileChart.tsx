'use client';

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
    ReferenceLine
} from 'recharts';

interface PercentileDataRecord {
    timestamp: number;
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
}

interface PercentileChartProps {
    data: PercentileDataRecord[];
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderTooltip = (props: any) => {
        const { active, payload, label } = props;
        if (active && payload && payload.length) {
            return (
                <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl shadow-2xl backdrop-blur-md">
                    <p className="text-xs font-bold text-zinc-500 mb-2 border-b border-zinc-800 pb-1">
                        Time: {label}:00
                    </p>
                    <div className="space-y-1.5">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {payload.map((p: any) => {
                            const valStr = Array.isArray(p.value)
                                ? `${p.value[0]?.toFixed(units === 'mmol/L' ? 1 : 0)} - ${p.value[1]?.toFixed(units === 'mmol/L' ? 1 : 0)}`
                                : p.value?.toFixed(units === 'mmol/L' ? 1 : 0);

                            return (
                                <div key={p.dataKey} className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></div>
                                        <span className="text-xs text-zinc-400 capitalize">{p.name === 'p50' ? 'Median' : p.name}:</span>
                                    </div>
                                    <span className="text-xs font-mono font-bold text-white">
                                        {valStr}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }
        return null;
    };

    const formattedData = data.map(d => ({
        ...d,
        range90: [d.p5, d.p95],
        range50: [d.p25, d.p75]
    }));

    return (
        <div className="w-full h-[450px] bg-zinc-900/40 rounded-2xl border border-zinc-800/50 p-6 pt-2">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Glucose Percentiles (24h AGP style)</h3>
            <ResponsiveContainer width="100%" height="90%">
                <ComposedChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                    <Tooltip content={renderTooltip} offset={60} />
                    <Legend
                        verticalAlign="top"
                        height={36}
                        iconType="circle"
                        wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
                        formatter={(value) => <span className="text-zinc-400 uppercase tracking-wider font-bold">{value === 'p50' ? 'Median' : value}</span>}
                    />

                    <ReferenceLine y={targetHigh} stroke="#facc15" strokeWidth={1} strokeOpacity={0.8} />
                    <ReferenceLine y={targetLow} stroke="#ef4444" strokeWidth={1} strokeOpacity={0.8} />

                    {/* Outer Area: 5th to 95th Percentile */}
                    <Area
                        type="monotone"
                        dataKey="range90"
                        name="5% - 95%"
                        fill="#10b981"
                        fillOpacity={0.25}
                        stroke="none"
                        isAnimationActive={false}
                    />

                    {/* Inner Area: 25th to 75th Percentile */}
                    <Area
                        type="monotone"
                        dataKey="range50"
                        name="25% - 75%"
                        fill="#34d399"
                        fillOpacity={0.6}
                        stroke="none"
                        isAnimationActive={false}
                    />

                    {/* Median Line */}
                    <Line
                        type="monotone"
                        dataKey="p50"
                        name="p50"
                        stroke="#f8fafc"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
