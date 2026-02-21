'use client';

import React, { useState } from 'react';
import {
    X,
    Save,
    Plus,
    CheckCircle2,
    Circle,
    Copy,
    Settings,
    Activity,
    Zap,
    Scale,
    Timer,
    Check
} from 'lucide-react';

interface ApplySettingsDialogProps {
    open: boolean;
    onClose: () => void;
    onApply: (options: ApplyOptions) => void;
    isApplying: boolean;
    analysisResult: any;
}

export interface ApplyOptions {
    mode: 'overwrite' | 'create';
    newName?: string;
    params: {
        dia: boolean;
        peak: boolean;
        basal: boolean;
        isf: boolean;
        icr: boolean;
        activity: boolean;
    };
}

export const ApplySettingsDialog: React.FC<ApplySettingsDialogProps> = ({
    open,
    onClose,
    onApply,
    isApplying,
    analysisResult
}) => {
    const [mode, setMode] = useState<'overwrite' | 'create'>('overwrite');
    const [newName, setNewName] = useState(`Tuned Profile ${new Date().toLocaleDateString()}`);
    const [params, setParams] = useState({
        dia: true,
        peak: true,
        basal: true,
        isf: true,
        icr: !!(analysisResult?.estimated_icr || analysisResult?.optimized_values?.icr),
        activity: !!(analysisResult?.estimated_activity_coefficients || analysisResult?.optimized_values?.activity_coefficients)
    });

    if (!open) return null;

    const toggleParam = (key: keyof typeof params) => {
        setParams(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const hasAnySelection = Object.values(params).some(Boolean);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-xl">
                            <Save className="text-indigo-400" size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Apply Tuning Results</h2>
                            <p className="text-xs text-zinc-500">Select parameters and implementation method</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-8">
                    {/* Implementation Mode */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Implementation Mode</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => setMode('overwrite')}
                                className={`p-4 rounded-2xl border transition-all text-left group ${mode === 'overwrite'
                                        ? 'bg-indigo-500/10 border-indigo-500 ring-1 ring-indigo-500/20'
                                        : 'bg-zinc-950/50 border-zinc-800 hover:border-zinc-700'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <Scale className={mode === 'overwrite' ? 'text-indigo-400' : 'text-zinc-500'} size={20} />
                                    {mode === 'overwrite' ? <CheckCircle2 className="text-indigo-400" size={16} /> : <Circle className="text-zinc-800" size={16} />}
                                </div>
                                <div className="font-bold text-sm text-zinc-200">Overwrite Active</div>
                                <div className="text-[10px] text-zinc-500 mt-1">Update your current active profile with selected values.</div>
                            </button>

                            <button
                                onClick={() => setMode('create')}
                                className={`p-4 rounded-2xl border transition-all text-left group ${mode === 'create'
                                        ? 'bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500/20'
                                        : 'bg-zinc-950/50 border-zinc-800 hover:border-zinc-700'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <Plus className={mode === 'create' ? 'text-emerald-400' : 'text-zinc-500'} size={20} />
                                    {mode === 'create' ? <CheckCircle2 className="text-emerald-400" size={16} /> : <Circle className="text-zinc-800" size={16} />}
                                </div>
                                <div className="font-bold text-sm text-zinc-200">Create New</div>
                                <div className="text-[10px] text-zinc-500 mt-1">Clone active profile, apply changes, and activate the clone.</div>
                            </button>
                        </div>

                        {mode === 'create' && (
                            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                                <label className="text-[10px] font-bold text-zinc-600 uppercase ml-1">New Profile Name</label>
                                <input
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="Enter profile name..."
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:border-emerald-500 outline-none transition-all shadow-inner"
                                />
                            </div>
                        )}
                    </div>

                    {/* Parameter Selection */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Parameters to Update</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <ParamToggle label="DIA" icon={<Timer size={14} />} active={params.dia} onClick={() => toggleParam('dia')} />
                            <ParamToggle label="Peak" icon={<Zap size={14} />} active={params.peak} onClick={() => toggleParam('peak')} />
                            <ParamToggle label="Basal Rates" icon={<Settings size={14} />} active={params.basal} onClick={() => toggleParam('basal')} />
                            <ParamToggle label="ISF" icon={<Activity size={14} />} active={params.isf} onClick={() => toggleParam('isf')} />
                            <ParamToggle
                                label="ICR"
                                icon={<Copy size={14} />}
                                active={params.icr}
                                onClick={() => toggleParam('icr')}
                                disabled={!analysisResult?.estimated_icr && !analysisResult?.optimized_values?.icr}
                            />
                            <ParamToggle
                                label="Activity"
                                icon={<Activity size={14} />}
                                active={params.activity}
                                onClick={() => toggleParam('activity')}
                                disabled={!analysisResult?.estimated_activity_coefficients && !analysisResult?.optimized_values?.activity_coefficients}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 bg-zinc-950/50 border-t border-zinc-800">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl text-sm font-bold text-zinc-500 hover:text-zinc-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        disabled={!hasAnySelection || isApplying}
                        onClick={() => onApply({ mode, newName: mode === 'create' ? newName : undefined, params })}
                        className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 ${mode === 'create' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'
                            } text-white`}
                    >
                        {isApplying ? <Plus className="animate-spin" size={18} /> : (mode === 'create' ? <Plus size={18} /> : <Check size={18} />)}
                        {isApplying ? 'Applying...' : `Apply ${Object.values(params).filter(Boolean).length} Parameters`}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ParamToggle = ({ label, icon, active, onClick, disabled }: { label: string, icon: React.ReactNode, active: boolean, onClick: () => void, disabled?: boolean }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${disabled ? 'opacity-30 grayscale pointer-events-none' : ''
            } ${active
                ? 'bg-zinc-800 border-indigo-500/50 text-indigo-400'
                : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
            }`}
    >
        <div className={active ? 'text-indigo-400' : 'text-zinc-600'}>{icon}</div>
        <span className="text-[11px] font-bold uppercase tracking-tight">{label}</span>
        {active && <Check size={12} className="ml-auto" />}
    </button>
);
