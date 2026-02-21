'use client';

import Header from '@/components/Header';
import { useState, useEffect } from 'react';
import { Settings, Save, Shield, Database, RefreshCw, Key, ExternalLink, AlertTriangle, CheckCircle2, Moon, Activity } from 'lucide-react';

export default function SettingsPage() {
    const [config, setConfig] = useState<any>(null);
    const [preferences, setPreferences] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Form states for secrets (not loaded from API)
    const [nsApiKey, setNsApiKey] = useState('');
    const [nsMongoUri, setNsMongoUri] = useState('');
    const [geminiApiKey, setGeminiApiKey] = useState('');

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                setConfig(data.system_config);
                setPreferences(data.user_preferences);
            }
        } catch (error) {
            console.error('Failed to load settings', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleSaveConfig = async (key: string, value: any) => {
        setSaving(key);
        setMessage(null);
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value, type: 'config' })
            });
            if (res.ok) {
                setMessage({ type: 'success', text: `${key.replace(/_/g, ' ')} updated` });
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error });
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setSaving(null);
        }
    };

    const handleSaveSecret = async (key: string, value: string) => {
        if (!value) return;
        setSaving(key);
        setMessage(null);
        try {
            const res = await fetch('/api/settings/secrets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value })
            });
            if (res.ok) {
                setMessage({ type: 'success', text: `${key.replace(/_/g, ' ')} updated` });
                if (key === 'nightscout_api_key') setNsApiKey('');
                if (key === 'nightscout_mongo_uri') setNsMongoUri('');
                if (key === 'gemini_api_key') setGeminiApiKey('');
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error });
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setSaving(null);
        }
    };

    const handleSavePreference = async (key: string, value: any) => {
        setSaving(key);
        setMessage(null);
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value, type: 'preference' })
            });
            if (res.ok) {
                setPreferences({ ...preferences, [key]: value });
                setMessage({ type: 'success', text: `${key.replace(/_/g, ' ')} updated` });
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setSaving(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black text-zinc-100 pb-20">
                <Header title="Settings" />
                <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center">
                    <RefreshCw className="animate-spin text-emerald-500 mb-4" size={32} />
                    <p className="text-zinc-500 animate-pulse">Loading system configuration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-zinc-100 pb-20">
            <Header title="Settings" />

            <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
                {/* Status/Message Banner */}
                {message && (
                    <div className={`p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        }`}>
                        {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        <span className="text-sm font-medium">{message.text}</span>
                    </div>
                )}

                {/* Nightscout Connection Section */}
                <section className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-zinc-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                            <Database size={16} className="text-emerald-400" /> Nightscout Integration
                        </h2>
                        <span className="text-[10px] text-zinc-600 font-mono">API V3 (REST + WebSocket)</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* URL */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-500 ml-1">Nightscout URL</label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    defaultValue={config?.nightscout_url}
                                    onBlur={(e) => handleSaveConfig('nightscout_url', e.target.value)}
                                    placeholder="https://your-ns.herokuapp.com"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-all font-mono"
                                />
                                {saving === 'nightscout_url' && <RefreshCw className="absolute right-3 top-2.5 animate-spin text-zinc-600" size={16} />}
                            </div>
                            <p className="text-[10px] text-zinc-600 ml-1 flex items-center gap-1">
                                <Shield size={10} /> Must be HTTPS for browser security.
                            </p>
                        </div>

                        {/* API Key */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-500 ml-1">Nightscout API Key</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={nsApiKey}
                                    onChange={(e) => setNsApiKey(e.target.value)}
                                    onBlur={(e) => handleSaveSecret('nightscout_api_key', e.target.value)}
                                    placeholder="Stored (click to update)"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-all font-mono"
                                />
                                {saving === 'nightscout_api_key' ? (
                                    <RefreshCw className="absolute right-3 top-2.5 animate-spin text-zinc-600" size={16} />
                                ) : (
                                    <Key className="absolute right-3 top-2.5 text-zinc-700" size={16} />
                                )}
                            </div>
                        </div>

                        {/* Mongo URI (Direct Access) */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-500 ml-1">Nightscout Mongo URI (Direct Access)</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={nsMongoUri}
                                    onChange={(e) => setNsMongoUri(e.target.value)}
                                    onBlur={(e) => handleSaveSecret('nightscout_mongo_uri', e.target.value)}
                                    placeholder="Stored (click to update)"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-all font-mono"
                                />
                                {saving === 'nightscout_mongo_uri' ? (
                                    <RefreshCw className="absolute right-3 top-2.5 animate-spin text-zinc-600" size={16} />
                                ) : (
                                    <Database className="absolute right-3 top-2.5 text-zinc-700" size={16} />
                                )}
                            </div>
                            <p className="text-[10px] text-zinc-600 ml-1 flex items-center gap-1">
                                <AlertTriangle size={10} className="text-amber-500" /> Enables high-performance direct data access.
                            </p>
                        </div>
                    </div>
                </section>

                {/* AI & Services Section */}
                <section className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm space-y-6">
                    <h2 className="text-zinc-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                        <RefreshCw size={16} className="text-indigo-400" /> AI & External Services
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Gemini Key */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-500 ml-1">Google Gemini API Key</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={geminiApiKey}
                                    onChange={(e) => setGeminiApiKey(e.target.value)}
                                    onBlur={(e) => handleSaveSecret('gemini_api_key', e.target.value)}
                                    placeholder="Stored (click to update)"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-all font-mono"
                                />
                                {saving === 'gemini_api_key' ? (
                                    <RefreshCw className="absolute right-3 top-2.5 animate-spin text-zinc-600" size={16} />
                                ) : (
                                    <Moon className="absolute right-3 top-2.5 text-zinc-700" size={16} />
                                )}
                            </div>
                        </div>

                        {/* Sync Frequency */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-500 ml-1">Sync Frequency (ms)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    defaultValue={config?.sync_frequency_ms || 300000}
                                    onBlur={(e) => handleSaveConfig('sync_frequency_ms', parseInt(e.target.value))}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-all font-mono"
                                />
                                {saving === 'sync_frequency_ms' && <RefreshCw className="absolute right-3 top-2.5 animate-spin text-zinc-600" size={16} />}
                            </div>
                            <p className="text-[10px] text-zinc-600 ml-1">Default: 300000 (5 minutes)</p>
                        </div>

                    </div>
                </section>

                {/* Preferences Section */}
                <section className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm space-y-6">
                    <h2 className="text-zinc-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                        <Settings size={16} className="text-purple-400" /> User Preferences
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Units */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-500 ml-1">Glucose Units</label>
                            <select
                                value={preferences?.units || 'mg/dL'}
                                onChange={(e) => handleSavePreference('units', e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 transition-all cursor-pointer"
                            >
                                <option value="mg/dL">mg/dL</option>
                                <option value="mmol/L">mmol/L</option>
                            </select>
                        </div>

                        {/* High Threshold */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-500 ml-1">High Threshold</label>
                            <input
                                type="number"
                                defaultValue={preferences?.high_threshold || 180}
                                onBlur={(e) => handleSavePreference('high_threshold', parseInt(e.target.value))}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 transition-all font-mono"
                            />
                        </div>

                        {/* Low Threshold */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-500 ml-1">Low Threshold</label>
                            <input
                                type="number"
                                defaultValue={preferences?.low_threshold || 70}
                                onBlur={(e) => handleSavePreference('low_threshold', parseInt(e.target.value))}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 transition-all font-mono"
                            />
                        </div>

                        {/* SMB Threshold */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-500 ml-1">SMB Threshold (U)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.1"
                                    defaultValue={config?.smb_threshold || 0.7}
                                    onBlur={(e) => handleSaveConfig('smb_threshold', parseFloat(e.target.value))}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 transition-all font-mono"
                                />
                                {saving === 'smb_threshold' && <RefreshCw className="absolute right-3 top-2.5 animate-spin text-zinc-600" size={16} />}
                            </div>
                            <p className="text-[10px] text-zinc-600 ml-1">Boluses smaller than this are treated as basal logic.</p>
                        </div>
                    </div>
                </section>

                {/* Maintenance Section */}
                <section className="p-6 rounded-2xl border border-rose-500/10 bg-rose-500/5 backdrop-blur-sm space-y-4">
                    <h2 className="text-rose-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                        <AlertTriangle size={16} /> Danger Zone
                    </h2>
                    <div className="flex items-center justify-between p-4 bg-black/40 rounded-xl border border-rose-500/10">
                        <div>
                            <h3 className="text-sm font-bold text-zinc-200">Re-initialize Database</h3>
                            <p className="text-xs text-zinc-500">Purge local cache and re-sync all data from Nightscout.</p>
                        </div>
                        <button className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg text-xs font-bold border border-rose-500/20 transition-all">
                            Purge Cache
                        </button>
                    </div>
                </section>
            </main>
        </div>
    );
}

