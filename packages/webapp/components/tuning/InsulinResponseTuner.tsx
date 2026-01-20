'use client';

import React, { useState, useEffect } from 'react';
import {
    Zap,
    Play,
    CheckCircle2,
    AlertCircle,
    ArrowLeft,
    ChevronRight,
    TrendingUp,
    Target,
    Clock,
    Save,
    Loader2
} from 'lucide-react';
import Link from 'next/link';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceArea
} from 'recharts';

interface Props {
    onBack: () => void;
}

export const InsulinResponseTuner: React.FC<Props> = ({ onBack }) => {
    const [status, setStatus] = useState<'idle' | 'syncing' | 'running' | 'completed' | 'failed'>('idle');
    const [tuningId, setTuningId] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [syncProgress, setSyncProgress] = useState(0);
    const [analysisPeriod, setAnalysisPeriod] = useState(14);
    const [selection, setSelection] = useState({
        dia: true,
        peak: true,
        isf: [true, true, true, true, true, true]
    });

    useEffect(() => {
        let interval: any;
        if ((status === 'running' || status === 'syncing') && tuningId) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/profile/tune-insulin-response/${tuningId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.status === 'completed') {
                            setResult(data);
                            setStatus('completed');
                            clearInterval(interval);
                        } else if (data.status === 'failed') {
                            setStatus('failed');
                            clearInterval(interval);
                        } else if (data.status === 'syncing') {
                            setStatus('syncing');
                            setSyncProgress(data.sync_progress || 0);
                        } else if (data.status === 'running') {
                            setStatus('running');
                        }
                    }
                } catch (err) {
                    console.error('Polling error:', err);
                }
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [status, tuningId]);

    const startTuning = async () => {
        try {
            setStatus('running');
            setProgress(10);
            const res = await fetch('/api/profile/tune-insulin-response', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    analysis_period_days: analysisPeriod,
                    window_hours: 2,
                    include_activity: true
                })
            });

            if (res.ok) {
                const data = await res.json();
                setTuningId(data.tuning_id);
            } else {
                setStatus('failed');
            }
        } catch (err) {
            setStatus('failed');
        }
    };

    const applyResults = async () => {
        if (!tuningId) return;
        try {
            setIsApplying(true);
            const res = await fetch(`/api/profile/tune-insulin-response/${tuningId}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apply_to_profile: true,
                    apply_to_system: true,
                    selection
                })
            });

            if (res.ok) {
                alert('Optimization applied successfully! Selected settings have been updated.');
                onBack();
            }
        } catch (err) {
            alert('Failed to apply optimization.');
        } finally {
            setIsApplying(false);
        }
    };

    const getReliability = (confidence: [number, number], value: number) => {
        const range = confidence[1] - confidence[0];
        const percent = (range / value) * 100;
        if (percent < 15) return { label: 'High', class: 'text-emerald-400 bg-emerald-400/10' };
        if (percent < 35) return { label: 'Medium', class: 'text-amber-400 bg-amber-400/10' };
        return { label: 'Low', class: 'text-red-400 bg-red-400/10' };
    };

    const toggleISFSelection = (index: number) => {
        const newISF = [...selection.isf];
        newISF[index] = !newISF[index];
        setSelection({ ...selection, isf: newISF });
    };

    const renderStatus = () => {
        if (status === 'syncing') {
            return (
                <div className="flex flex-col items-center justify-center p-20 bg-zinc-900/50 rounded-3xl border border-zinc-800 animate-in fade-in zoom-in duration-500">
                    <div className="relative mb-8">
                        <div className="absolute inset-0 bg-blue-500/20 blur-2xl animate-pulse" />
                        <Loader2 className="w-16 h-16 text-blue-500 animate-spin relative z-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Syncing History...</h2>
                    <p className="text-zinc-500 text-center max-w-sm mb-6">
                        Fetching historical data from Nightscout. This is required for your requested {analysisPeriod} day analysis.
                    </p>
                    <div className="w-full max-w-xs bg-zinc-800 h-2 rounded-full overflow-hidden mb-2">
                        <div
                            className="bg-blue-500 h-full transition-all duration-500"
                            style={{ width: `${syncProgress}%` }}
                        />
                    </div>
                    <div className="text-blue-500 font-bold text-sm tracking-widest uppercase">
                        {syncProgress}% Complete
                    </div>
                </div>
            );
        }

        if (status === 'running') {
            return (
                <div className="flex flex-col items-center justify-center p-20 bg-zinc-900/50 rounded-3xl border border-zinc-800 animate-in fade-in zoom-in duration-500">
                    <div className="relative mb-8">
                        <div className="absolute inset-0 bg-amber-500/20 blur-2xl animate-pulse" />
                        <Loader2 className="w-16 h-16 text-amber-500 animate-spin relative z-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Analyzing Data...</h2>
                    <p className="text-zinc-500 text-center max-w-sm">
                        Freddy is processing your glucose readings for the last {analysisPeriod} days. This usually takes 30-60 seconds.
                    </p>
                    <div className="w-full max-w-xs bg-zinc-800 h-1.5 rounded-full mt-8 overflow-hidden">
                        <div className="bg-amber-500 h-full animate-[progress_10s_ease-in-out_infinite]" style={{ width: '60%' }} />
                    </div>
                </div>
            );
        }

        if (status === 'completed' && result) {
            const isfData = result.optimized_values.isf.map((val: number, i: number) => ({
                time: `${i * 4}:00`,
                optimized: val,
                current: result.current_values.isf[i],
                low: result.optimized_values.isf_confidence[i][0],
                high: result.optimized_values.isf_confidence[i][1]
            }));

            const diaReliability = getReliability(result.optimized_values.dia_confidence, result.optimized_values.dia);
            const peakReliability = getReliability(result.optimized_values.peak_confidence, result.optimized_values.peak);

            return (
                <div className="space-y-8 animate-in slide-in-from-right-8 fade-in duration-700">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-white">Optimization Results</h2>
                        <div className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                            Analysis Period: {analysisPeriod} Days
                        </div>
                    </div>

                    {/* Results Selection Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* DIA CARD */}
                        <div
                            onClick={() => setSelection({ ...selection, dia: !selection.dia })}
                            className={`p-6 rounded-2xl border transition-all cursor-pointer ${selection.dia ? 'bg-zinc-900 border-amber-500/50' : 'bg-zinc-900/40 border-zinc-800 opacity-60'}`}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3 text-zinc-400 text-xs font-bold uppercase tracking-wider">
                                    <Clock size={14} className="text-amber-500" />
                                    Insulin Action (DIA)
                                </div>
                                <div className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold uppercase ${diaReliability.class}`}>
                                    {diaReliability.label} Reliability
                                </div>
                            </div>
                            <div className="flex items-end justify-between">
                                <div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-black text-white">{result.optimized_values.dia.toFixed(1)}</span>
                                        <span className="text-zinc-500 font-bold text-sm">h (New)</span>
                                    </div>
                                    <div className="text-sm text-zinc-500 mt-1">
                                        Current: <span className="font-bold">{result.current_values.dia.toFixed(1)}h</span>
                                    </div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${selection.dia ? 'bg-amber-500 border-amber-500 text-black' : 'border-zinc-700'}`}>
                                    {selection.dia && <CheckCircle2 size={14} />}
                                </div>
                            </div>
                        </div>

                        {/* PEAK CARD */}
                        <div
                            onClick={() => setSelection({ ...selection, peak: !selection.peak })}
                            className={`p-6 rounded-2xl border transition-all cursor-pointer ${selection.peak ? 'bg-zinc-900 border-emerald-500/50' : 'bg-zinc-900/40 border-zinc-800 opacity-60'}`}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3 text-zinc-400 text-xs font-bold uppercase tracking-wider">
                                    <Target size={14} className="text-emerald-500" />
                                    Peak Time
                                </div>
                                <div className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold uppercase ${peakReliability.class}`}>
                                    {peakReliability.label} Reliability
                                </div>
                            </div>
                            <div className="flex items-end justify-between">
                                <div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-black text-white">{result.optimized_values.peak.toFixed(0)}</span>
                                        <span className="text-zinc-500 font-bold text-sm">min (New)</span>
                                    </div>
                                    <div className="text-sm text-zinc-500 mt-1">
                                        Current: <span className="font-bold">{result.current_values.peak.toFixed(0)}min</span>
                                    </div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${selection.peak ? 'bg-emerald-500 border-emerald-500 text-black' : 'border-zinc-700'}`}>
                                    {selection.peak && <CheckCircle2 size={14} />}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ISF Schedule Details */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-bold text-white">Insulin Sensitivity (ISF)</h3>
                                <p className="text-zinc-500 text-sm mt-1">Select specific blocks to update your schedule</p>
                            </div>
                            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                                    Optimized
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-zinc-700" />
                                    Current
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-10">
                            {result.optimized_values.isf.map((val: number, i: number) => {
                                const rel = getReliability(result.optimized_values.isf_confidence[i], val);
                                return (
                                    <div
                                        key={i}
                                        onClick={() => toggleISFSelection(i)}
                                        className={`p-4 rounded-xl border transition-all cursor-pointer text-center ${selection.isf[i] ? 'bg-zinc-800 border-amber-500/30' : 'bg-zinc-900 border-zinc-800 opacity-40'}`}
                                    >
                                        <div className="text-[10px] font-bold text-zinc-500 uppercase mb-2">{i * 4}:00</div>
                                        <div className="text-xl font-black text-white mb-1">{val.toFixed(0)}</div>
                                        <div className="text-[9px] text-zinc-500 line-through mb-2">{result.current_values.isf[i].toFixed(0)}</div>
                                        <div className={`text-[8px] font-bold uppercase py-0.5 rounded ${rel.class}`}>
                                            {rel.label}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={isfData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                    <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                                    <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} unit=" mg" domain={['dataMin - 10', 'dataMax + 10']} />
                                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }} />
                                    <Line type="monotone" dataKey="current" stroke="#3f3f46" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                    <Line type="monotone" dataKey="optimized" stroke="#fbbf24" strokeWidth={4} dot={{ r: 6, fill: '#fbbf24' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 pt-4">
                        <button
                            onClick={applyResults}
                            disabled={isApplying}
                            className="flex-grow flex items-center justify-center gap-3 px-8 py-5 bg-white text-zinc-950 font-black rounded-2xl hover:bg-emerald-400 transition-all duration-300 shadow-xl shadow-white/5 active:scale-[0.98] disabled:opacity-50"
                        >
                            {isApplying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            {isApplying ? 'Applying Optimization...' : 'Apply & Sync to Nightscout'}
                        </button>
                        <button
                            onClick={startTuning}
                            className="px-8 py-5 bg-zinc-900 text-zinc-400 font-bold rounded-2xl border border-zinc-800 hover:text-white hover:border-zinc-700 transition-all"
                        >
                            Discard & Rerun
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 md:p-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="max-w-xl">
                    <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 mb-8 border border-amber-500/20">
                        <Zap size={32} />
                    </div>

                    <h2 className="text-3xl font-black text-white mb-2">Insulin Response Optimization</h2>
                    <p className="text-zinc-400 text-lg mb-8 leading-relaxed">
                        Optimize your Duration of Insulin Action (DIA) and Sensitivity Factor (ISF) based on your unique metabolic response.
                    </p>

                    <div className="mb-10 space-y-6">
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Analysis Period (Days)</label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="number"
                                    min="1"
                                    max="180"
                                    value={analysisPeriod}
                                    onChange={(e) => setAnalysisPeriod(parseInt(e.target.value) || 0)}
                                    className="w-24 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xl font-black text-white focus:outline-none focus:border-amber-500 transition-colors"
                                />
                                <div className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Days</div>
                            </div>
                            <p className="text-xs text-zinc-600">More days provide higher reliability but may miss recent lifestyle changes.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex items-start gap-3">
                                <CheckCircle2 className="text-emerald-500 mt-1" size={18} />
                                <div className="text-sm">
                                    <span className="font-bold text-white block">DIA Calibration</span>
                                    <span className="text-zinc-500">Find how long insulin stays active.</span>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <CheckCircle2 className="text-emerald-500 mt-1" size={18} />
                                <div className="text-sm">
                                    <span className="font-bold text-white block">Dynamic ISF</span>
                                    <span className="text-zinc-500">Map sensitivity across 6 time blocks.</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={startTuning}
                        className="group w-full flex items-center justify-center gap-3 px-8 py-5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black rounded-2xl hover:from-amber-400 hover:to-orange-500 transition-all duration-300 shadow-xl shadow-amber-500/10 active:scale-[0.98]"
                    >
                        <Play className="w-5 h-5 fill-current" />
                        Run Optimizer ({analysisPeriod} Days)
                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-4xl mx-auto">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-zinc-500 hover:text-white mb-8 transition-colors group"
            >
                <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                Back to Dashboard
            </button>

            {renderStatus()}

            {status === 'failed' && (
                <div className="mt-8 p-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-400">
                    <AlertCircle size={24} />
                    <div>
                        <div className="font-bold">Analysis Failed</div>
                        <div className="text-sm opacity-80">There was an error communicating with the predictive model service. Please try again.</div>
                    </div>
                </div>
            )}
        </div>
    );
};
