'use client';

import Header from '@/components/Header';
import { useState, useEffect, useMemo } from 'react';
import { Settings, Play, CheckCircle, AlertCircle, RefreshCw, BarChart2, Activity, Info, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function formatTime(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Helper: Get value from NightScout schedule at a specific time (minutes from midnight)
function getValueAtTime(schedule: any[], minutes: number) {
    if (!schedule || schedule.length === 0) return 0;
    // Find the last entry that starts at or before 'minutes'
    // Schedule items usually have 'timeAsSeconds' or 'time' string
    // We assume 'timeAsSeconds' is populated or we parse 'time'

    // Sort just in case (though usually sorted)
    const sorted = [...schedule].sort((a, b) => (a.timeAsSeconds ?? 0) - (b.timeAsSeconds ?? 0));

    let current = sorted[0].value;
    for (const item of sorted) {
        const itemMinutes = (item.timeAsSeconds ?? 0) / 60;
        if (itemMinutes <= minutes) {
            current = item.value;
        } else {
            break;
        }
    }
    return current;
}

export default function ProfilePage() {
    const [activeProfile, setActiveProfile] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);

    const [selectedAnalysis, setSelectedAnalysis] = useState<any>(null);

    // Analysis form state
    const [daysBack, setDaysBack] = useState(30);
    const [windowHours, setWindowHours] = useState(2);
    const [tuneParameters, setTuneParameters] = useState<string[]>(['isf', 'dia', 'basal', 'activity']);

    const fetchActiveProfile = async () => {
        setLoadingProfile(true);
        try {
            const res = await fetch('/api/profile/active');
            if (res.ok) {
                const data = await res.json();
                setActiveProfile(data);
            }
        } catch (error) {
            console.error('Failed to load active profile', error);
        } finally {
            setLoadingProfile(false);
        }
    };

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            const res = await fetch('/api/profile/history?limit=10'); // Fetch more history
            if (res.ok) {
                const data = await res.json();
                setHistory(data);
                if (data.length > 0) {
                    setSelectedAnalysis(data[0]);
                }
            }
        } catch (error) {
            console.error('Failed to load history', error);
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        fetchActiveProfile();
        fetchHistory();
    }, []);

    const runAnalysis = async () => {
        setAnalyzing(true);
        try {
            const res = await fetch('/api/profile/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    daysBack,
                    windowHours,
                    parameters: tuneParameters
                })
            });

            if (res.ok) {
                await fetchHistory();
            } else {
                alert('Analysis failed');
            }
        } catch (error) {
            console.error('Analysis error', error);
            alert('Analysis error');
        } finally {
            setAnalyzing(false);
        }
    };

    // Prepare chart data & Active Metrics
    const { chartData, activeBasalSum, tunedBasalSum, activeISFVal, activeICRVal } = useMemo(() => {
        const fallback = { chartData: [], activeBasalSum: 0, tunedBasalSum: 0, activeISFVal: 0, activeICRVal: 0 };
        if (!activeProfile && !selectedAnalysis) return fallback;

        const data = [];

        // Correctly resolve the active basal schedule
        let activeBasalSchedule: any[] = [];
        let activeISFSchedule: any[] = [];
        let activeICRSchedule: any[] = [];

        if (activeProfile) {
            // Helper to resolve specific schedule key
            const getSchedule = (key: string) => {
                let sched = [];
                if (activeProfile.profileData?.[key]) {
                    // Case 1: Overridden or directly resolved profile data
                    sched = activeProfile.profileData[key];
                } else if (activeProfile.doc?.store) {
                    // Case 2: Standard profile
                    const defaultName = activeProfile.doc.defaultProfile;
                    const store = activeProfile.doc.store[defaultName];
                    if (store?.[key]) {
                        sched = store[key];
                    }
                }
                return sched;
            };

            activeBasalSchedule = getSchedule('basal');
            activeISFSchedule = getSchedule('sens');
            activeICRSchedule = getSchedule('carbratio');
        }

        // Tuned Profile Basal: 6 blocks of 4 hours
        // [0-3, 4-7, 8-11, 12-15, 16-19, 20-23]
        const tunedRates = selectedAnalysis?.estimated_basal_rates || [];

        for (let h = 0; h < 24; h++) {
            const minutes = h * 60;
            const activeRate = getValueAtTime(activeBasalSchedule, minutes);

            // Tuned rate logic: block index = floor(hour / 4)
            // Safety check for tunedRates length
            const blockIndex = Math.floor(h / 4);
            const tunedRate = tunedRates.length > blockIndex ? tunedRates[blockIndex] : 0;

            data.push({
                time: `${h.toString().padStart(2, '0')}:00`,
                active: Number(activeRate),
                tuned: Number(tunedRate),
                originalHour: h
            });
        }

        // Calculate Average Active ISF/ICR
        let activeISFVal = 0;
        let activeICRVal = 0;

        if (activeISFSchedule.length > 0) {
            let totalISF = 0;
            for (let h = 0; h < 24; h++) {
                totalISF += getValueAtTime(activeISFSchedule, h * 60);
            }
            activeISFVal = totalISF / 24;
        }

        if (activeICRSchedule.length > 0) {
            let totalICR = 0;
            for (let h = 0; h < 24; h++) {
                totalICR += getValueAtTime(activeICRSchedule, h * 60);
            }
            activeICRVal = totalICR / 24;
        }

        return {
            chartData: data,
            activeBasalSum: data.reduce((sum, d) => sum + d.active, 0),
            tunedBasalSum: data.reduce((sum, d) => sum + d.tuned, 0),
            activeISFVal,
            activeICRVal
        };
    }, [activeProfile, selectedAnalysis]);

    return (
        <div className="min-h-screen bg-black text-zinc-100 pb-20">
            <Header title="Profile Manager" />

            <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">

                {/* 1. Run Analysis Section */}
                <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm">
                    <h2 className="text-zinc-400 font-medium text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                        <BarChart2 size={16} /> Run New Analysis
                    </h2>

                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="space-y-1 flex-1">
                            <label className="text-xs text-zinc-500 ml-1">Days Back</label>
                            <input
                                type="number"
                                value={daysBack}
                                onChange={(e) => setDaysBack(parseInt(e.target.value))}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>
                        <div className="space-y-1 flex-1">
                            <label className="text-xs text-zinc-500 ml-1">Window Hours</label>
                            <input
                                type="number"
                                value={windowHours}
                                onChange={(e) => setWindowHours(parseInt(e.target.value))}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-4">
                        {[
                            { id: 'isf', label: 'ISF' },
                            { id: 'dia', label: 'DIA' },
                            { id: 'basal', label: 'Basal' },
                            { id: 'activity', label: 'Activity' }
                        ].map(param => (
                            <label key={param.id} className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={tuneParameters.includes(param.id)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setTuneParameters([...tuneParameters, param.id]);
                                        } else {
                                            setTuneParameters(tuneParameters.filter(p => p !== param.id));
                                        }
                                    }}
                                    className="w-4 h-4 rounded bg-zinc-950 border-zinc-800 text-indigo-600 focus:ring-indigo-500/20"
                                />
                                <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors uppercase font-bold tracking-tight">
                                    {param.label}
                                </span>
                            </label>
                        ))}
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button
                            onClick={runAnalysis}
                            disabled={analyzing}
                            className="w-full md:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {analyzing ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                            {analyzing ? 'Analyzing...' : 'Run Analysis'}
                        </button>
                    </div>
                </div>

                {/* 2. TUNING SUGGESTIONS SECTION */}
                {
                    selectedAnalysis?.tuning_suggestions?.length > 0 && (
                        <div className="p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 backdrop-blur-sm">
                            <h2 className="text-indigo-400 font-bold text-sm uppercase tracking-wider mb-6 flex items-center gap-2">
                                <TrendingUp size={16} /> Tuning Recommendations
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {selectedAnalysis.tuning_suggestions.map((s: any, i: number) => (
                                    <div key={i} className="p-4 bg-zinc-900/80 rounded-xl border border-zinc-800 hover:border-indigo-500/40 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
                                                    {s.parameter === 'activity_steps' ? 'Aerobic (Steps)' :
                                                        s.parameter === 'activity_hr' ? 'Anaerobic (HR)' :
                                                            s.parameter === 'activity_stairs' ? 'Stairs' :
                                                                s.parameter === 'activity_calories' ? 'Calories' : s.parameter}
                                                </span>
                                                <span className={`text-lg font-mono font-bold ${s.changePercentage > 0 ? 'text-indigo-400' : 'text-emerald-400'}`}>
                                                    {s.suggestedValue}
                                                </span>
                                            </div>
                                            <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${s.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400' : s.confidence === 'medium' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-500/20 text-zinc-400'}`}>
                                                {s.confidence} Confidence
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-xs text-zinc-500 line-through">{s.currentValue}</span>
                                            <span className={`text-xs font-bold ${s.changePercentage > 0 ? 'text-indigo-400/80' : 'text-emerald-400/80'}`}>
                                                {s.changePercentage > 0 ? '+' : ''}{s.changePercentage}%
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-400 leading-relaxed italic">
                                            "{s.reason}"
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                }

                {/* 1. CHART SECTION: Active vs Tuned Graph */}
                <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-zinc-400 font-medium text-sm uppercase tracking-wider flex items-center gap-2">
                            <TrendingUp size={16} /> Basal Rate Comparison
                        </h2>
                        {selectedAnalysis && (
                            <div className="text-xs text-zinc-500 font-mono text-right flex flex-col gap-1">
                                <span>Comparing Active vs Analysis from {new Date(selectedAnalysis.timestamp).toLocaleString()}</span>
                                <span className="text-zinc-600">
                                    Analyze {selectedAnalysis.windows_analyzed} windows
                                    (Excluded {selectedAnalysis.windows_filtered_out || 0} outliers)
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="time" stroke="#666" fontSize={12} tickMargin={10} minTickGap={30} />
                                <YAxis stroke="#666" fontSize={12} tickFormatter={(val) => `${val}u`} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                                    itemStyle={{ fontSize: '12px' }}
                                    formatter={(val: number) => [val.toFixed(3) + ' U/hr', '']}
                                />
                                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                <Line
                                    type="stepAfter"
                                    dataKey="active"
                                    name="Active Profile"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                                <Line
                                    type="stepAfter"
                                    dataKey="tuned"
                                    name="Tuned Recommendation"
                                    stroke="#8b5cf6"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="p-3 bg-zinc-900/50 rounded-xl border border-zinc-800 flex justify-between items-center">
                            <span className="text-sm text-zinc-500">Total Basal (Active)</span>
                            <span className="text-lg font-mono font-bold text-emerald-400">{activeBasalSum.toFixed(2)} U</span>
                        </div>
                        <div className="p-3 bg-zinc-900/50 rounded-xl border border-zinc-800 flex justify-between items-center">
                            <span className="text-sm text-zinc-500">Total Basal (Tuned)</span>
                            <span className="text-lg font-mono font-bold text-indigo-400">{tunedBasalSum.toFixed(2)} U</span>
                        </div>
                    </div>
                </div>

                {/* 2. DETAILED DESCRIPTION SECTION */}
                {
                    selectedAnalysis && (
                        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm">
                            <h2 className="text-zinc-400 font-medium text-sm uppercase tracking-wider mb-6 flex items-center gap-2">
                                <Info size={16} /> Detailed Loop Entry Settings
                            </h2>

                            <div className="space-y-6">
                                {/* Sensitivity (ISF) */}
                                <div>
                                    <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-800 pb-2">Sensitivity (ISF)</h3>
                                    <div className="overflow-x-auto rounded-lg border border-zinc-800">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-zinc-950 text-zinc-400 font-medium">
                                                <tr>
                                                    <th className="px-4 py-3">Time Range</th>
                                                    <th className="px-4 py-3 text-right">Recommended</th>
                                                    <th className="px-4 py-3 text-right">Confidence (95%)</th>
                                                    <th className="px-4 py-3 text-right">Active (Avg)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800 bg-zinc-900/30">
                                                {[0, 1, 2, 3, 4, 5].map((blockIdx) => {
                                                    const startHour = blockIdx * 4;
                                                    const endHour = startHour + 3;
                                                    const timeLabel = `${startHour.toString().padStart(2, '0')}:00 - ${endHour.toString().padStart(2, '0')}:59`;

                                                    // Handle number vs array for backward compatibility
                                                    const val = Array.isArray(selectedAnalysis.estimated_isf)
                                                        ? selectedAnalysis.estimated_isf[blockIdx]
                                                        : selectedAnalysis.estimated_isf;

                                                    const conf = Array.isArray(selectedAnalysis.isf_confidence?.[0])
                                                        ? selectedAnalysis.isf_confidence[blockIdx]
                                                        : selectedAnalysis.isf_confidence;

                                                    return (
                                                        <tr key={blockIdx} className="hover:bg-zinc-800/50 transition-colors">
                                                            <td className="px-4 py-3 font-mono text-zinc-300">{timeLabel}</td>
                                                            <td className="px-4 py-3 text-right font-mono text-indigo-400 font-bold">
                                                                {val?.toFixed(0)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-mono text-zinc-500 text-xs">
                                                                {Array.isArray(conf) ? `${conf[0]?.toFixed(0)} - ${conf[1]?.toFixed(0)}` : 'N/A'}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-mono text-emerald-500/80">
                                                                {blockIdx === 0 && <span className="text-[10px] text-zinc-600 mr-2">(Global Avg)</span>}
                                                                ~{activeISFVal.toFixed(0)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Carb Ratio (ICR) */}
                                <div>
                                    <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-800 pb-2">Carb Ratio (ICR)</h3>
                                    <div className="overflow-x-auto rounded-lg border border-zinc-800">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-zinc-950 text-zinc-400 font-medium">
                                                <tr>
                                                    <th className="px-4 py-3">Time Range</th>
                                                    <th className="px-4 py-3 text-right">Recommended</th>
                                                    <th className="px-4 py-3 text-right">Confidence (95%)</th>
                                                    <th className="px-4 py-3 text-right">Active (Avg)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800 bg-zinc-900/30">
                                                {[0, 1, 2, 3, 4, 5].map((blockIdx) => {
                                                    const startHour = blockIdx * 4;
                                                    const endHour = startHour + 3;
                                                    const timeLabel = `${startHour.toString().padStart(2, '0')}:00 - ${endHour.toString().padStart(2, '0')}:59`;

                                                    const val = Array.isArray(selectedAnalysis.estimated_icr)
                                                        ? selectedAnalysis.estimated_icr[blockIdx]
                                                        : selectedAnalysis.estimated_icr;

                                                    const conf = Array.isArray(selectedAnalysis.icr_confidence?.[0])
                                                        ? selectedAnalysis.icr_confidence[blockIdx]
                                                        : selectedAnalysis.icr_confidence;

                                                    return (
                                                        <tr key={blockIdx} className="hover:bg-zinc-800/50 transition-colors">
                                                            <td className="px-4 py-3 font-mono text-zinc-300">{timeLabel}</td>
                                                            <td className="px-4 py-3 text-right font-mono text-indigo-400 font-bold">
                                                                {val?.toFixed(1)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-mono text-zinc-500 text-xs">
                                                                {Array.isArray(conf) ? `${conf[0]?.toFixed(1)} - ${conf[1]?.toFixed(1)}` : 'N/A'}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-mono text-emerald-500/80">
                                                                {blockIdx === 0 && <span className="text-[10px] text-zinc-600 mr-2">(Global Avg)</span>}
                                                                ~{activeICRVal.toFixed(1)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Basal Schedule Table */}
                                <div>
                                    <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-800 pb-2">Basal Schedule Blocks</h3>
                                    <div className="overflow-x-auto rounded-lg border border-zinc-800">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-zinc-950 text-zinc-400 font-medium">
                                                <tr>
                                                    <th className="px-4 py-3">Time Range</th>
                                                    <th className="px-4 py-3 text-right">Recommended Rate</th>
                                                    <th className="px-4 py-3 text-right">Confidence (95%)</th>
                                                    <th className="px-4 py-3 text-right">Active Rate</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800 bg-zinc-900/30">
                                                {[0, 1, 2, 3, 4, 5].map((blockIdx) => {
                                                    const startHour = blockIdx * 4;
                                                    const endHour = startHour + 3;
                                                    const timeLabel = `${startHour.toString().padStart(2, '0')}:00 - ${endHour.toString().padStart(2, '0')}:59`;
                                                    const rate = selectedAnalysis.estimated_basal_rates?.[blockIdx];
                                                    const conf = selectedAnalysis.basal_confidence?.[blockIdx];
                                                    // Estimate average active rate for this block for comparison
                                                    const activeRateSum = chartData
                                                        .filter(d => d.originalHour >= startHour && d.originalHour <= endHour)
                                                        .reduce((s, d) => s + d.active, 0);
                                                    const activeRateAvg = activeRateSum / 4;

                                                    return (
                                                        <tr key={blockIdx} className="hover:bg-zinc-800/50 transition-colors">
                                                            <td className="px-4 py-3 font-mono text-zinc-300">{timeLabel}</td>
                                                            <td className="px-4 py-3 text-right font-mono text-indigo-400 font-bold">
                                                                {rate?.toFixed(3)} U/hr
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-mono text-zinc-500 text-xs">
                                                                {conf ? `${conf[0]?.toFixed(3)} - ${conf[1]?.toFixed(3)}` : 'N/A'}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-mono text-emerald-500/80">
                                                                ~{activeRateAvg?.toFixed(3)} U/hr
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }




                {/* History List */}
                <div className="space-y-4">
                    <h2 className="text-zinc-400 font-medium text-sm uppercase tracking-wider flex items-center gap-2 px-1">
                        Recent Logs
                    </h2>

                    {loadingHistory ? (
                        <div className="animate-pulse space-y-2">
                            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-zinc-900 rounded-2xl"></div>)}
                        </div>
                    ) : history.length > 0 ? (
                        history.map((item, idx) => (
                            <div
                                key={idx}
                                onClick={() => setSelectedAnalysis(item)}
                                className={`p-4 rounded-xl border transition-all cursor-pointer ${selectedAnalysis?._id === item._id
                                    ? 'bg-zinc-800/80 border-indigo-500/50 ring-1 ring-indigo-500/20'
                                    : 'bg-zinc-900/30 border-zinc-800 hover:bg-zinc-900/50'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${item.r_squared > 0.7 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                        <div>
                                            <div className="text-sm font-mono text-zinc-300">
                                                {new Date(item.timestamp).toLocaleString()}
                                            </div>
                                            <div className="text-xs text-zinc-500">
                                                R²: {item.r_squared?.toFixed(2)} • {item.windows_analyzed} windows
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-xs font-mono text-indigo-400">
                                        ISF: {Array.isArray(item.estimated_isf) ? item.estimated_isf.reduce((a: number, b: number) => a + b, 0) / item.estimated_isf.length : item.estimated_isf?.toFixed(0)}
                                        • ICR: {Array.isArray(item.estimated_icr) ? item.estimated_icr.reduce((a: number, b: number) => a + b, 0) / item.estimated_icr.length : item.estimated_icr?.toFixed(0)}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-zinc-500 italic px-1">No history available.</div>
                    )}
                </div>
            </main >
        </div >
    );
}
