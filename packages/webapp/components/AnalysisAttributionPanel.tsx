import React from 'react';
import { Info, Zap, Beef, RefreshCcw, Sparkles, MessageSquare } from 'lucide-react';

interface AttributionPanelProps {
    selectedTimeframe: number;
    setSelectedTimeframe: (mins: number) => void;
    attribution: any;
    units: string;
    explanation: string | null;
    isExplaining: boolean;
}

export default function AnalysisAttributionPanel({
    selectedTimeframe,
    setSelectedTimeframe,
    attribution,
    units,
    explanation,
    isExplaining
}: AttributionPanelProps) {
    return (
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
    );
}
