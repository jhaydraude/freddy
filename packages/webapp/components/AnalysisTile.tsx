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
import { X, TrendingUp, TrendingDown, Info, Zap, Beef, RefreshCcw, MessageSquare, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface AnalysisTileProps {
    data: any;
    isLoading: boolean;
    onClose: () => void;
}

export default function AnalysisTile({ data, isLoading, onClose }: AnalysisTileProps) {
    const [isExplaining, setIsExplaining] = useState(false);
    const [explanation, setExplanation] = useState<string | null>(null);
    const [selectedTimeframe, setSelectedTimeframe] = useState(5);

    const handleExplain = async () => {
        if (!data?.statusAt?.meta?.status_date || isExplaining) return;

        setIsExplaining(true);
        try {
            const response = await fetch(`/api/explain?timestamp=${encodeURIComponent(data.statusAt.meta.status_date)}`);
            const result = await response.json();
            setExplanation(result.explanation);
        } catch (error) {
            console.error('Failed to get explanation:', error);
            setExplanation('Failed to generate explanation. Please try again.');
        } finally {
            setIsExplaining(false);
        }
    };

    const chartData = useMemo(() => {
        if (!data) return [];

        // Use a Map keyed by floor(timestamp/5min) to merge points robustly
        const map = new Map<number, any>();

        const mergePoint = (timestamp: string | Date, values: any, type: 'history' | 'prediction') => {
            const date = new Date(timestamp);
            const epoch = Math.floor(date.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000);

            const existing = map.get(epoch) || {
                timestamp: new Date(epoch).toISOString(),
                type
            };

            // Merge values
            if (values.actual !== undefined) existing.actual = values.actual;
            if (values.projection !== undefined) existing.projection = values.projection;
            if (values.iob !== undefined) existing.iob = values.iob;
            if (values.cob !== undefined) existing.cob = values.cob;
            if (values.pendingCOB !== undefined) existing.pendingCOB = values.pendingCOB;
            if (values.activeCOB !== undefined) existing.activeCOB = values.activeCOB;
            if (values.activity !== undefined) existing.activity = values.activity;

            map.set(epoch, existing);
        };

        // 1. History Before
        if (data.historyBefore) {
            data.historyBefore.forEach((item: any) => {
                mergePoint(item.meta?.status_date || item.glucose?.timestamp, {
                    actual: item.glucose?.current?.sgv,
                    iob: item.iob?.calculated?.totalIOB,
                    cob: item.cob?.calculated?.cob,
                    pendingCOB: item.cob?.calculated?.pendingCOB,
                    activeCOB: item.cob?.calculated?.activeCOB
                }, 'history');
            });
        }

        // 2. Prediction
        if (data.prediction) {
            data.prediction.forEach((item: any) => {
                mergePoint(item.timestamp, {
                    projection: item.sgv,
                    iob: item.iob,
                    cob: item.cob,
                    pendingCOB: item.pendingCOB,
                    activeCOB: item.activeCOB
                }, 'prediction');
            });
        }

        // 3. History After
        if (data.historyAfter) {
            data.historyAfter.forEach((item: any) => {
                mergePoint(item.meta?.status_date || item.glucose?.timestamp, {
                    actual: item.glucose?.current?.sgv,
                    iob: item.iob?.calculated?.totalIOB,
                    cob: item.cob?.calculated?.cob,
                    pendingCOB: item.cob?.calculated?.pendingCOB,
                    activeCOB: item.cob?.calculated?.activeCOB
                }, 'history');
            });
        }

        // 4. Attribution History
        if (data.statusAt?.attribution?.history) {
            data.statusAt.attribution.history.forEach((attrPoint: any) => {
                mergePoint(attrPoint.timestamp, {
                    activity: attrPoint.components?.activity
                }, 'history');
            });
        }

        return Array.from(map.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [data]);

    const attribution = data?.statusAt?.attribution?.timeframes?.find((tf: any) => tf.minutes === selectedTimeframe) ||
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
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleExplain}
                        disabled={isExplaining}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isExplaining
                            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                            : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                            }`}
                    >
                        {isExplaining ? (
                            <RefreshCcw size={14} className="animate-spin" />
                        ) : (
                            <Sparkles size={14} />
                        )}
                        {isExplaining ? 'Thinking...' : 'Explain Status'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div >

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

                                                    {pointData.actual != null && (
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-emerald-400 font-medium">Actual</span>
                                                            <span className="text-white font-mono">{pointData.actual}</span>
                                                        </div>
                                                    )}
                                                    {pointData.projection != null && (
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-emerald-400/70 font-medium">Projected</span>
                                                            <span className="text-white font-mono">{pointData.projection.toFixed(0)}</span>
                                                        </div>
                                                    )}
                                                    {pointData.cob != null && (
                                                        <div className="space-y-0.5 pt-1 border-t border-zinc-800">
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-orange-400 font-medium">COB</span>
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
                                                    {pointData.iob != null && (
                                                        <div className="flex justify-between gap-4 pt-1 border-t border-zinc-800">
                                                            <span className="text-blue-500 font-medium">IOB</span>
                                                            <span className="text-white font-mono">{pointData.iob.toFixed(1)}u</span>
                                                        </div>
                                                    )}
                                                    {pointData.activity != null && pointData.activity !== 0 && (
                                                        <div className="flex justify-between gap-4 pt-1 border-t border-zinc-800">
                                                            <span className="text-fuchsia-400 font-medium">Activity</span>
                                                            <span className="text-white font-mono">
                                                                {pointData.activity > 0 ? '+' : ''}{pointData.activity.toFixed(1)}
                                                            </span>
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
                                    stroke="#2563eb"
                                    strokeWidth={2}
                                    dot={false}
                                    connectNulls
                                />

                                {/* COB Trend */}
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="cob"
                                    stroke="#f97316"
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
                            <div className="w-4 h-0.5 bg-blue-600"></div>
                            <span className="text-zinc-400">IOB</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 bg-orange-500"></div>
                            <span className="text-zinc-400">COB</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 bg-fuchsia-500"></div>
                            <span className="text-zinc-400">Activity</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-px h-4 bg-emerald-500 border-l border-dashed border-zinc-900"></div>
                            <span className="text-zinc-400">Selected Time</span>
                        </div>
                    </div>
                </div>

                {/* Attribution Panel */}
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                            <Info size={14} />
                            Attribution ({selectedTimeframe}min)
                        </h4>

                        <div className="flex bg-zinc-950/50 rounded-lg p-1 border border-zinc-800 self-start">
                            {[5, 10, 15, 30].map((mins) => (
                                <button
                                    key={mins}
                                    type="button"
                                    onClick={() => setSelectedTimeframe(mins)}
                                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${selectedTimeframe === mins
                                        ? 'bg-zinc-800 text-white shadow-sm'
                                        : 'text-zinc-600 hover:text-zinc-400'
                                        }`}
                                >
                                    {mins}m
                                </button>
                            ))}
                        </div>
                    </div>

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
                                <div className="p-1.5 bg-orange-500/10 rounded-lg">
                                    <Beef size={16} className="text-orange-400" />
                                </div>
                                <span className="text-zinc-300 text-sm">Carb Impact</span>
                            </div>
                            <span className="text-orange-400 font-mono font-bold">
                                +{attribution?.components?.carbs?.value?.toFixed(1) || '0.0'}
                            </span>
                        </div>

                        <div className="p-3 bg-zinc-800/40 rounded-xl border border-zinc-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-sky-500/10 rounded-lg">
                                    <RefreshCcw size={16} className="text-sky-400" />
                                </div>
                                <span className="text-zinc-300 text-sm">Basal Deviation</span>
                            </div>
                            <span className="text-sky-400 font-mono font-bold">
                                {attribution?.components?.basal?.value >= 0 ? '+' : ''}{attribution?.components?.basal?.value?.toFixed(1) || '0.0'}
                            </span>
                        </div>

                        <div className="p-3 bg-zinc-800/40 rounded-xl border border-zinc-800 flex items-center justify-between">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-fuchsia-500/10 rounded-lg">
                                        <Sparkles size={16} className="text-fuchsia-400" />
                                    </div>
                                    <span className="text-zinc-300 text-sm">Activity Impact</span>
                                </div>
                                {attribution?.components?.activity?.intensity && attribution?.components?.activity?.intensity !== 'unknown' && (
                                    <span className="text-[10px] text-fuchsia-400/70 font-medium ml-10">
                                        Intensity: {attribution.components.activity.intensity.replace('_', ' ')}
                                    </span>
                                )}
                            </div>
                            <span className="text-fuchsia-400 font-mono font-bold">
                                {attribution?.components?.activity?.value > 0 ? '+' : ''}{attribution?.components?.activity?.value?.toFixed(1) || '0.0'}
                            </span>
                        </div>

                        <div className="p-3 bg-zinc-950/40 rounded-xl border border-dashed border-zinc-800 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-zinc-500 text-sm">Unexplained</span>
                            </div>
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
                            {attribution?.glucoseChange?.predicted >= 0 ? '+' : ''}{attribution?.glucoseChange?.predicted?.toFixed(1) || '0.0'} {units}
                        </span>
                    </div>
                </div>

                {/* AI Explanation Area */}
                {(explanation || isExplaining) && (
                    <div className="pt-6 border-t border-zinc-800 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-10">
                                <Sparkles size={40} className="text-emerald-500" />
                            </div>
                            <h4 className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <MessageSquare size={12} />
                                AI Insight
                            </h4>
                            {isExplaining ? (
                                <div className="space-y-2">
                                    <div className="h-3 bg-zinc-800 rounded animate-pulse w-full"></div>
                                    <div className="h-3 bg-zinc-800 rounded animate-pulse w-3/4"></div>
                                </div>
                            ) : (
                                <p className="text-zinc-300 text-sm leading-relaxed italic">
                                    "{explanation}"
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
