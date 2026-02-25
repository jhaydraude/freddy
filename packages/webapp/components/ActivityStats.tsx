'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Line, ComposedChart } from 'recharts';
import { format } from 'date-fns';
import { Activity, Heart, Footprints } from 'lucide-react';

interface ActivityStatsProps {
    activity: {
        stats: {
            avgDailySteps: number;
            totalSteps: number;
            heartRate: {
                min: number;
                max: number;
                median: number;
                mean: number;
            };
        };
        dailySeries: Array<{
            date: string;
            steps: number;
            medianHeartRate: number | null;
            maxHeartRate: number | null;
            minHeartRate: number | null;
        }>;
    } | null;
}

export default function ActivityStats({ activity }: ActivityStatsProps) {
    if (!activity || !activity.stats) return null;

    const cards = [
        { label: 'Avg Daily Steps', value: activity.stats.avgDailySteps.toLocaleString(), unit: '', icon: Footprints },
        { label: 'Median Heart Rate', value: Math.round(activity.stats.heartRate.median).toString(), unit: 'bpm', icon: Heart },
        { label: 'Min Heart Rate', value: Math.round(activity.stats.heartRate.min).toString(), unit: 'bpm', icon: Activity },
        { label: 'Max Heart Rate', value: Math.round(activity.stats.heartRate.max).toString(), unit: 'bpm', icon: Activity }
    ];

    const formattedDaily = activity.dailySeries.map(d => ({
        ...d,
        label: format(new Date(d.date), 'MMM d')
    }));

    // Check if we have any valid data to show graphs
    const hasSteps = formattedDaily.some(d => d.steps > 0);
    const hasHR = formattedDaily.some(d => d.medianHeartRate !== null);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
            <h3 className="text-xl font-black text-zinc-100 uppercase tracking-tighter flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span> Activity & Biometrics
            </h3>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((card, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 space-y-2 backdrop-blur-sm transition-transform hover:scale-[1.02]">
                        <div className="flex items-center gap-1.5 opacity-60">
                            <card.icon size={12} className="text-zinc-400" />
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{card.label}</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-rose-400 tracking-tight">{card.value}</span>
                            {card.unit && <span className="text-[10px] text-zinc-600 font-bold uppercase">{card.unit}</span>}
                        </div>
                    </div>
                ))}
            </div>

            {hasSteps && (
                <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-sm space-y-6">
                    <div>
                        <h4 className="text-sm font-bold text-zinc-300">Daily Steps Profile</h4>
                        <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">Total step count per day</p>
                    </div>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={formattedDaily} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                                <XAxis
                                    dataKey="label"
                                    stroke="#52525b"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="#52525b"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(val) => val.toLocaleString()}
                                />
                                <Tooltip
                                    offset={60}
                                    contentStyle={{
                                        backgroundColor: '#18181b',
                                        border: '1px solid #27272a',
                                        borderRadius: '12px',
                                        padding: '12px'
                                    }}
                                    itemStyle={{ color: '#e4e4e7', fontSize: '12px', fontWeight: 'bold' }}
                                    labelStyle={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px' }}
                                    formatter={(value: number | [number, number]) => [value.toLocaleString(), 'Steps']}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                <Bar dataKey="steps" fill="#f43f5e" name="Steps" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {hasHR && (
                <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-sm space-y-6">
                    <div>
                        <h4 className="text-sm font-bold text-zinc-300">Daily Heart Rate Profile</h4>
                        <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">Median heartrate per day</p>
                    </div>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={formattedDaily} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                                <XAxis
                                    dataKey="label"
                                    stroke="#52525b"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="#52525b"
                                    domain={['dataMin - 10', 'dataMax + 10']}
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    offset={60}
                                    cursor={{ fill: '#27272a', opacity: 0.4 }}
                                    contentStyle={{
                                        backgroundColor: '#18181b',
                                        border: '1px solid #27272a',
                                        borderRadius: '12px',
                                        padding: '12px'
                                    }}
                                    itemStyle={{ color: '#e4e4e7', fontSize: '12px', fontWeight: 'bold' }}
                                    labelStyle={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px' }}
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    formatter={(value: any, name: string) => {
                                        if (name === "hrRange" && Array.isArray(value)) {
                                            return [`${Math.round(value[0])} - ${Math.round(value[1])} bpm`, 'HR Range'];
                                        }
                                        if (name === "hrRange") return null;
                                        if (Array.isArray(value)) return [`${Math.round(value[0])} - ${Math.round(value[1])} bpm`, 'HR Range'];
                                        return [`${Math.round(value)} bpm`, name === "medianHeartRate" ? "Median HR" : "Heart Rate"];
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                {/* Hidden bar to provide the range data array [min, max] to the tooltip & chart */}
                                <Bar
                                    dataKey={(d) => [d.minHeartRate, d.maxHeartRate]}
                                    name="hrRange"
                                    fill="#f43f5e"
                                    opacity={0.2}
                                    radius={[4, 4, 4, 4]}
                                    barSize={20}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="medianHeartRate"
                                    stroke="#fb7185"
                                    strokeWidth={3}
                                    dot={{ r: 4, fill: '#18181b', stroke: '#fb7185', strokeWidth: 2 }}
                                    name="Median HR"
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
}
