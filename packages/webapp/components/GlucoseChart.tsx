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
    ReferenceLine,
    Label
} from 'recharts';
import { format } from 'date-fns';

export interface VisibleLines {
    glucose: boolean;
    iob: boolean;
    cob: boolean;
    insulinImpact: boolean;
    carbImpact: boolean;
    basal: boolean;
}

export interface HighlightRange {
    start: string;
    end: string;
    label?: string;
}

interface GlucoseChartProps {
    data: any[];
    isLoading?: boolean;
    visibleLines: VisibleLines;
    onClick?: (data: any) => void;
    highlightRange?: HighlightRange;
}

export default function GlucoseChart({ data, isLoading, visibleLines, onClick, highlightRange }: GlucoseChartProps) {
    // Optimized: Single-pass transformation - filter, map, and sort in one operation
    const chartData = useMemo(() => {
        return data
            .filter(item => item.meta?.status_date || item.glucose?.timestamp)
            .map(item => ({
                timestamp: new Date(item.meta?.status_date || item.glucose?.timestamp).getTime(),
                sgv: item.glucose?.current?.sgv || null,
                iob: item.iob?.calculated?.totalIOB ?? null,
                cob: item.cob?.calculated?.cob ?? null,
                pendingCOB: item.cob?.calculated?.pendingCOB ?? 0,
                activeCOB: item.cob?.calculated?.activeCOB ?? 0,
                insulinImpact: item.iob?.calculated?.glucoseImpact ?? null,
                carbImpact: item.cob?.calculated?.glucoseImpact ?? null,
                basal: item.pump?.basal?.scheduledRate ?? null,
                raw: item
            }))
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [data]);

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
                            <div className="space-y-0.5 border-t border-zinc-800 pt-1 mt-1">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-amber-400 font-medium">COB</span>
                                    <span className="font-mono text-zinc-200">{(point.cob?.calculated?.cob ?? 0).toFixed(1)} g</span>
                                </div>
                                {(point.cob?.calculated?.pendingCOB ?? 0) > 0 && (
                                    <div className="text-[10px] text-zinc-500 flex justify-between px-1">
                                        <span>Active: {point.cob.calculated.activeCOB.toFixed(1)}g</span>
                                        <span>Pending: {point.cob.calculated.pendingCOB.toFixed(1)}g</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {visibleLines.basal && (
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-cyan-400 font-medium">Basal</span>
                                <span className="font-mono text-zinc-200">{(point.pump?.basal?.scheduledRate ?? 0).toFixed(2)} u/hr</span>
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

    if (chartData.length === 0) {
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
                    data={chartData}
                    margin={{ top: 20, right: 10, left: 10, bottom: 0 }}
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
                        <ReferenceArea yAxisId="left-glucose" y1={3.9} y2={10} fill="#10b981" fillOpacity={0.05} />
                    ) : (
                        <ReferenceArea yAxisId="left-glucose" y1={70} y2={180} fill="#10b981" fillOpacity={0.05} />
                    )}

                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />

                    <XAxis
                        dataKey="timestamp"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(val) => format(new Date(val), 'HH:mm')}
                        stroke="#52525b"
                        tick={{ fontSize: 12 }}
                        tickMargin={10}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={30}
                    />

                    {/* Left Axis 1: Glucose (Emerald) */}
                    <YAxis
                        yAxisId="left-glucose"
                        domain={yDomain}
                        stroke="#10b981"
                        tick={{ fontSize: 10, fill: '#10b981' }}
                        axisLine={false}
                        tickLine={false}
                        width={35}
                    >
                        <Label value={units} angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} />
                    </YAxis>

                    {/* Left Axis 2: Impacts (Indigo/Rose) */}
                    <YAxis
                        yAxisId="left-impact"
                        orientation="left"
                        stroke="#818cf8"
                        tick={{ fontSize: 10, fill: '#818cf8' }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                        hide={!visibleLines.insulinImpact && !visibleLines.carbImpact}
                        domain={['auto', 'auto']}
                    >
                        <Label value="Δ" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#818cf8', fontSize: 10, fontWeight: 'bold' }} />
                    </YAxis>

                    {/* Right Axis 1: Insulin (Cyan) */}
                    <YAxis
                        yAxisId="right-insulin"
                        orientation="right"
                        stroke="#06b6d4"
                        tick={{ fontSize: 10, fill: '#06b6d4' }}
                        axisLine={false}
                        tickLine={false}
                        width={35}
                        hide={!visibleLines.iob && !visibleLines.basal}
                        domain={[0, 'auto']}
                    >
                        <Label value="U" angle={90} position="insideRight" style={{ textAnchor: 'middle', fill: '#06b6d4', fontSize: 10, fontWeight: 'bold' }} />
                    </YAxis>

                    {/* Right Axis 2: Carbs (Amber) */}
                    <YAxis
                        yAxisId="right-carbs"
                        orientation="right"
                        stroke="#f59e0b"
                        tick={{ fontSize: 10, fill: '#f59e0b' }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                        hide={!visibleLines.cob}
                        domain={[0, 'auto']}
                    >
                        <Label value="g" angle={90} position="insideRight" style={{ textAnchor: 'middle', fill: '#f59e0b', fontSize: 10, fontWeight: 'bold' }} />
                    </YAxis>

                    <Tooltip
                        content={<CustomTooltip units={units} />}
                        cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />

                    {visibleLines.glucose && (
                        <Line
                            yAxisId="left-glucose"
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
                            yAxisId="right-insulin"
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
                            yAxisId="right-carbs"
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

                    {visibleLines.basal && (
                        <Line
                            yAxisId="right-insulin"
                            type="stepAfter"
                            dataKey="basal"
                            stroke="#06b6d4"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0, fill: '#fff' }}
                            animationDuration={1000}
                            connectNulls
                        />
                    )}

                    {visibleLines.insulinImpact && (
                        <Line
                            yAxisId="left-impact"
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
                            yAxisId="left-impact"
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

                    {highlightRange && (
                        <ReferenceArea
                            yAxisId="left-glucose"
                            x1={new Date(highlightRange.start).getTime()}
                            x2={new Date(highlightRange.end).getTime()}
                            fill="#3b82f6"
                            fillOpacity={0.15}
                            stroke="#3b82f6"
                            strokeDasharray="3 3"
                        />
                    )}

                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
