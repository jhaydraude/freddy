'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import GlucoseChart from '@/components/GlucoseChart';
import TagSelector from './components/TagSelector';
import { ISituationWindow, ISituationTag } from '@/lib/db/models';
import { ChevronLeft, ChevronRight, SkipForward, CheckCircle, AlertCircle, Loader2, Plus, Minus, ArrowLeft, ArrowRight, RefreshCw, Layers, Target, Brain, Tag } from 'lucide-react';
import { format } from 'date-fns';
import SituationStats from '@/components/SituationStats';

export default function SituationModellerPage() {
    const [queue, setQueue] = useState<ISituationWindow[]>([]);
    const [tags, setTags] = useState<ISituationTag[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [windowData, setWindowData] = useState<any[]>([]);
    const [dataLoading, setDataLoading] = useState(false);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [generating, setGenerating] = useState(false);
    const [stats, setStats] = useState<any>(null);
    const [training, setTraining] = useState(false);

    // Pan & Zoom State
    const [zoomMinutes, setZoomMinutes] = useState(180); // Default 3h
    const [viewOffsetMinutes, setViewOffsetMinutes] = useState(0); // Offset from window center

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch('/api/classify/stats');
            if (res.ok) setStats(await res.json());
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                const [qRes, tRes] = await Promise.all([
                    fetch('/api/classify/queue'),
                    fetch('/api/classify/tags'),
                    fetchStats()
                ]);
                const qJson = await qRes.json();
                const tJson = await tRes.json();
                setQueue(qJson);
                setTags(tJson);
            } catch (err) {
                console.error('Failed to init classification:', err);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const currentWindow = queue[currentIndex];

    // 2. Fetch data for current window (+ context)
    const fetchWindowData = useCallback(async (window: ISituationWindow, zoom: number, offset: number) => {
        setDataLoading(true);
        try {
            // Calculate center of the highlighted window
            const windowCenter = new Date(new Date(window.window_start).getTime() + (window.duration_minutes * 60 * 1000) / 2);

            // Apply pan offset
            const viewCenter = new Date(windowCenter.getTime() + offset * 60 * 1000);

            // Calculate startTime (which is the END of the window for this API)
            const endTime = new Date(viewCenter.getTime() + (zoom * 60 * 1000) / 2);

            const res = await fetch(`/api/history?startTime=${endTime.toISOString()}&windowSize=${zoom}&bucketSize=5`);
            const json = await res.json();
            setWindowData(json);
        } catch (err) {
            console.error('Failed to fetch window data:', err);
        } finally {
            setDataLoading(false);
        }
    }, []);

    useEffect(() => {
        if (currentWindow) {
            fetchWindowData(currentWindow, zoomMinutes, viewOffsetMinutes);
        }
    }, [currentWindow, zoomMinutes, viewOffsetMinutes, fetchWindowData]);

    useEffect(() => {
        if (currentWindow) {
            // Pre-populate from model predictions if they exist
            if (currentWindow.predicted_tags && currentWindow.predicted_tags.length > 0) {
                const predictedIds = currentWindow.predicted_tags.map(pt => pt.tag_id);
                setSelectedTagIds(predictedIds);
            } else {
                setSelectedTagIds([]);
            }
            setViewOffsetMinutes(0); // Reset pan when window changes
        }
    }, [currentIndex]); // Only reset on index change, not on re-renders

    const handleClearQueue = async () => {
        if (!confirm('Clear all pending windows?')) return;
        setLoading(true);
        try {
            await fetch('/api/classify/queue/clear', { method: 'POST' });
            setQueue([]);
            setCurrentIndex(0);
            await fetchStats();
        } catch (err) {
            console.error('Clear failed:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async (days: number = 7) => {
        setGenerating(true);
        try {
            // Recommendation: Clear queue before regenerating for a clean state
            await fetch('/api/classify/queue/clear', { method: 'POST' });

            const res = await fetch(`/api/classify/generate?days=${days}`, { method: 'POST' });
            if (res.ok) {
                const qRes = await fetch('/api/classify/queue');
                const newQueue = await qRes.json();
                setQueue(newQueue);
                setCurrentIndex(0);
                await fetchStats();
            }
        } catch (err) {
            console.error('Generation failed:', err);
        } finally {
            setGenerating(false);
        }
    };

    const handleTrain = async () => {
        if (!stats?.trainingStatus?.labeledCount || stats.trainingStatus.labeledCount < 10) {
            alert('Need at least 10 labeled windows to train.');
            return;
        }
        setTraining(true);
        try {
            const trainRes = await fetch('/api/classify/train', { method: 'POST' });
            if (trainRes.ok) {
                alert('Model trained successfully!');
                await fetchStats();
            } else {
                const err = await trainRes.json();
                alert(`Training failed: ${err.error}`);
            }
        } catch (err) {
            console.error('Training failed:', err);
        } finally {
            setTraining(false);
        }
    };

    const handleToggleTag = (tagId: string) => {
        setSelectedTagIds(prev =>
            prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
        );
    };

    const handleSubmit = async (status: 'labeled' | 'skipped' | 'normal' = 'labeled') => {
        if (!currentWindow) return;
        setSubmitting(true);

        const finalTags = status === 'normal' ? ['normal'] : selectedTagIds;

        try {
            const res = await fetch('/api/classify/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    window_id: currentWindow.window_id,
                    tags: finalTags,
                    status: status === 'normal' ? 'labeled' : status
                })
            });

            if (res.ok) {
                // Move to next
                if (currentIndex < queue.length - 1) {
                    setCurrentIndex(prev => prev + 1);
                } else {
                    // Refresh queue if at end
                    setLoading(true);
                    const qRes = await fetch('/api/classify/queue');
                    setQueue(await qRes.json());
                    setCurrentIndex(0);
                }
            }
        } catch (err) {
            console.error('Submit failed:', err);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="animate-spin text-zinc-500" size={32} />
            </div>
        );
    }

    if (queue.length === 0) {
        return (
            <div className="min-h-screen bg-black text-white">
                <Header />
                <main className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center space-y-8">
                    <div className="w-24 h-24 bg-zinc-900 rounded-3xl flex items-center justify-center border border-zinc-800 shadow-2xl">
                        <Layers className="text-zinc-700" size={40} />
                    </div>
                    <div className="text-center space-y-2">
                        <h1 className="text-3xl font-bold tracking-tight">Queue Empty</h1>
                        <p className="text-zinc-400 max-w-md">Freddy has no more anomalous windows to classify from the last 3 days. Try scanning further back.</p>
                    </div>

                    <div className="flex flex-col gap-3 w-full max-w-sm">
                        <button
                            onClick={() => handleGenerate(7)}
                            disabled={generating}
                            className="w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-900/20"
                        >
                            {generating ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                            Recent History (Last 7 Days)
                        </button>
                        <button
                            onClick={() => handleGenerate(30)}
                            disabled={generating}
                            className="w-full px-6 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-3 border border-zinc-700"
                        >
                            {generating ? <Loader2 className="animate-spin" size={20} /> : <Layers size={20} />}
                            Deep Search (Last 30 Days)
                        </button>
                        <button
                            onClick={() => handleGenerate(90)}
                            disabled={generating}
                            className="w-full px-6 py-4 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-3"
                        >
                            {generating ? <Loader2 className="animate-spin" size={20} /> : <Target size={20} />}
                            Sparse History (Last 90 Days)
                        </button>
                        <a href="/" className="w-full px-6 py-4 bg-zinc-900/10 hover:bg-zinc-900/30 text-zinc-500 hover:text-zinc-400 rounded-2xl font-bold transition-all text-center">
                            Back to Dashboard
                        </a>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white pb-20">
            <Header />

            <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2">Situation Modeller</h1>
                    <p className="text-zinc-500">Train Freddy to recognize your metabolic patterns by labeling anomalous windows.</p>
                </div>

                <SituationStats hideLabelLink={true} />

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Left/Middle: Graph and Metadata */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                                        disabled={currentIndex === 0}
                                        className="p-1.5 text-zinc-500 hover:text-white disabled:opacity-30 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg border border-zinc-700/50 transition-all"
                                        title="Previous Window"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>

                                    <div>
                                        <h2 className="text-lg font-bold">Window {currentIndex + 1} of {queue.length}</h2>
                                        <p className="text-sm text-zinc-500">
                                            {format(new Date(currentWindow.window_start), 'PPP HH:mm')} - {format(new Date(currentWindow.window_end), 'HH:mm')}
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => setCurrentIndex(prev => Math.min(queue.length - 1, prev + 1))}
                                        disabled={currentIndex === queue.length - 1}
                                        className="p-1.5 text-zinc-500 hover:text-white disabled:opacity-30 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg border border-zinc-700/50 transition-all"
                                        title="Next Window"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full text-xs font-bold uppercase tracking-wider shrink-0">
                                    <AlertCircle size={14} />
                                    {currentWindow.selection_reason}
                                </div>
                            </div>

                            {/* Panning and Zooming Controls */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setViewOffsetMinutes(prev => prev - 60)}
                                        className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-700/50"
                                        title="Pan Back 1h"
                                    >
                                        <ArrowLeft size={16} />
                                    </button>
                                    <button
                                        onClick={() => setViewOffsetMinutes(0)}
                                        className="p-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[10px] font-bold uppercase text-zinc-400 hover:text-white transition-colors border border-zinc-700/50"
                                    >
                                        Center
                                    </button>
                                    <button
                                        onClick={() => setViewOffsetMinutes(prev => prev + 60)}
                                        className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-700/50"
                                        title="Pan Forward 1h"
                                    >
                                        <ArrowRight size={16} />
                                    </button>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-zinc-500 font-bold uppercase mr-1">{zoomMinutes / 60}h View</span>
                                    <button
                                        onClick={() => setZoomMinutes(prev => Math.max(60, prev - 60))}
                                        className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-700/50"
                                        title="Zoom In"
                                    >
                                        <Plus size={16} />
                                    </button>
                                    <button
                                        onClick={() => setZoomMinutes(prev => Math.min(720, prev + 60))}
                                        className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-700/50"
                                        title="Zoom Out"
                                    >
                                        <Minus size={16} />
                                    </button>
                                </div>
                            </div>

                            <GlucoseChart
                                data={windowData}
                                isLoading={dataLoading}
                                visibleLines={{ glucose: true, iob: true, cob: true, insulinImpact: true, carbImpact: true, basal: true }}
                                highlightRange={{
                                    start: new Date(currentWindow.window_start).toISOString(),
                                    end: new Date(currentWindow.window_end).toISOString()
                                }}
                            />
                        </div>

                        {/* Features Stats */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-4 gap-4">
                                <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                                    <span className="text-[10px] text-zinc-500 uppercase block">Unexplained Drift</span>
                                    <span className={`text-lg font-mono font-bold ${Math.abs(currentWindow.features.unexplained_mean_30m) > 15 ? 'text-red-400' : 'text-zinc-300'}`}>
                                        {currentWindow.features.unexplained_mean_30m.toFixed(1)}
                                    </span>
                                </div>
                                <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                                    <span className="text-[10px] text-zinc-500 uppercase block">Volatility</span>
                                    <span className="text-lg font-mono font-bold text-zinc-300">
                                        {currentWindow.features.glucose_volatility.toFixed(1)}
                                    </span>
                                </div>
                                <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                                    <span className="text-[10px] text-zinc-500 uppercase block">Window Delta</span>
                                    <span className="text-lg font-mono font-bold text-zinc-300">
                                        {currentWindow.features.glucose_trend_slope.toFixed(0)}
                                    </span>
                                </div>
                                <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                                    <span className="text-[10px] text-zinc-500 uppercase block">Activity (1h)</span>
                                    <span className="text-lg font-mono font-bold text-zinc-300">
                                        {currentWindow.features.activity_impact_1h.toFixed(1)}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-3 bg-zinc-800/20 border border-zinc-800/50 rounded-xl flex items-center justify-between">
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Glucose Density</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500" style={{ width: `${(currentWindow.features.glucose_density || 0) * 100}%` }} />
                                        </div>
                                        <span className="text-[10px] font-mono text-zinc-400">{((currentWindow.features.glucose_density || 0) * 100).toFixed(0)}%</span>
                                    </div>
                                </div>
                                <div className="p-3 bg-zinc-800/20 border border-zinc-800/50 rounded-xl flex items-center justify-between">
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">HR Density</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500" style={{ width: `${(currentWindow.features.hr_density || 0) * 100}%` }} />
                                        </div>
                                        <span className="text-[10px] font-mono text-zinc-400">{((currentWindow.features.hr_density || 0) * 100).toFixed(0)}%</span>
                                    </div>
                                </div>
                                <div className="p-3 bg-zinc-800/20 border border-zinc-800/50 rounded-xl flex items-center justify-between">
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Sensor Age</span>
                                    <span className="text-[10px] font-mono text-zinc-300">{(currentWindow.features.sensor_age_hours || 0).toFixed(1)}h</span>
                                </div>
                                <div className="p-3 bg-zinc-800/20 border border-zinc-800/50 rounded-xl flex items-center justify-between col-span-3">
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Last Carbs</span>
                                    <span className="text-[10px] font-mono text-zinc-300">
                                        {(currentWindow.features.minutes_since_last_carbs || 360) < 360
                                            ? `${currentWindow.features.last_meal_cob?.toFixed(0)}g (${(currentWindow.features.minutes_since_last_carbs || 0).toFixed(0)}m ago)`
                                            : 'None > 6h'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Actions and Tags */}
                    <div className="space-y-6">
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 lg:sticky lg:top-24">
                            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Classify Situation</h2>

                            <div className="grid grid-cols-1 gap-2 mb-6">
                                <button
                                    onClick={() => handleSubmit('labeled')}
                                    disabled={submitting || selectedTagIds.length === 0}
                                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-zinc-800 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 text-sm"
                                >
                                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <Tag size={18} />}
                                    {submitting ? 'Adding...' : 'Add Label'}
                                </button>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => handleSubmit('normal')}
                                        disabled={submitting}
                                        className="py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-zinc-700"
                                    >
                                        Normal
                                    </button>
                                    <button
                                        onClick={() => handleSubmit('skipped')}
                                        disabled={submitting}
                                        className="py-2 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-400 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                                    >
                                        Skip
                                    </button>
                                </div>
                            </div>

                            <TagSelector
                                tags={tags}
                                selectedTagIds={selectedTagIds}
                                onToggleTag={handleToggleTag}
                            />

                        </div>

                        {/* Redundant sections removed as they are now in SituationStats */}
                    </div>
                </div>
            </main>
        </div>
    );
}
