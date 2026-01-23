'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Header from '@/components/Header';
import GlucoseChart from '@/components/GlucoseChart';
import ImpactChart from '@/components/ImpactChart';
import ActivityChart from '@/components/ActivityChart';
import AnalysisTile from '@/components/AnalysisTile';
import StatusHeader from '@/components/StatusHeader';
import ChartControls from '@/components/ChartControls';
import { RefreshCw } from 'lucide-react';
import {
  transformGlucoseData,
  transformImpactData,
  transformActivityData
} from '@/lib/chartUtils';

export default function Home() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingType, setLoadingType] = useState<'fetch' | 'recalculate'>('fetch');
  const [windowSize, setWindowSize] = useState(3 * 60);
  const [activitySummary, setActivitySummary] = useState<any>(null);
  const [activityHistory, setActivityHistory] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [viewOffsetMinutes, setViewOffsetMinutes] = useState(0);

  // Derived values
  const current = useMemo(() => data.length > 0 ? data[data.length - 1] : null, [data]);
  const units = useMemo(() => current?.glucose?.units || 'mg/dL', [current]);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setLoadingType(forceRefresh ? 'recalculate' : 'fetch');
    try {
      // 1. Fetch Glucose History
      let historyUrl = `/api/history?windowSize=${windowSize}&bucketSize=5`;
      if (viewOffsetMinutes > 0) {
        const endTime = new Date(Date.now() - viewOffsetMinutes * 60 * 1000);
        historyUrl += `&startTime=${endTime.toISOString()}`;
      }
      if (forceRefresh) historyUrl += `&refresh=true`;

      // 2. Fetch Activity History
      let activityUrl = `/api/activity/history?windowSize=${windowSize}`;
      if (viewOffsetMinutes > 0) {
        const endTime = new Date(Date.now() - viewOffsetMinutes * 60 * 1000);
        activityUrl += `&startTime=${endTime.toISOString()}`;
      }

      const [historyRes, activitySummaryRes, activityHistoryRes] = await Promise.all([
        fetch(historyUrl),
        fetch('/api/activity/summary'),
        fetch(activityUrl)
      ]);

      if (historyRes.ok) setData(await historyRes.json());
      if (activitySummaryRes.ok) setActivitySummary(await activitySummaryRes.json());
      if (activityHistoryRes.ok) setActivityHistory(await activityHistoryRes.json());

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [windowSize, viewOffsetMinutes]);

  // Analysis state
  const [analysisTimestamp, setAnalysisTimestamp] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const analysisCache = useRef<Map<string, any>>(new Map());

  const fetchAnalysis = useCallback(async (ts: string) => {
    if (analysisCache.current.has(ts)) {
      setAnalysisData(analysisCache.current.get(ts));
      return;
    }

    setAnalysisLoading(true);
    try {
      const res = await fetch(`/api/analysis?timestamp=${encodeURIComponent(ts)}`);
      if (res.ok) {
        const json = await res.json();
        analysisCache.current.set(ts, json);
        setAnalysisData(json);
      }
    } catch (error) {
      console.error('Error fetching analysis:', error);
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  useEffect(() => {
    if (analysisTimestamp) fetchAnalysis(analysisTimestamp);
  }, [analysisTimestamp, fetchAnalysis]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const [preferences, setPreferences] = useState<any>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.user_preferences) {
          setPreferences(data.user_preferences);
        }
      })
      .catch(err => console.error('Failed to load preferences:', err));
  }, []);

  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);

  // Clear selection and cache on view changes
  useEffect(() => {
    setSelectedPoint(null);
    setAnalysisTimestamp(null);
    setAnalysisData(null);
    analysisCache.current.clear();
  }, [windowSize, viewOffsetMinutes]);

  const getTrendArrow = (trend: string | number | undefined) => {
    const arrows: Record<string, string> = {
      'DoubleUp': '↑↑', 'SingleUp': '↑', 'FortyFiveUp': '↗', 'Flat': '→',
      'FortyFiveDown': '↘', 'SingleDown': '↓', 'DoubleDown': '↓↓',
      '1': '↑↑', '2': '↑', '3': '↗', '4': '→', '5': '↘', '6': '↓', '7': '↓↓'
    };
    return trend ? arrows[trend.toString()] || '' : '';
  };

  const timeDomain = useMemo(() => {
    if (data.length === 0) return [null, null];
    const endTime = viewOffsetMinutes > 0
      ? new Date(Date.now() - viewOffsetMinutes * 60 * 1000).getTime()
      : new Date(data[data.length - 1].meta?.status_date || Date.now()).getTime();
    const startTime = endTime - (windowSize * 60 * 1000);
    return [startTime, endTime] as [number, number];
  }, [data, windowSize, viewOffsetMinutes]);

  // Centralized data transformation
  const glucoseChartData = useMemo(() =>
    transformGlucoseData(data, timeDomain[0] ? timeDomain : undefined),
    [data, timeDomain]
  );

  const impactChartData = useMemo(() =>
    transformImpactData(data, timeDomain[0] ? timeDomain : undefined),
    [data, timeDomain]
  );

  const activityChartData = useMemo(() =>
    transformActivityData(activityHistory, timeDomain[0] ? timeDomain : undefined),
    [activityHistory, timeDomain]
  );

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
        <StatusHeader
          current={current}
          units={preferences?.units || units}
          activitySummary={activitySummary}
          getTrendArrow={getTrendArrow}
        />

        <div className="space-y-4">
          <ChartControls
            windowSize={windowSize}
            viewOffsetMinutes={viewOffsetMinutes}
            setWindowSize={setWindowSize}
            setViewOffsetMinutes={setViewOffsetMinutes}
            fetchData={fetchData}
            loading={loading}
          />

          <div className="relative">
            <GlucoseChart
              data={glucoseChartData}
              isLoading={loading}
              targetLow={preferences?.low_threshold}
              targetHigh={preferences?.high_threshold}
              units={preferences?.units}
              loadingType={loadingType}
              timeDomain={timeDomain}
              visibleLines={{
                glucose: true, iob: true, cob: true,
                insulinImpact: true, carbImpact: true, basal: true
              }}
              onClick={(point) => {
                setSelectedPoint(point);
                if (point.meta?.status_date) setAnalysisTimestamp(point.meta.status_date);
              }}
            />

            {selectedPoint && (
              <div
                className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-zinc-950/90 border border-zinc-700/50 rounded-full px-4 py-2 shadow-2xl backdrop-blur-md flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-200 cursor-pointer"
                onClick={() => setSelectedPoint(null)}
              >
                <div className="text-xs font-mono text-zinc-500 border-r border-zinc-800 pr-3">
                  {selectedPoint.meta?.status_date ? new Date(selectedPoint.meta.status_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">{selectedPoint.glucose?.current?.sgv}</span>
                  <span className="text-xs text-zinc-600 hidden sm:inline">{units}</span>
                </div>
                <div className="flex items-center gap-2 pl-3 border-l border-zinc-800">
                  <span className="text-blue-500 text-xs font-mono">I: {(selectedPoint.iob?.calculated?.totalIOB ?? 0).toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-orange-400 text-xs font-mono">C: {(selectedPoint.cob?.calculated?.cob ?? 0).toFixed(0)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-violet-400 text-xs font-mono">A: {(selectedPoint.activity?.totalImpact ?? 0).toFixed(1)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <ImpactChart
              data={impactChartData}
              isLoading={loading}
              timeDomain={timeDomain}
            />
          </div>

          <div className="mt-4">
            <ActivityChart
              data={activityChartData}
              isLoading={loading}
              timeDomain={timeDomain}
            />
          </div>

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

