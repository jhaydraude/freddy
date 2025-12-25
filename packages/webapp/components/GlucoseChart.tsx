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

export interface VisibleLines {
    glucose: boolean;
    iob: boolean;
    cob: boolean;
    insulinImpact: boolean;
    carbImpact: boolean;
}

interface GlucoseChartProps {
    data: any[];
    isLoading?: boolean;
    visibleLines: VisibleLines;
    onClick?: (data: any) => void;
}

export default function GlucoseChart({ data, isLoading, visibleLines, onClick }: GlucoseChartProps) {
    const chartData = useMemo(() => {
        return data.map(item => ({
            timestamp: item.meta?.status_date || item.glucose?.timestamp,
            sgv: item.glucose?.current?.sgv || null,
            iob: item.iob?.calculated?.totalIOB ?? null,
            cob: item.cob?.calculated?.cob ?? null,
            insulinImpact: item.iob?.calculated?.glucoseImpact ?? null,
            carbImpact: item.cob?.calculated?.glucoseImpact ?? null,
            raw: item
        })).filter(d => d.timestamp).reverse();
    }, [data]);

    // Sort chronological
    const sortedData = useMemo(() => {
        return [...chartData].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [chartData]);

    const CustomTooltip = ({ active, payload, label, units }: any) => {
        if (active && payload && payload.length) {
            const point = payload[0].payload.raw;
            return (
                <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-xl text-sm min-w-[200px]">
                    <p className="text-zinc-400 mb-2 border-b border-zinc-800 pb-1">{format(new Date(point.meta?.status_date || new Date().toISOString()), 'HH:mm')}</p>

                    <div className="space-y-1">
                        {visibleLines.glucose && (
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-emerald-400 font-medium">Glucose</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="font-bold text-white">{point.glucose?.current?.sgv}</span>
                                    <span className="text-xs text-zinc-500">{units}</span>
                                </div>
                            </div>
                        )}
                        {visibleLines.iob && (
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-blue-400 font-medium">IOB</span>
                                <span className="font-mono text-zinc-200">{(point.iob?.calculated?.totalIOB ?? 0).toFixed(1)} u</span>
                            </div>
                        )}
                        {visibleLines.cob && (
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-amber-400 font-medium">COB</span>
                                <span className="font-mono text-zinc-200">{(point.cob?.calculated?.cob ?? 0).toFixed(0)} g</span>
                            </div>
                        )}
                        {visibleLines.insulinImpact && (
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-indigo-400 font-medium">Ins. Impact</span>
                                <span className="font-mono text-zinc-200">{(point.iob?.calculated?.glucoseImpact ?? 0).toFixed(1)}</span>
                            </div>
                        )}
                        {visibleLines.carbImpact && (
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-rose-400 font-medium">Carb Impact</span>
                                <span className="font-mono text-zinc-200">{(point.cob?.calculated?.glucoseImpact ?? 0).toFixed(1)}</span>
                            </div>
                        )}
                    </div>
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
            <div className="w-full h-[350px] flex items-center justify-center bg-zinc-950/50 rounded-xl border border-zinc-800 animate-pulse">
                <span className="text-zinc-500">Loading glucose data...</span>
            </div>
        );
    }

    if (sortedData.length === 0) {
        return (
            <div className="w-full h-[350px] flex items-center justify-center bg-zinc-950/50 rounded-xl border border-zinc-800">
                <span className="text-zinc-500">No data available for this period</span>
            </div>
        );
    }

    return (
        <div className="w-full h-[400px] bg-zinc-900/40 rounded-xl border border-zinc-800/50 p-4 shadow-sm backdrop-blur-sm">
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

                    {/* Left Axis: Glucose */}
                    <YAxis
                        yAxisId="left"
                        domain={yDomain}
                        stroke="#52525b"
                        tick={{ fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                    />

                    {/* Right Axis: Other Metrics */}
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#52525b"
                        tick={{ fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                        // Only show if secondary metrics are visible
                        hide={!visibleLines.iob && !visibleLines.cob && !visibleLines.insulinImpact && !visibleLines.carbImpact}
                    />

                    <Tooltip
                        content={<CustomTooltip units={units} />}
                        cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />

                    {visibleLines.glucose && (
                        <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="sgv"
                            stroke="#10b981"
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                            animationDuration={1000}
                            connectNulls
                        />
                    )}

                    {visibleLines.iob && (
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="iob"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0, fill: '#fff' }}
                            animationDuration={1000}
                            connectNulls
                        />
                    )}

                    {visibleLines.cob && (
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="cob"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0, fill: '#fff' }}
                            animationDuration={1000}
                            connectNulls
                        />
                    )}

                    {visibleLines.insulinImpact && (
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="insulinImpact"
                            stroke="#6366f1"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0, fill: '#fff' }}
                            animationDuration={1000}
                            connectNulls
                        />
                    )}

                    {visibleLines.carbImpact && (
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="carbImpact"
                            stroke="#f43f5e"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0, fill: '#fff' }}
                            animationDuration={1000}
                            connectNulls
                        />
                    )}

                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
