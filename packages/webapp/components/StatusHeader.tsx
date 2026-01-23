'use client';

import React from 'react';
import { Activity, Battery, Footprints, HeartPulse } from 'lucide-react';

interface StatusHeaderProps {
    current: any;
    units: string;
    activitySummary: any;
    getTrendArrow: (trend: string | number | undefined) => string;
}

export default function StatusHeader({ current, units, activitySummary, getTrendArrow }: StatusHeaderProps) {
    const currentBg = current?.glucose?.current?.sgv;
    const trend = current?.glucose?.current?.trend;
    const delta = current?.glucose?.current?.delta5m;

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Glucose Pill - Large */}
            <div className="md:col-span-2 p-5 rounded-3xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm relative overflow-hidden group flex flex-col justify-between min-h-[120px]">
                <div className="absolute top-0 right-0 p-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-700"></div>

                <div className="relative z-10 flex items-center justify-between mb-1">
                    <span className="text-zinc-400 font-bold text-xs uppercase tracking-widest">Glucose</span>
                    <div className="flex items-center gap-2">
                        <span className="text-zinc-500 text-[10px] font-mono">
                            {current?.meta?.status_date ? new Date(current.meta.status_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                        <div className={`w-2 h-2 rounded-full ${current?.meta?.status_date && (Date.now() - new Date(current.meta.status_date).getTime() < 5 * 60 * 1000) ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-zinc-700'}`} />
                    </div>
                </div>

                <div className="relative z-10 flex items-end gap-3">
                    <span className="text-6xl font-bold tracking-tighter text-white leading-none">
                        {currentBg || '---'}
                    </span>
                    <div className="flex flex-col mb-1">
                        <div className="flex items-center gap-1">
                            <span className="text-2xl font-bold text-emerald-500">{getTrendArrow(trend)}</span>
                            <span className={`text-sm font-bold ${delta && delta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {delta ? (delta > 0 ? `+${delta}` : delta) : '--'}
                            </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">{units}</span>
                    </div>
                </div>
            </div>

            {/* IOB & COB Pill */}
            <div className="p-4 rounded-3xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between min-h-[120px]">
                <div className="flex items-center justify-between text-zinc-400 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Treatment</span>
                    <div className={`w-2 h-2 rounded-full ${current?.meta?.status_date && (Date.now() - new Date(current.meta.status_date).getTime() < 5 * 60 * 1000) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-700'}`} />
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity size={14} className="text-blue-500" />
                            <span className="text-xs text-zinc-500 font-medium">IOB</span>
                        </div>
                        <span className="text-xl font-mono font-bold text-blue-500">
                            {(current?.iob?.calculated?.totalIOB ?? 0).toFixed(1)}<span className="text-[10px] ml-0.5 text-zinc-500 font-sans">u</span>
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Battery size={14} className="text-orange-400" />
                            <span className="text-xs text-zinc-500 font-medium">COB</span>
                        </div>
                        <span className="text-xl font-mono font-bold text-orange-400">
                            {(current?.cob?.calculated?.cob ?? 0).toFixed(0)}<span className="text-[10px] ml-0.5 text-zinc-500 font-sans">g</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Steps & Heart Rate Pill */}
            <div className="p-4 rounded-3xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between min-h-[120px]">
                <div className="flex items-center justify-between text-zinc-400 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Activity</span>
                    <div className={`w-2 h-2 rounded-full ${activitySummary?.latestActivityTimestamp && (Date.now() - new Date(activitySummary.latestActivityTimestamp).getTime() < 5 * 60 * 1000) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-700'}`} />
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Footprints size={14} className="text-violet-400" />
                            <span className="text-xs text-zinc-500 font-medium">Steps</span>
                        </div>
                        <span className="text-xl font-mono font-bold text-violet-400">
                            {activitySummary?.stepsToday?.toLocaleString() || '0'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <HeartPulse size={14} className="text-rose-400" />
                            <span className="text-xs text-zinc-500 font-medium">Heart</span>
                        </div>
                        <div className="text-xl font-mono font-bold text-rose-400 flex items-baseline gap-0.5">
                            {activitySummary?.latestHeartRate?.bpm || '--'}
                            <span className="text-[10px] text-zinc-500 font-sans uppercase">bpm</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
