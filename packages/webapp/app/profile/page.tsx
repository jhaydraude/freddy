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
import Link from 'next/link';
import ProfileComparisonPanel from '../../components/profile/ProfileComparisonPanel';

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
                    {!editingProfile ? (
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
                    ) : (
                        <ProfileComparisonPanel
                            primaryProfile={editingProfile}
                            primaryLabel={isNew ? "New Profile" : "Editing Profile"}
                            isEditing={true}
                            onProfileChange={setEditingProfile}
                            onSave={handleSave}
                            saving={saving}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}
