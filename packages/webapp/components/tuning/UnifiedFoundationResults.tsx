import React from 'react';
import { Zap, Activity } from 'lucide-react';
import {
    XAxis,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar
} from 'recharts';
import ProfileComparisonPanel from '../profile/ProfileComparisonPanel';

interface UnifiedFoundationResultsProps {
    status: string;
    result: any;
}

export const UnifiedFoundationResults: React.FC<UnifiedFoundationResultsProps> = ({ status, result }) => {
    if (status !== 'completed' || !result?.optimized_values) return null;

    const opt = result.optimized_values;
    const cur = result.current_values;

    const primaryProfile = {
        name: "Active Parameters",
        description: "Your current profile settings",
        dia: cur.dia,
        peak: cur.peak,
        units: cur.units || 'mg/dL',
        basal: cur.basal?.map((v: number, i: number) => ({ time: `${(i * 2).toString().padStart(2, '0')}:00`, value: v })) || [],
        isf: cur.isf?.map((v: number, i: number) => ({ time: `${(i * 4).toString().padStart(2, '0')}:00`, value: v })) || []
    };

    const secondaryProfile = {
        name: "Tuned Recommendation",
        description: "Optimized insulin parameters",
        dia: opt.dia,
        peak: opt.peak,
        units: cur.units || 'mg/dL',
        basal: opt.basal?.map((v: number, i: number) => ({ time: `${(i * 2).toString().padStart(2, '0')}:00`, value: v })) || [],
        isf: opt.isf?.map((v: number, i: number) => ({ time: `${(i * 4).toString().padStart(2, '0')}:00`, value: v })) || []
    };

    return (
        <div className="space-y-8 py-8 animate-in fade-in duration-500">
            {/* Optimization Metadata Tile */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 text-indigo-500/5 rotate-12">
                    <Activity size={120} />
                </div>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Optimization Run Details</h3>
                    <div className="px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-[10px] font-bold uppercase tracking-widest">
                        Insulin Tuner
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
                    <div className="space-y-4 col-span-1">
                        <div>
                            <div className="text-xs text-zinc-500 font-bold uppercase mb-1">Timeframe Reviewed</div>
                            <div className="text-sm font-bold text-white bg-zinc-800/50 inline-block px-3 py-1 rounded-lg border border-zinc-800">
                                {(() => {
                                    const days = result.config?.analysis_period_days || 14;
                                    const end = new Date(result.created_at || Date.now());
                                    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
                                    const format = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                                    return `${format(start)} - ${format(end)} (${days} Days)`;
                                })()}
                            </div>
                        </div>
                        <div className="pt-2 border-t border-zinc-800">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-zinc-500 font-bold uppercase">Model Fit (R²)</span>
                                <span className="text-emerald-400 text-sm font-bold font-mono">{(opt.r_squared * 100).toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 rounded-full"
                                    style={{ width: `${Math.max(0, opt.r_squared * 100)}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-zinc-600 mt-2 italic">
                                R² score of {opt.r_squared.toFixed(3)} based on {opt.windows_analyzed} isolated windows.
                            </p>
                        </div>
                    </div>

                    {result.analysis_summary?.window_distribution && (
                        <div className="col-span-1 md:col-span-2">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Window Distribution (Time of Day)</h4>
                            <div className="h-24 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={result.analysis_summary.window_distribution.map((count: number, i: number) => ({
                                        time: `${i * 2}h`,
                                        count
                                    }))}>
                                        <XAxis dataKey="time" hide />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', fontSize: '10px' }}
                                            labelStyle={{ color: '#71717a' }}
                                        />
                                        <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>
            </div>



            {/* Profile Comparison Panel component */}
            <div className="pt-4 border-t border-zinc-800">
                <ProfileComparisonPanel
                    primaryProfile={primaryProfile}
                    secondaryProfile={secondaryProfile}
                    primaryLabel="Active"
                    secondaryLabel="Tuned"
                    isEditing={false}
                />
            </div>
        </div>
    );
};
