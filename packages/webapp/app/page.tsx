'use client';

import { useState, useEffect, useCallback } from 'react';
import GlucoseChart from '@/components/GlucoseChart';
import { Activity, Clock, RefreshCw, Battery, Moon } from 'lucide-react';

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

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000); // 5 min refresh
    return () => clearInterval(interval);
  }, [fetchData]);

  // Current glucose display
  const current = data.length > 0 ? data[data.length - 1] : null;
  const currentBg = current?.glucose?.current?.sgv;
  const units = current?.glucose?.units || 'mg/dL';
  const trend = current?.glucose?.current?.trend; // Add trend arrow logic later
  const delta = current?.glucose?.current?.delta5m;

  return (
    <div className="min-h-screen bg-black text-zinc-100 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-zinc-900">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-black shadow-[0_0_15px_-3px_rgba(16,185,129,0.5)]">
              <Moon size={20} className="fill-current" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">NightManager</h1>
          </div>

          <button
            onClick={() => fetchData()}
            className="p-2 transition-colors hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white"
            aria-label="Refresh"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Current Status Card */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              {current?.iob?.total?.toFixed(1) || '0.0'} u
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-zinc-400">
              <Battery size={16} />
              <span className="text-xs font-uppercase font-bold">COB</span>
            </div>
            <div className="text-2xl font-mono font-bold text-amber-400">
              {current?.cob?.total?.toFixed(0) || '0'} g
            </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-200">History</h2>
            <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.label}
                  onClick={() => setWindowSize(range.value)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${windowSize === range.value
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          <GlucoseChart data={data} isLoading={loading} />
        </div>
      </main>
    </div>
  );
}
