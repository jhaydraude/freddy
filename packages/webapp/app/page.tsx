'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/Header';
import GlucoseChart from '@/components/GlucoseChart';
import ActivityChart from '@/components/ActivityChart';
import AnalysisTile from '@/components/AnalysisTile';
import { Activity, Clock, RefreshCw, Battery, Footprints, HeartPulse } from 'lucide-react';

const TIME_RANGES = [
  { label: '3h', value: 3 * 60 },
  { label: '6h', value: 6 * 60 },
  { label: '12h', value: 12 * 60 },
  { label: '24h', value: 24 * 60 },
];

export default function Home() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [windowSize, setWindowSize] = useState(3 * 60);
  const [activitySummary, setActivitySummary] = useState<any>(null);
  const [activityHistory, setActivityHistory] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const fetchActivitySummary = useCallback(async () => {
    try {
      const res = await fetch('/api/activity/summary');
      if (!res.ok) throw new Error('Failed to fetch activity summary');
      const json = await res.json();
      setActivitySummary(json);
    } catch (error) {
      console.error('Error fetching activity summary:', error);
    }
  }, []);

  const fetchActivityHistory = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/activity/history?windowSize=${windowSize}`);
      if (!res.ok) throw new Error('Failed to fetch activity history');
      const json = await res.json();
      setActivityHistory(json);
    } catch (error) {
      console.error('Error fetching activity history:', error);
    } finally {
      setActivityLoading(false);
    }
  }, [windowSize]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history?windowSize=${windowSize}&bucketSize=5`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [windowSize]);

  // Analysis state
  const [analysisTimestamp, setAnalysisTimestamp] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Cache for analysis data to prevent redundant fetches
  const analysisCache = useRef<Map<string, any>>(new Map());

  const fetchAnalysis = useCallback(async (ts: string) => {
    // Check cache first for instant display
    if (analysisCache.current.has(ts)) {
      setAnalysisData(analysisCache.current.get(ts));
      return;
    }

    setAnalysisLoading(true);
    try {
      const res = await fetch(`/api/analysis?timestamp=${encodeURIComponent(ts)}`);
      if (!res.ok) throw new Error('Failed to fetch analysis');
      const json = await res.json();

      // Cache the result for future clicks
      analysisCache.current.set(ts, json);
      setAnalysisData(json);
    } catch (error) {
      console.error('Error fetching analysis:', error);
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  useEffect(() => {
    if (analysisTimestamp) {
      fetchAnalysis(analysisTimestamp);
    }
  }, [analysisTimestamp, fetchAnalysis]);

  useEffect(() => {
    fetchData();
    fetchActivitySummary();
    fetchActivityHistory();
    const interval = setInterval(() => {
      fetchData();
      fetchActivitySummary();
      fetchActivityHistory();
    }, 5 * 60 * 1000); // 5 min refresh
    return () => clearInterval(interval);
  }, [fetchData, fetchActivitySummary, fetchActivityHistory]);

  // Current glucose display
  const current = data.length > 0 ? data[data.length - 1] : null;
  const currentBg = current?.glucose?.current?.sgv;
  const units = current?.glucose?.units || 'mg/dL';
  const trend = current?.glucose?.current?.trend; // Add trend arrow logic later
  const delta = current?.glucose?.current?.delta5m;

  // Selected point state
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);

  // Line visibility state
  const [visibleLines, setVisibleLines] = useState({
    glucose: true,
    iob: false,
    cob: false,
    insulinImpact: false,
    carbImpact: false,
    basal: false
  });

  const toggleLine = (key: keyof typeof visibleLines) => {
    setVisibleLines(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Clear selection and cache only when window size changes, not on data updates
  // This preserves the analysis panel during auto-refresh
  useEffect(() => {
    setSelectedPoint(null);
    setAnalysisTimestamp(null);
    setAnalysisData(null);
    // Clear cache when time range changes to prevent stale data
    analysisCache.current.clear();
  }, [windowSize]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 pb-20 relative">
      <Header
        action={
          <button
            onClick={() => fetchData()}
            className="p-2 transition-colors hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white"
            aria-label="Refresh"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        }
      />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Current Status Card */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="col-span-2 p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-700"></div>

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 font-medium text-sm uppercase tracking-wider">Glucose</span>
                <span className="text-emerald-500 text-xs font-mono">{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
              </div>

              <div className="flex items-end gap-3">
                <span className="text-6xl font-bold tracking-tighter text-white">
                  {currentBg || '---'}
                </span>
                <div className="mb-2 flex flex-col">
                  <span className="text-zinc-400 font-medium text-lg">{units}</span>
                  <span className={`text-sm font-bold ${delta && delta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {delta ? (delta > 0 ? `+${delta}` : delta) : '--'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-zinc-400">
              <Activity size={16} />
              <span className="text-xs font-uppercase font-bold">IOB</span>
            </div>
            <div className="text-2xl font-mono font-bold text-blue-400">
              {(current?.iob?.calculated?.totalIOB ?? 0).toFixed(1)} u
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-zinc-400">
              <Battery size={16} />
              <span className="text-xs font-uppercase font-bold">COB</span>
            </div>
            <div className="text-2xl font-mono font-bold text-amber-400">
              {(current?.cob?.calculated?.cob ?? 0).toFixed(0)} g
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-zinc-400">
              <Footprints size={16} />
              <span className="text-xs font-uppercase font-bold">Steps Today</span>
            </div>
            <div className="text-2xl font-mono font-bold text-violet-400">
              {activitySummary?.stepsToday?.toLocaleString() || '0'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-zinc-400">
              <HeartPulse size={16} />
              <span className="text-xs font-uppercase font-bold">Heart Rate</span>
            </div>
            <div className="text-2xl font-mono font-bold text-rose-400 flex items-baseline gap-1">
              {activitySummary?.latestHeartRate?.bpm || '--'}
              <span className="text-xs text-zinc-500 font-sans">bpm</span>
              {activitySummary?.heartRateStats && (
                <span className="ml-auto text-[10px] text-zinc-600 font-sans uppercase">
                  {activitySummary.heartRateStats.min}-{activitySummary.heartRateStats.max}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800 overflow-x-auto no-scrollbar">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.label}
                  onClick={() => setWindowSize(range.value)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all whitespace-nowrap ${windowSize === range.value
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                  {range.label}
                </button>
              ))}
            </div>

            {/* Line Toggles */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => toggleLine('glucose')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${visibleLines.glucose
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                  : 'bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700'
                  }`}
              >
                Glucose
              </button>
              <button
                onClick={() => toggleLine('iob')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${visibleLines.iob
                  ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                  : 'bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700'
                  }`}
              >
                IOB
              </button>
              <button
                onClick={() => toggleLine('cob')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${visibleLines.cob
                  ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                  : 'bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700'
                  }`}
              >
                COB
              </button>
              <button
                onClick={() => toggleLine('insulinImpact')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${visibleLines.insulinImpact
                  ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400'
                  : 'bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700'
                  }`}
              >
                Ins. Impact
              </button>
              <button
                onClick={() => toggleLine('carbImpact')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${visibleLines.carbImpact
                  ? 'bg-rose-500/10 border-rose-500 text-rose-400'
                  : 'bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700'
                  }`}
              >
                Carb Impact
              </button>
              <button
                onClick={() => toggleLine('basal')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${visibleLines.basal
                  ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400'
                  : 'bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700'
                  }`}
              >
                Basal
              </button>
            </div>
          </div>

          <div className="relative">
            <GlucoseChart
              data={data}
              isLoading={loading}
              visibleLines={visibleLines}
              onClick={(point) => {
                setSelectedPoint(point);
                if (point.meta?.status_date) {
                  setAnalysisTimestamp(point.meta.status_date);
                }
              }}
            />

            {/* Selected Point Pill Overlay */}
            {selectedPoint && (
              <div
                className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-zinc-950/90 border border-zinc-700/50 rounded-full px-4 py-2 shadow-2xl backdrop-blur-md flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-200"
                onClick={() => setSelectedPoint(null)} // Dismiss on click
              >
                <div className="text-xs font-mono text-zinc-500 border-r border-zinc-800 pr-3">
                  {selectedPoint.meta?.status_date ? new Date(selectedPoint.meta.status_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">{selectedPoint.glucose?.current?.sgv}</span>
                  <span className="text-xs text-zinc-600 hidden sm:inline">{units}</span>
                </div>

                <div className="flex items-center gap-2 pl-3 border-l border-zinc-800">
                  <span className="text-blue-400 text-xs font-mono">I: {(selectedPoint.iob?.calculated?.totalIOB ?? 0).toFixed(1)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-xs font-mono">C: {(selectedPoint.cob?.calculated?.cob ?? 0).toFixed(0)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Activity Chart Section */}
          <ActivityChart
            data={activityHistory}
            isLoading={activityLoading}
          />

          {/* Analysis Tile */}
          {(analysisTimestamp || analysisLoading) && (
            <div className="pt-4 scroll-mt-24" id="analysis-section">
              <AnalysisTile
                data={analysisData}
                isLoading={analysisLoading}
                onClose={() => {
                  setAnalysisTimestamp(null);
                  setAnalysisData(null);
                }}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
