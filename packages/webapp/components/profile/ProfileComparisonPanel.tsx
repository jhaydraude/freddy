import React, { useMemo } from 'react';
import { Settings, Save, Plus, Activity, TrendingUp } from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import ScheduleEditor from '@/components/ScheduleEditor';

export interface ProfileComparisonPanelProps {
    primaryProfile: any;
    secondaryProfile?: any;
    primaryLabel?: string;
    secondaryLabel?: string;
    isEditing?: boolean;
    onProfileChange?: (updatedProfile: any) => void;
    onSave?: () => void;
    saving?: boolean;
}

// Helper: Evaluates a sparse `{ time: "HH:MM", value }` array at a specific Date
function getValueAtTime(schedule: Array<{ time: string, value: number }>, date: Date): number {
    if (!schedule || schedule.length === 0) return 0;
    const minutes = date.getHours() * 60 + date.getMinutes();
    const sorted = [...schedule].sort((a, b) => {
        const [aH, aM] = (a.time || "0:0").split(':').map(Number);
        const [bH, bM] = (b.time || "0:0").split(':').map(Number);
        return ((aH || 0) * 60 + (aM || 0)) - ((bH || 0) * 60 + (bM || 0));
    });
    let activeValue = sorted[0]?.value || 0;
    for (const entry of sorted) {
        const [h, m] = (entry.time || "0:0").split(':').map(Number);
        const entryMinutes = (h || 0) * 60 + (m || 0);
        if (entryMinutes <= minutes) {
            activeValue = entry.value;
        } else {
            break;
        }
    }
    return activeValue;
}

export default function ProfileComparisonPanel({
    primaryProfile,
    secondaryProfile,
    primaryLabel = "Active Profile",
    secondaryLabel = "Tuned Recommendation",
    isEditing = false,
    onProfileChange,
    onSave,
    saving = false
}: ProfileComparisonPanelProps) {

    // Evaluate 24h charts for Basal, ISF, ICR
    const { basalData, isfData, icrData } = useMemo(() => {
        const b = [], s = [], c = [];
        const baseDate = new Date();
        baseDate.setHours(0, 0, 0, 0);

        for (let h = 0; h < 24; h++) {
            baseDate.setHours(h);
            const timeLabel = `${h.toString().padStart(2, '0')}:00`;

            // Evaluate Primary
            const pBasal = getValueAtTime(primaryProfile.basal, baseDate);
            const pIsf = getValueAtTime(primaryProfile.isf, baseDate);
            const pIcr = getValueAtTime(primaryProfile.icr, baseDate);

            // Evaluate Secondary
            let sBasal, sIsf, sIcr;
            if (secondaryProfile) {
                sBasal = getValueAtTime(secondaryProfile.basal, baseDate);
                sIsf = getValueAtTime(secondaryProfile.isf, baseDate);
                sIcr = getValueAtTime(secondaryProfile.icr, baseDate);
            }

            b.push({ time: timeLabel, primary: pBasal, secondary: sBasal });
            s.push({ time: timeLabel, primary: pIsf, secondary: sIsf });
            c.push({ time: timeLabel, primary: pIcr, secondary: sIcr });
        }
        return { basalData: b, isfData: s, icrData: c };
    }, [primaryProfile, secondaryProfile]);

    const units = primaryProfile.units || 'mg/dL';

    const renderScalarComparison = (label: string, primaryVal: any, secondaryVal?: any, isEditable = false, onChangeFn?: (v: string) => void, isNum = false) => {
        return (
            <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase ml-1">{label}</label>
                {isEditing && isEditable ? (
                    <input
                        type={isNum ? "number" : "text"}
                        value={primaryVal || ''}
                        onChange={(e) => onChangeFn && onChangeFn(e.target.value)}
                        className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none transition-colors focus:ring-1 focus:ring-indigo-500/20"
                    />
                ) : (
                    <div className="flex items-center gap-3 w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-300 min-h-[38px]">
                        <span>{primaryVal}</span>
                        {secondaryProfile && secondaryVal !== undefined && (
                            <>
                                <span className="text-zinc-600">→</span>
                                <span className={`font-bold ${secondaryVal > primaryVal ? 'text-indigo-400' : secondaryVal < primaryVal ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                    {secondaryVal}
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderChart = (title: string, data: any[], yFormatter: (v: number) => string, scheduleKey: 'basal' | 'isf' | 'icr') => (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <TrendingUp size={16} /> {title}
            </h3>

            <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 15, right: 10, bottom: 5, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis dataKey="time" stroke="#666" fontSize={10} tickMargin={10} minTickGap={30} />
                        <YAxis stroke="#666" fontSize={10} tickFormatter={yFormatter} />
                        <Line
                            type="stepAfter"
                            dataKey="primary"
                            name={primaryLabel}
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={false}
                            label={(props: any) => {
                                const { x, y, value, index } = props;
                                if (index === 0 || data[index].primary !== data[index - 1].primary) {
                                    return <text x={x + 2} y={y - 8} fill="#10b981" fontSize={10} textAnchor="start" fontWeight="bold">{yFormatter(value)}</text>;
                                }
                                return null;
                            }}
                        />
                        {secondaryProfile && (
                            <Line
                                type="stepAfter"
                                dataKey="secondary"
                                name={secondaryLabel}
                                stroke="#8b5cf6"
                                strokeWidth={2}
                                dot={false}
                                label={(props: any) => {
                                    const { x, y, value, index } = props;
                                    if (value !== undefined && (index === 0 || data[index].secondary !== data[index - 1].secondary)) {
                                        return <text x={x + 2} y={y + 14} fill="#8b5cf6" fontSize={10} textAnchor="start" fontWeight="bold">{yFormatter(value)}</text>;
                                    }
                                    return null;
                                }}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Editing Tabular View */}
            {isEditing && onProfileChange && (
                <div className="pt-4 border-t border-zinc-800/50">
                    <ScheduleEditor
                        title={title}
                        entries={primaryProfile[scheduleKey]}
                        onChange={(newSched) => onProfileChange({ ...primaryProfile, [scheduleKey]: newSched })}
                        unit={scheduleKey === 'isf' ? units : scheduleKey === 'icr' ? 'g/U' : 'U/hr'}
                    />
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header controls for Editing */}
            {isEditing && onSave && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800">
                            <Settings className="text-zinc-400" size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Edit Profile</h2>
                            <p className="text-xs text-zinc-500">Configure parameters and schedules</p>
                        </div>
                    </div>
                    <button
                        onClick={onSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                    >
                        {saving ? <Plus className="animate-spin" size={18} /> : <Save size={18} />}
                        {saving ? 'Saving...' : 'Save Profile'}
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Overview</h3>
                    <div className="space-y-3">
                        {renderScalarComparison("Profile Name", primaryProfile.name, secondaryProfile?.name, true, (v) => onProfileChange && onProfileChange({ ...primaryProfile, name: v }))}
                        {renderScalarComparison("Description", primaryProfile.description, secondaryProfile?.description, true, (v) => onProfileChange && onProfileChange({ ...primaryProfile, description: v }))}
                    </div>
                </div>

                {/* Model Parameters */}
                <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Insulin Action Profile</h3>
                    <div className="grid grid-cols-2 gap-4">
                        {renderScalarComparison("DIA (Hours)", primaryProfile.dia, secondaryProfile?.dia, true, (v) => onProfileChange && onProfileChange({ ...primaryProfile, dia: parseFloat(v) }), true)}
                        {renderScalarComparison("Peak (Minutes)", primaryProfile.peak, secondaryProfile?.peak, true, (v) => onProfileChange && onProfileChange({ ...primaryProfile, peak: parseFloat(v) }), true)}

                        <div className="space-y-1 col-span-2">
                            <label className="text-[10px] font-bold text-zinc-600 uppercase ml-1">Units</label>
                            {isEditing ? (
                                <select
                                    value={primaryProfile.units || 'mg/dL'}
                                    onChange={e => onProfileChange && onProfileChange({ ...primaryProfile, units: e.target.value })}
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none appearance-none cursor-pointer"
                                >
                                    <option value="mg/dL">mg/dL</option>
                                    <option value="mmol/L">mmol/L</option>
                                </select>
                            ) : (
                                <div className="flex items-center gap-3 w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-300">
                                    {primaryProfile.units}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Time Based Attributes */}
            <div className="grid grid-cols-1 gap-6">
                {primaryProfile.basal?.length > 0 && renderChart("Basal Rates", basalData, (v) => `${v}U`, 'basal')}
                {primaryProfile.isf?.length > 0 && renderChart("Insulin Sensitivity (ISF)", isfData, (v) => `${v}${units === 'mmol/L' ? '' : ''}`, 'isf')}
                {primaryProfile.icr?.length > 0 && renderChart("Carb Ratio (ICR)", icrData, (v) => `${v}g`, 'icr')}
            </div>

            {/* Activity Coefficients */}
            {primaryProfile.activityCoefficients && (
                <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Activity size={14} className="text-zinc-500" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Activity Response Settings</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                            <div className="flex justify-between items-end ml-1 mb-2">
                                <label className="text-[10px] font-bold text-zinc-600 uppercase">Steps Impact</label>
                                {isEditing ? (
                                    <span className="text-[10px] font-mono text-indigo-400">{primaryProfile.activityCoefficients?.steps?.toFixed(2)}</span>
                                ) : (
                                    <div className="flex items-center gap-2 text-xs font-mono">
                                        <span>{primaryProfile.activityCoefficients?.steps?.toFixed(2)}</span>
                                        {secondaryProfile?.activityCoefficients?.steps !== undefined && (
                                            <>
                                                <span className="text-zinc-600">→</span>
                                                <span className="text-indigo-400">{secondaryProfile.activityCoefficients.steps.toFixed(2)}</span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                            {isEditing ? (
                                <input
                                    type="range"
                                    min="-0.5"
                                    max="0.1"
                                    step="0.01"
                                    value={primaryProfile.activityCoefficients?.steps || 0}
                                    onChange={e => onProfileChange && onProfileChange({
                                        ...primaryProfile,
                                        activityCoefficients: { ...primaryProfile.activityCoefficients, steps: parseFloat(e.target.value) }
                                    })}
                                    className="w-full accent-indigo-500"
                                />
                            ) : (
                                <div className="h-1 bg-zinc-800 rounded-full w-full opacity-50"></div>
                            )}
                            <p className="text-[9px] text-zinc-600 leading-tight mt-1 italic">Reduction in {units} per step/min. Typical: -0.10</p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between items-end ml-1 mb-2">
                                <label className="text-[10px] font-bold text-zinc-600 uppercase">Heart Rate Impact</label>
                                {isEditing ? (
                                    <span className="text-[10px] font-mono text-indigo-400">{primaryProfile.activityCoefficients?.heartRate?.toFixed(1)}</span>
                                ) : (
                                    <div className="flex items-center gap-2 text-xs font-mono">
                                        <span>{primaryProfile.activityCoefficients?.heartRate?.toFixed(1)}</span>
                                        {secondaryProfile?.activityCoefficients?.heartRate !== undefined && (
                                            <>
                                                <span className="text-zinc-600">→</span>
                                                <span className="text-indigo-400">{secondaryProfile.activityCoefficients.heartRate.toFixed(1)}</span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                            {isEditing ? (
                                <input
                                    type="range"
                                    min="0"
                                    max="5"
                                    step="0.1"
                                    value={primaryProfile.activityCoefficients?.heartRate || 0}
                                    onChange={e => onProfileChange && onProfileChange({
                                        ...primaryProfile,
                                        activityCoefficients: { ...primaryProfile.activityCoefficients, heartRate: parseFloat(e.target.value) }
                                    })}
                                    className="w-full accent-indigo-500"
                                />
                            ) : (
                                <div className="h-1 bg-zinc-800 rounded-full w-full opacity-50"></div>
                            )}
                            <p className="text-[9px] text-zinc-600 leading-tight mt-1 italic">Stress/Anaerobic impact per HR unit. Typical: 1.0</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
