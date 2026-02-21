'use client';

import Header from '@/components/Header';
import { useState, useEffect, useMemo } from 'react';
import { Settings, Play, CheckCircle, AlertCircle, RefreshCw, BarChart2, Activity, Info, TrendingUp, Sparkles } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { denormalizeISF, denormalizeGlucose } from '@/lib/logic/unit-conversion';

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
    const [generatingExplanation, setGeneratingExplanation] = useState(false);

    const [selectedAnalysis, setSelectedAnalysis] = useState<any>(null);
    const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);
    const [analysisProgress, setAnalysisProgress] = useState(0);

    // Analysis form state
    const [daysBack, setDaysBack] = useState(30);
    const [windowHours, setWindowHours] = useState(2);
    const [tuneParameters, setTuneParameters] = useState<string[]>(['isf', 'dia', 'basal', 'activity']);

    const addLog = (msg: string) => {
        setAnalysisLogs(prev => [...prev, msg]);
    };

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
            const res = await fetch('/api/profile/history?limit=10');
            if (res.ok) {
                const data = await res.json();
                console.log('[DEBUG] fetchHistory received:', data?.length, 'items');
                setHistory(data);
                if (data.length > 0) {
                    setSelectedAnalysis(data[0]);
                }
                return data; // Return the data for use in runAnalysis
            } else {
                console.error('[DEBUG] fetchHistory failed:', res.status, res.statusText);
            }
        } catch (error) {
            console.error('Failed to load history', error);
        } finally {
            setLoadingHistory(false);
        }
        return null;
    };

    useEffect(() => {
        fetchActiveProfile();
        fetchHistory();
    }, []);

    useEffect(() => {
        if (selectedAnalysis?.logs && !analyzing) {
            setAnalysisLogs(selectedAnalysis.logs);
        }
    }, [selectedAnalysis, analyzing]);

    const runAnalysis = async () => {
        setAnalyzing(true);
        setAnalysisLogs([]);
        setAnalysisProgress(5);

        addLog("🚀 Initializing profile analysis...");

        try {
            addLog(`📅 Parameters: Last ${daysBack} days, ${windowHours}h windows`);
            addLog(`🔧 Tuning: ${tuneParameters.join(', ').toUpperCase()}`);

            setAnalysisProgress(15);
            addLog("📡 Fetching glucose history and treatment data...");

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
                setAnalysisProgress(60);
                addLog("✨ Analysis completed successfully.");
                const data = await res.json();

                if (data.logs && data.logs.length > 0) {
                    data.logs.forEach((l: string) => addLog(l));
                }

                setAnalysisProgress(90);
                addLog("💾 Synchronizing results with database...");
                const newHistory = await fetchHistory();
                console.log('[DEBUG] New history fetched:', newHistory?.length, 'items');
                if (newHistory && newHistory.length > 0) {
                    console.log('[DEBUG] Latest analysis:', {
                        timestamp: newHistory[0].timestamp,
                        has_coeffs: !!newHistory[0].estimated_activity_coefficients,
                        coeffs: newHistory[0].estimated_activity_coefficients
                    });
                    setSelectedAnalysis(newHistory[0]);
                }
                setAnalysisProgress(100);

                // Keep progress showing for a second
                setTimeout(() => {
                    setAnalyzing(false);
                    setAnalysisProgress(0);
                }, 1500);
            } else {
                addLog("❌ Analysis failed on server.");
                alert('Analysis failed');
                setAnalyzing(false);
            }
        } catch (error: any) {
            addLog(`💥 ERROR: ${error.message}`);
            console.error('Analysis error', error);
            alert('Analysis error');
            setAnalyzing(false);
        }
    };

    const generateExplanation = async () => {
        if (!selectedAnalysis?._id) {
            alert('Please select an analysis first');
            return;
        }

        setGeneratingExplanation(true);
        try {
            const res = await fetch('/api/profile/explain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ analysisId: selectedAnalysis._id })
            });

            if (res.ok) {
                const data = await res.json();
                setSelectedAnalysis({
                    ...selectedAnalysis,
                    llm_explanation: data.explanation,
                    explanation_generated_at: data.generated_at
                });

                // Update history list as well
                setHistory(history.map(item =>
                    item._id === selectedAnalysis._id
                        ? { ...item, llm_explanation: data.explanation, explanation_generated_at: data.generated_at }
                        : item
                ));
            } else {
                const error = await res.json();
                alert(`Failed to generate explanation: ${error.error}`);
            }
        } catch (error: any) {
            console.error('Explanation generation error:', error);
            alert('Failed to generate explanation');
        } finally {
            setGeneratingExplanation(false);
        }
    };

    // Prepare chart data & Active Metrics
    const { chartData, activeBasalSum, tunedBasalSum, activeISFVal, activeICRVal, units } = useMemo(() => {
        const fallback = { chartData: [], activeBasalSum: 0, tunedBasalSum: 0, activeISFVal: 0, activeICRVal: 0, units: 'mg/dL' };
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

        const units = activeProfile?.profileData?.units || activeProfile?.units || selectedAnalysis?.current_profile?.units || 'mg/dL';

        return {
            chartData: data,
            activeBasalSum: data.reduce((sum, d) => sum + d.active, 0),
            tunedBasalSum: data.reduce((sum, d) => sum + d.tuned, 0),
            activeISFVal,
            activeICRVal,
            units
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

                    {/* DEBUG: Remove later */}
                    <div className="hidden">
                        DEBUG: {selectedAnalysis ? Object.keys(selectedAnalysis).join(', ') : 'No data'}
                        HAS ACTIVITY: {selectedAnalysis?.estimated_activity_coefficients ? 'YES' : 'NO'}
                    </div>

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

                    <div className="mt-6 space-y-4">
                        {/* Progress Bar */}
                        {(analyzing || analysisProgress > 0) && (
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                                    <span>{analysisProgress === 100 ? 'Complete' : 'Analysis in Progress'}</span>
                                    <span>{analysisProgress}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                                    <div
                                        className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                                        style={{ width: `${analysisProgress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Analysis Logs / Terminal */}
                        {(analyzing || analysisLogs.length > 0) && (
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-zinc-600 ml-1">
                                    <Activity size={12} /> {analyzing ? 'Live Execution Output' : 'Analysis Logs'}
                                </div>
                                <div className="p-3 bg-black rounded-xl border border-zinc-800 font-mono text-[11px] h-40 overflow-y-auto space-y-1 shadow-inner custom-scrollbar">
                                    {analysisLogs.map((log, i) => (
                                        <div key={i} className={`flex gap-2 ${log.startsWith('❌') || log.startsWith('💥') ? 'text-rose-400' : log.startsWith('✅') || log.startsWith('✨') ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                            <span className="text-zinc-600 select-none">[{i.toString().padStart(2, '0')}]</span>
                                            <span>{log}</span>
                                        </div>
                                    ))}
                                    {analyzing && analysisProgress < 100 && (
                                        <div className="flex items-center gap-2 text-indigo-400 animate-pulse">
                                            <span className="text-zinc-600">[{analysisLogs.length.toString().padStart(2, '0')}]</span>
                                            <span>Processing windows and estimating coefficients...</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={runAnalysis}
                                disabled={analyzing}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {analyzing ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                                {analyzing ? 'Analyzing...' : 'Run Analysis'}
                            </button>
                            <button
                                onClick={async () => {
                                    if (!selectedAnalysis?._id || !activeProfile?._id) {
                                        alert('Need active profile and selected analysis');
                                        return;
                                    }
                                    if (!confirm('Apply these parameters to your active profile?')) return;
                                    const res = await fetch(`/api/profiles/${activeProfile._id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'apply', analysis: selectedAnalysis })
                                    });
                                    if (res.ok) alert('Applied successfully');
                                    else alert('Failed to apply');
                                }}
                                disabled={!selectedAnalysis || !activeProfile?._id || analyzing}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <CheckCircle size={16} /> Apply to Profile
                            </button>
                            <button
                                onClick={generateExplanation}
                                disabled={!selectedAnalysis || generatingExplanation}
                                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {generatingExplanation ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                                {generatingExplanation ? 'Generating...' : 'Explain Results'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* LLM EXPLANATION SECTION */}
                {selectedAnalysis?.llm_explanation && (
                    <div className="p-6 rounded-2xl bg-purple-500/5 border border-purple-500/20 backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-purple-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                                <Sparkles size={16} /> AI Explanation & Recommendations
                            </h3>
                            <div className="text-[10px] text-zinc-600">
                                Generated {new Date(selectedAnalysis.explanation_generated_at).toLocaleString()}
                            </div>
                        </div>
                        <div className="prose prose-invert prose-sm max-w-none">
                            <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                {selectedAnalysis.llm_explanation}
                            </p>
                        </div>
                    </div>
                )}

                {/* 1. REGRESSION SECTION (Promoted) */}
                {selectedAnalysis && selectedAnalysis.estimated_activity_coefficients && (
                    <div className="p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 backdrop-blur-md">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-zinc-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                                <Activity size={16} className="text-indigo-400" /> Activity Regression Results
                            </h3>
                            <div className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${selectedAnalysis.r_squared > 0.6 ? 'bg-emerald-500/10 text-emerald-400' :
                                selectedAnalysis.r_squared > 0.3 ? 'bg-amber-500/10 text-amber-400' :
                                    'bg-rose-500/10 text-rose-400'
                                }`}>
                                {selectedAnalysis.r_squared > 0.6 ? 'Reliable Fit' :
                                    selectedAnalysis.r_squared > 0.3 ? 'Moderate Fit' : 'Low Confidence'}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-4 hover:border-indigo-500/30 transition-colors">
                                <div className="text-[10px] font-bold text-zinc-500 mb-1 uppercase tracking-widest">Steps Coefficient</div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-mono font-bold text-white">
                                        {denormalizeGlucose(selectedAnalysis.estimated_activity_coefficients.steps_per_minute || 0, units).toFixed(units.includes('mmol') ? 3 : 2)}
                                    </span>
                                    <span className="text-[10px] text-zinc-500">{units} per step/min</span>
                                </div>
                                {selectedAnalysis.activity_confidence?.steps_per_minute && (
                                    <div className="mt-2 text-[10px] text-zinc-600 font-mono">
                                        CI: [{denormalizeGlucose(selectedAnalysis.activity_confidence.steps_per_minute.lower, units).toFixed(units.includes('mmol') ? 3 : 2)}, {denormalizeGlucose(selectedAnalysis.activity_confidence.steps_per_minute.upper, units).toFixed(units.includes('mmol') ? 3 : 2)}]
                                    </div>
                                )}
                            </div>

                            <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-4 hover:border-indigo-500/30 transition-colors">
                                <div className="text-[10px] font-bold text-zinc-500 mb-1 uppercase tracking-widest">HR Spike Impact</div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-mono font-bold text-white">
                                        {selectedAnalysis.estimated_activity_coefficients.hr_spike >= 0 ? '+' : ''}
                                        {denormalizeGlucose(selectedAnalysis.estimated_activity_coefficients.hr_spike || 0, units).toFixed(units.includes('mmol') ? 2 : 1)}
                                    </span>
                                    <span className="text-[10px] text-zinc-500">{units} per unit</span>
                                </div>
                                {selectedAnalysis.activity_confidence?.hr_spike && (
                                    <div className="mt-2 text-[10px] text-zinc-600 font-mono">
                                        CI: [{denormalizeGlucose(selectedAnalysis.activity_confidence.hr_spike.lower, units).toFixed(units.includes('mmol') ? 2 : 1)}, {denormalizeGlucose(selectedAnalysis.activity_confidence.hr_spike.upper, units).toFixed(units.includes('mmol') ? 2 : 1)}]
                                    </div>
                                )}
                            </div>

                            <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-4 lg:col-span-2">
                                <div className="text-[10px] font-bold text-zinc-500 mb-2 uppercase tracking-widest">Interpretation</div>
                                <p className="text-[11px] text-zinc-400 leading-relaxed italic">
                                    {(() => {
                                        const stepsCoeff = selectedAnalysis.estimated_activity_coefficients.steps_per_minute || 0;
                                        const hrCoeff = selectedAnalysis.estimated_activity_coefficients.hr_spike || 0;
                                        const bothZero = Math.abs(stepsCoeff) < 0.01 && Math.abs(hrCoeff) < 0.01;

                                        if (bothZero) {
                                            return `"Based on ${selectedAnalysis.windows_analyzed} windows, the optimizer found no significant glucose impact from activity. This could mean: (1) insufficient activity data in the analyzed period, (2) activity effects are being absorbed by ISF/ICR parameters, or (3) your glucose is not significantly affected by movement."`;
                                        } else if (stepsCoeff < 0) {
                                            return `"Your body's sensitivity to physical activity, calculated from ${selectedAnalysis.windows_analyzed} data windows. Movement consistently lowers your glucose."`;
                                        } else {
                                            return `"Your body's sensitivity to physical activity, calculated from ${selectedAnalysis.windows_analyzed} data windows. Movement has a neutral or minimal effect on your glucose."`;
                                        }
                                    })()}
                                </p>
                                {Math.abs(selectedAnalysis.estimated_activity_coefficients.steps_per_minute || 0) < 0.01 &&
                                    Math.abs(selectedAnalysis.estimated_activity_coefficients.hr_spike || 0) < 0.01 && (
                                        <div className="mt-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                            <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">⚠️ Zero Impact Detected</div>
                                            <div className="text-[10px] text-amber-300/80 leading-relaxed">
                                                Try running analysis on a period with more varied activity levels, or check if activity data is being recorded properly.
                                            </div>
                                        </div>
                                    )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. TUNING SUGGESTIONS SECTION */}
                {
                    selectedAnalysis?.tuning_suggestions?.length > 0 && (
                        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm">
                            <h2 className="text-zinc-400 font-bold text-xs uppercase tracking-wider mb-6 flex items-center gap-2">
                                <TrendingUp size={16} className="text-emerald-400" /> Tuning Recommendations
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {selectedAnalysis.tuning_suggestions.map((s: any, i: number) => (
                                    <div key={i} className="p-4 bg-zinc-100 dark:bg-zinc-950/40 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/40 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
                                                    {s.parameter === 'activity_steps' ? 'Aerobic (Steps)' :
                                                        s.parameter === 'activity_hr' ? 'Anaerobic (HR)' :
                                                            s.parameter === 'activity_stairs' ? 'Stairs' :
                                                                s.parameter === 'activity_calories' ? 'Calories' : s.parameter}
                                                </span>
                                                <span className={`text-lg font-mono font-bold ${s.changePercentage > 0 ? 'text-indigo-400' : 'text-emerald-400'}`}>
                                                    {(s.parameter === 'isf' || s.parameter?.startsWith('activity'))
                                                        ? s.suggestedValue.toFixed(units.includes('mmol') ? 1 : 0)
                                                        : s.suggestedValue.toFixed(1)}
                                                </span>
                                            </div>
                                            <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${s.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400' : s.confidence === 'medium' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-500/20 text-zinc-400'}`}>
                                                {s.confidence} Confidence
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-xs text-zinc-500 line-through">
                                                {(s.parameter === 'isf' || s.parameter?.startsWith('activity'))
                                                    ? s.currentValue.toFixed(units.includes('mmol') ? 1 : 0)
                                                    : s.currentValue.toFixed(1)}
                                            </span>
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
                                                    <th className="px-4 py-3 text-right">Recommended ({units}/U)</th>
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
                                                                {denormalizeISF(val, units).toFixed(units.includes('mmol') ? 1 : 0)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-mono text-zinc-500 text-xs">
                                                                {Array.isArray(conf)
                                                                    ? `${denormalizeISF(conf[0], units).toFixed(units.includes('mmol') ? 1 : 0)} - ${denormalizeISF(conf[1], units).toFixed(units.includes('mmol') ? 1 : 0)}`
                                                                    : 'N/A'}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-mono text-emerald-500/80">
                                                                {blockIdx === 0 && <span className="text-[10px] text-zinc-600 mr-2">(Global Avg)</span>}
                                                                ~{denormalizeISF(activeISFVal, units).toFixed(units.includes('mmol') ? 1 : 0)}
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
                                                    <th className="px-4 py-3 text-right">Recommended (g/U)</th>
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
                                            <div className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                                                {new Date(item.timestamp).toLocaleString()}
                                                {item.llm_explanation && <Sparkles size={12} className="text-purple-400" />}
                                            </div>
                                            <div className="text-xs text-zinc-500">
                                                R²: {item.r_squared?.toFixed(2)} • {item.windows_analyzed} windows
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-mono text-indigo-400">
                                            ISF: {Array.isArray(item.estimated_isf) ? Math.round(item.estimated_isf.reduce((a: number, b: number) => a + b, 0) / item.estimated_isf.length) : item.estimated_isf?.toFixed(0)}
                                            • ICR: {Array.isArray(item.estimated_icr) ? Math.round(item.estimated_icr.reduce((a: number, b: number) => a + b, 0) / item.estimated_icr.length) : item.estimated_icr?.toFixed(0)}
                                        </div>
                                        {item.estimated_activity_coefficients && (
                                            <div className="text-[10px] font-mono text-zinc-500 mt-1">
                                                Steps: {item.estimated_activity_coefficients.steps_per_minute?.toFixed(2)} • HR: {item.estimated_activity_coefficients.hr_spike?.toFixed(1)}
                                            </div>
                                        )}
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
