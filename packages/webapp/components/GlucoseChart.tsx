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
    ReferenceArea,
    ReferenceLine
} from 'recharts';
import { format } from 'date-fns';

interface GlucoseDataPoint {
    timestamp: string;
    sgv: number | null;
    prediction?: number | null;
}

interface GlucoseChartProps {
    data: any[];
    isLoading?: boolean;
    onClick?: (data: any) => void;
}

export default function GlucoseChart({ data, isLoading, onClick }: GlucoseChartProps) {
    const chartData = useMemo(() => {
        return data.map(item => ({
            timestamp: item.meta?.status_date || item.glucose?.timestamp,
            sgv: item.glucose?.current?.sgv || null,
            raw: item
        })).filter(d => d.timestamp).reverse(); // Recharts expects chronological order usually, ensure sorts
    }, [data]);

    // Sort chronological
    const sortedData = useMemo(() => {
        return [...chartData].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [chartData]);

    const CustomTooltip = ({ active, payload, label, units }: any) => {
        if (active && payload && payload.length) {
            const point = payload[0].payload;
            return (
                <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-xl text-sm">
                    <p className="text-zinc-400 mb-1">{format(new Date(point.timestamp), 'HH:mm')}</p>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span className="font-bold text-white text-lg">{point.sgv}</span>
                        <span className="text-zinc-500">{units}</span>
                    </div>
                    {/* Add more details here later */}
                </div>
            );
        }
        return null;
    };

    // Determine units from data
    const units = data.length > 0 ? data[0].glucose?.units || 'mg/dL' : 'mg/dL';
    const isMmol = units.toLowerCase().includes('mmol');
    const yDomain: [number | 'auto', number | 'auto'] = isMmol ? [0, 'auto'] : [40, 'auto'];

    if (isLoading) {
        return (
            <div className="w-full h-[300px] flex items-center justify-center bg-zinc-950/50 rounded-xl border border-zinc-800 animate-pulse">
                <span className="text-zinc-500">Loading glucose data...</span>
            </div>
        );
    }

    if (sortedData.length === 0) {
        return (
            <div className="w-full h-[300px] flex items-center justify-center bg-zinc-950/50 rounded-xl border border-zinc-800">
                <span className="text-zinc-500">No data available for this period</span>
            </div>
        );
    }

    return (
        <div className="w-full h-[350px] bg-zinc-900/40 rounded-xl border border-zinc-800/50 p-4 shadow-sm backdrop-blur-sm">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                    data={sortedData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onClick={(e) => {
                        if (e && e.activePayload && e.activePayload.length > 0) {
                            onClick?.(e.activePayload[0].payload.raw);
                        }
                    }}
                >
                    <defs>
                        <linearGradient id="colorSgv" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                    </defs>

                    {/* Target Range Background - Adjusted for units */}
                    {isMmol ? (
                        <ReferenceArea y1={3.9} y2={10} fill="#10b981" fillOpacity={0.05} />
                    ) : (
                        <ReferenceArea y1={70} y2={180} fill="#10b981" fillOpacity={0.05} />
                    )}

                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />

                    <XAxis
                        dataKey="timestamp"
                        tickFormatter={(str) => format(new Date(str), 'HH:mm')}
                        stroke="#52525b"
                        tick={{ fontSize: 12 }}
                        tickMargin={10}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={30}
                    />

                    <YAxis
                        domain={yDomain}
                        stroke="#52525b"
                        tick={{ fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                    />

                    <Tooltip
                        content={<CustomTooltip units={units} />}
                        cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />

                    <Line
                        type="monotone"
                        dataKey="sgv"
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
