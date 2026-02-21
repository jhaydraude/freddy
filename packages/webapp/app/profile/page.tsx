'use client';

import Header from '@/components/Header';
import { useState, useEffect } from 'react';
import {
    Settings,
    Save,
    Trash2,
    Plus,
    CheckCircle2,
    AlertCircle,
    Download,
    Activity,
    History,
    Sparkles,
    Check
} from 'lucide-react';
import ScheduleEditor from '@/components/ScheduleEditor';
import Link from 'next/link';

export default function ProfileManagerPage() {
    const [profiles, setProfiles] = useState<any[]>([]);
    const [activeProfile, setActiveProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [nsUpdateAvailable, setNsUpdateAvailable] = useState<any>(null);

    // Editor state
    const [editingProfile, setEditingProfile] = useState<any>(null);
    const [isNew, setIsNew] = useState(false);

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/profiles');
            if (res.ok) {
                const data = await res.json();
                setProfiles(data);
                const active = data.find((p: any) => p.isActive);
                setActiveProfile(active);
                if (!editingProfile && active) {
                    setEditingProfile(JSON.parse(JSON.stringify(active)));
                }
            }
        } catch (error) {
            console.error('Failed to load profiles', error);
        } finally {
            setLoading(false);
        }
    };

    const checkNSUpdate = async () => {
        try {
            const res = await fetch('/api/profiles?action=check');
            if (res.ok) {
                const data = await res.json();
                if (data.available) {
                    setNsUpdateAvailable(data);
                }
            }
        } catch (error) {
            console.error('Failed to check NS update', error);
        }
    };

    useEffect(() => {
        fetchProfiles();
        checkNSUpdate();
    }, []);

    const handleSave = async () => {
        if (!editingProfile) return;
        setSaving(true);
        try {
            const url = isNew ? '/api/profiles' : `/api/profiles/${editingProfile._id}`;
            const method = isNew ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingProfile)
            });

            if (res.ok) {
                const saved = await res.json();
                setIsNew(false);
                setEditingProfile(saved);
                await fetchProfiles();
                alert('Profile saved successfully');
            } else {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save');
            }
        } catch (error) {
            console.error('Failed to save profile', error);
            alert('Failed to save profile');
        } finally {
            setSaving(false);
        }
    };

    const handleActivate = async (id: string) => {
        try {
            const res = await fetch(`/api/profiles/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'activate' })
            });

            if (res.ok) {
                await fetchProfiles();
            }
        } catch (error) {
            console.error('Failed to activate profile', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (id === activeProfile?._id) {
            alert('Cannot delete the active profile');
            return;
        }
        if (!confirm('Are you sure you want to delete this profile?')) return;

        try {
            const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (editingProfile?._id === id) {
                    setEditingProfile(activeProfile);
                }
                await fetchProfiles();
            }
        } catch (error) {
            console.error('Failed to delete profile', error);
        }
    };

    const handleImport = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'import' })
            });

            if (res.ok) {
                const imported = await res.json();
                setNsUpdateAvailable(null);
                await fetchProfiles();
                setEditingProfile(imported);
                alert('Profile imported from Nightscout');
            }
        } catch (error) {
            console.error('Failed to import NS profile', error);
            alert('Import failed');
        } finally {
            setLoading(false);
        }
    };

    const createNew = () => {
        setIsNew(true);
        setEditingProfile({
            name: 'New Profile',
            description: '',
            dia: 5,
            peak: 45,
            units: 'mg/dL',
            isf: [{ time: '00:00', value: 50 }],
            basal: [{ time: '00:00', value: 1.0 }],
            icr: [{ time: '00:00', value: 10 }],
            activityCoefficients: { steps: -0.1, heartRate: 1.0 }
        });
    };

    if (loading && profiles.length === 0) {
        return (
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-zinc-100 pb-20">
            <Header title="Freddy Profiles" />

            <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* Left Sidebar: Profile List */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-zinc-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                            <History size={14} /> Saved Profiles
                        </h2>
                        <button
                            onClick={createNew}
                            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-indigo-400 transition-colors"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    {nsUpdateAvailable && (
                        <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl space-y-3">
                            <div className="flex gap-2">
                                <Sparkles size={18} className="text-indigo-400 shrink-0" />
                                <div>
                                    <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-tight">New NS Profile Available</h4>
                                    <p className="text-[11px] text-zinc-400 mt-0.5">"{nsUpdateAvailable.name}" has not been imported yet.</p>
                                </div>
                            </div>
                            <button
                                onClick={handleImport}
                                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                            >
                                <Download size={14} /> Import Now
                            </button>
                        </div>
                    )}

                    <div className="space-y-3">
                        {profiles.map(p => (
                            <div
                                key={p._id}
                                onClick={() => { setEditingProfile(p); setIsNew(false); }}
                                className={`p-4 rounded-2xl border transition-all cursor-pointer relative group ${editingProfile?._id === p._id
                                    ? 'bg-zinc-800/50 border-indigo-500/50'
                                    : 'bg-zinc-900/30 border-zinc-800/50 hover:border-zinc-700'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="text-sm font-bold text-zinc-200">{p.name}</h3>
                                    {p.isActive && (
                                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase rounded border border-emerald-500/20">
                                            Active
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-zinc-500 line-clamp-1">{p.description || 'No description'}</p>

                                <div className="mt-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!p.isActive && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleActivate(p._id); }}
                                            className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-[10px] font-bold uppercase rounded-lg transition-colors flex items-center gap-1"
                                        >
                                            <Check size={12} /> Activate
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(p._id); }}
                                        className="p-1.5 text-zinc-600 hover:text-rose-400 transition-colors ml-auto"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Link
                        href="/profile/analysis"
                        className="flex items-center gap-3 p-4 bg-zinc-950 border border-zinc-800/50 rounded-2xl text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all group"
                    >
                        <Activity size={18} className="group-hover:text-indigo-400 transition-colors" />
                        <div>
                            <div className="text-xs font-bold uppercase tracking-widest">Profile Analysis</div>
                            <div className="text-[10px] text-zinc-600">Tune and optimize based on history</div>
                        </div>
                    </Link>
                </div>

                {/* Right Content: Editor */}
                <div className="lg:col-span-8">
                    {editingProfile ? (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800">
                                        <Settings className="text-zinc-400" size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">{isNew ? 'Create Profile' : 'Edit Profile'}</h2>
                                        <p className="text-xs text-zinc-500">Configure parameters and schedules</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                                >
                                    {saving ? <Plus className="animate-spin" size={18} /> : <Save size={18} />}
                                    {saving ? 'Saving...' : 'Save Profile'}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Basic Info */}
                                <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 space-y-4">
                                    <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Basic Information</h3>
                                    <div className="space-y-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-zinc-600 uppercase ml-1">Profile Name</label>
                                            <input
                                                value={editingProfile.name}
                                                onChange={e => setEditingProfile({ ...editingProfile, name: e.target.value })}
                                                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-zinc-600 uppercase ml-1">Description</label>
                                            <input
                                                value={editingProfile.description || ''}
                                                onChange={e => setEditingProfile({ ...editingProfile, description: e.target.value })}
                                                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Model Parameters */}
                                <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 space-y-4">
                                    <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Model Parameters</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-zinc-600 uppercase ml-1">DIA (Hours)</label>
                                            <input
                                                type="number"
                                                value={editingProfile.dia}
                                                onChange={e => setEditingProfile({ ...editingProfile, dia: parseFloat(e.target.value) })}
                                                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-zinc-600 uppercase ml-1">Peak (Minutes)</label>
                                            <input
                                                type="number"
                                                value={editingProfile.peak}
                                                onChange={e => setEditingProfile({ ...editingProfile, peak: parseFloat(e.target.value) })}
                                                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-zinc-600 uppercase ml-1">Units</label>
                                            <select
                                                value={editingProfile.units}
                                                onChange={e => setEditingProfile({ ...editingProfile, units: e.target.value })}
                                                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none appearance-none"
                                            >
                                                <option value="mg/dL">mg/dL</option>
                                                <option value="mmol/L">mmol/L</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Schedules */}
                            <div className="grid grid-cols-1 gap-6">
                                <ScheduleEditor
                                    title="Basal Rates"
                                    entries={editingProfile.basal}
                                    onChange={basal => setEditingProfile({ ...editingProfile, basal })}
                                    unit="U/hr"
                                />
                                <ScheduleEditor
                                    title="ISF (Sens)"
                                    entries={editingProfile.isf}
                                    onChange={isf => setEditingProfile({ ...editingProfile, isf })}
                                    unit={editingProfile.units}
                                />
                                <ScheduleEditor
                                    title="ICR (Carb Ratio)"
                                    entries={editingProfile.icr}
                                    onChange={icr => setEditingProfile({ ...editingProfile, icr })}
                                    unit="g/U"
                                />
                            </div>

                            {/* Activity Coefficients */}
                            <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Activity size={14} className="text-zinc-500" />
                                    <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Activity Coefficients</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1">
                                        <div className="flex justify-between ml-1 mb-1">
                                            <label className="text-[10px] font-bold text-zinc-600 uppercase">Steps Impact</label>
                                            <span className="text-[10px] font-mono text-indigo-400">{editingProfile.activityCoefficients.steps.toFixed(2)}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="-0.5"
                                            max="0.1"
                                            step="0.01"
                                            value={editingProfile.activityCoefficients.steps}
                                            onChange={e => setEditingProfile({
                                                ...editingProfile,
                                                activityCoefficients: { ...editingProfile.activityCoefficients, steps: parseFloat(e.target.value) }
                                            })}
                                            className="w-full accent-indigo-500"
                                        />
                                        <p className="text-[9px] text-zinc-600 leading-tight mt-1 italic">Reduction in mg/dL per step/min. Typical: -0.10</p>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between ml-1 mb-1">
                                            <label className="text-[10px] font-bold text-zinc-600 uppercase">HR Spike Impact</label>
                                            <span className="text-[10px] font-mono text-indigo-400">{editingProfile.activityCoefficients.heartRate.toFixed(1)}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="5"
                                            step="0.1"
                                            value={editingProfile.activityCoefficients.heartRate}
                                            onChange={e => setEditingProfile({
                                                ...editingProfile,
                                                activityCoefficients: { ...editingProfile.activityCoefficients, heartRate: parseFloat(e.target.value) }
                                            })}
                                            className="w-full accent-indigo-500"
                                        />
                                        <p className="text-[9px] text-zinc-600 leading-tight mt-1 italic">Stress/Anaerobic impact per HR unit. Typical: 1.0</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-[600px] bg-zinc-900/10 border border-zinc-800/50 border-dashed rounded-3xl flex flex-col items-center justify-center text-zinc-600 space-y-4">
                            <Settings size={48} className="opacity-20" />
                            <div className="text-center">
                                <p className="text-sm font-medium">No Profile Selected</p>
                                <p className="text-xs">Select a profile from the sidebar to edit it or create a new one.</p>
                            </div>
                            <button
                                onClick={createNew}
                                className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all"
                            >
                                Get Started
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
