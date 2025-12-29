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
import { X, TrendingUp, TrendingDown, Info, Zap, Beef, RefreshCcw } from 'lucide-react';

interface AnalysisTileProps {
    data: any;
    isLoading: boolean;
    onClose: () => void;
}

export default function AnalysisTile({ data, isLoading, onClose }: AnalysisTileProps) {
    const chartData = useMemo(() => {
        if (!data) return [];

        const combined: any[] = [];
        const units = data.statusAt?.glucose?.units || 'mg/dL';
        const isMmol = units.toLowerCase().includes('mmol');

        // 1. History Before (1h)
        if (data.historyBefore) {
            data.historyBefore.forEach((item: any) => {
                combined.push({
                    timestamp: item.meta?.status_date || item.glucose?.timestamp,
                    actual: item.glucose?.current?.sgv,
                    iob: item.iob?.calculated?.totalIOB,
                    cob: item.cob?.calculated?.cob,
                    pendingCOB: item.cob?.calculated?.pendingCOB ?? 0,
                    activeCOB: item.cob?.calculated?.activeCOB ?? 0,
                    type: 'history'
                });
            });
        }

        // 2. Prediction (4h)
        if (data.prediction) {
            data.prediction.forEach((item: any) => {
                combined.push({
                    timestamp: item.timestamp,
                    projection: item.sgv,
                    iob: item.iob,
                    cob: item.cob,
                    pendingCOB: item.pendingCOB ?? 0,
                    activeCOB: item.activeCOB ?? 0,
                    type: 'prediction'
                });
            });
        }

        // 3. History After (4h)
        if (data.historyAfter) {
            data.historyAfter.forEach((item: any) => {
                // Find if it already exists or add new
                const existing = combined.find(c => c.timestamp === (item.meta?.status_date || item.glucose?.timestamp));
                if (existing) {
                    existing.actual = item.glucose?.current?.sgv;
                    existing.iob = item.iob?.calculated?.totalIOB;
                    existing.cob = item.cob?.calculated?.cob;
                    existing.pendingCOB = item.cob?.calculated?.pendingCOB ?? 0;
                    existing.activeCOB = item.cob?.calculated?.activeCOB ?? 0;
                } else {
                    combined.push({
                        timestamp: item.meta?.status_date || item.glucose?.timestamp,
                        actual: item.glucose?.current?.sgv,
                        iob: item.iob?.calculated?.totalIOB,
                        cob: item.cob?.calculated?.cob,
                        pendingCOB: item.cob?.calculated?.pendingCOB ?? 0,
                        activeCOB: item.cob?.calculated?.activeCOB ?? 0,
                        type: 'history'
                    });
                }
            });
        }

        return combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [data]);

    const attribution = data?.statusAt?.attribution?.timeframes?.find((tf: any) => tf.minutes === 5) ||
        data?.statusAt?.attribution?.timeframes?.[0];

    if (isLoading) {
        return (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 h-[500px] flex items-center justify-center animate-pulse">
                <div className="text-center space-y-4">
                    <RefreshCcw className="mx-auto animate-spin text-zinc-500" size={32} />
                    <p className="text-zinc-500 font-medium">Analyzing point in time...</p>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const units = data.statusAt?.glucose?.units || 'mg/dL';
    const isMmol = units.toLowerCase().includes('mmol');
    const targetPoint = data.statusAt?.meta?.status_date;

    return (
        <div className="bg-zinc-900 border border-emerald-500/20 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <TrendingUp className="text-emerald-400" size={20} />
                    </div>
                    <div>
                        <h3 className="text-white font-bold">Analysis</h3>
                        <p className="text-xs text-zinc-500 font-mono">
                            {format(new Date(targetPoint), 'MMM d, HH:mm:ss')}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
                {/* Chart Section */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis
                                    dataKey="timestamp"
                                    hide
                                />
                                <YAxis
                                    yAxisId="left"
                                    domain={[0, 'auto']}
                                    stroke="#52525b"
                                    tick={{ fontSize: 12 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    domain={[0, 'auto']}
                                    stroke="#52525b"
                                    tick={{ fontSize: 12 }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={40}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                                    itemStyle={{ fontSize: '12px' }}
                                    labelClassName="text-zinc-500 text-xs mb-1"
                                    labelFormatter={(val) => format(new Date(val), 'HH:mm')}
                                    content={({ active, payload, label }) => {
                                        if (active && payload && payload.length) {
                                            const pointData = payload[0].payload;
                                            return (
                                                <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-xl text-xs min-w-[150px] space-y-2">
                                                    <p className="text-zinc-400 border-b border-zinc-800 pb-1">{format(new Date(label), 'HH:mm')}</p>

                                                    {pointData.actual !== undefined && (
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-emerald-400 font-medium">Actual</span>
                                                            <span className="text-white font-mono">{pointData.actual}</span>
                                                        </div>
                                                    )}
                                                    {pointData.projection !== undefined && (
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-emerald-400/70 font-medium">Projected</span>
                                                            <span className="text-white font-mono">{pointData.projection.toFixed(0)}</span>
                                                        </div>
                                                    )}
                                                    {pointData.iob !== undefined && (
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-blue-400 font-medium">IOB</span>
                                                            <span className="text-white font-mono">{pointData.iob.toFixed(1)}u</span>
                                                        </div>
                                                    )}
                                                    {pointData.cob !== undefined && (
                                                        <div className="space-y-0.5 pt-1 border-t border-zinc-800">
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-amber-400 font-medium">COB</span>
                                                                <span className="text-white font-mono">{pointData.cob.toFixed(1)}g</span>
                                                            </div>
                                                            {pointData.pendingCOB > 0 && (
                                                                <div className="text-[10px] text-zinc-500 flex justify-between px-1">
                                                                    <span>Active: {pointData.activeCOB.toFixed(1)}g</span>
                                                                    <span>Pending: {pointData.pendingCOB.toFixed(1)}g</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <ReferenceLine yAxisId="left" x={targetPoint} stroke="#10b981" strokeDasharray="3 3" />

                                {/* Actual History */}
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="actual"
                                    stroke="#10b981"
                                    strokeWidth={3}
                                    dot={false}
                                    connectNulls
                                />

                                {/* Projection */}
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="projection"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    connectNulls
                                />

                                {/* IOB Trend */}
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="iob"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={false}
                                    connectNulls
                                />

                                {/* COB Trend */}
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="cob"
                                    stroke="#f59e0b"
                                    strokeWidth={2}
                                    dot={false}
                                    connectNulls
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex items-center justify-center gap-6 text-xs mt-2">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 bg-emerald-500"></div>
                            <span className="text-zinc-400">Actual Data</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 bg-emerald-500 border-t-2 border-dashed border-zinc-900"></div>
                            <span className="text-zinc-400">4h Projection</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 bg-blue-500"></div>
                            <span className="text-zinc-400">IOB</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 bg-amber-500"></div>
                            <span className="text-zinc-400">COB</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-px h-4 bg-emerald-500 border-l border-dashed border-zinc-900"></div>
                            <span className="text-zinc-400">Selected Time</span>
                        </div>
                    </div>
                </div>

                {/* Attribution Panel */}
                <div className="space-y-6">
                    <div>
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Info size={14} />
                            Attribution (5min)
                        </h4>

                        <div className="space-y-3">
                            <div className="p-3 bg-zinc-800/40 rounded-xl border border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-blue-500/10 rounded-lg">
                                        <Zap size={16} className="text-blue-400" />
                                    </div>
                                    <span className="text-zinc-300 text-sm">Insulin Impact</span>
                                </div>
                                <span className="text-blue-400 font-mono font-bold">
                                    {attribution?.components?.insulin?.value > 0 ? '-' : ''}{Math.abs(attribution?.components?.insulin?.value || 0).toFixed(1)}
                                </span>
                            </div>

                            <div className="p-3 bg-zinc-800/40 rounded-xl border border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                        <Beef size={16} className="text-amber-400" />
                                    </div>
                                    <span className="text-zinc-300 text-sm">Carb Impact</span>
                                </div>
                                <span className="text-amber-400 font-mono font-bold">
                                    +{attribution?.components?.carbs?.value?.toFixed(1) || '0.0'}
                                </span>
                            </div>

                            <div className="p-3 bg-zinc-800/40 rounded-xl border border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-cyan-500/10 rounded-lg">
                                        <RefreshCcw size={16} className="text-cyan-400" />
                                    </div>
                                    <span className="text-zinc-300 text-sm">Basal Deviation</span>
                                </div>
                                <span className="text-cyan-400 font-mono font-bold">
                                    {attribution?.components?.basal?.value >= 0 ? '+' : ''}{attribution?.components?.basal?.value?.toFixed(1) || '0.0'}
                                </span>
                            </div>

                            <div className="p-3 bg-zinc-950/40 rounded-xl border border-dashed border-zinc-800 flex items-center justify-between">
                                <span className="text-zinc-500 text-sm">Unexplained</span>
                                <span className="text-zinc-400 font-mono">
                                    {attribution?.components?.unexplained >= 0 ? '+' : ''}{attribution?.components?.unexplained?.toFixed(1) || '0.0'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-zinc-800">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-500 italic">Net Predicted Change</span>
                            <span className={`font-bold ${attribution?.glucoseChange?.predicted < 0 ? 'text-blue-400' : 'text-amber-400'}`}>
                                {attribution?.glucoseChange?.predicted >= 0 ? '+' : ''}{attribution?.glucoseChange?.predicted?.toFixed(1)} {units}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
