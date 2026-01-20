import React from 'react';
import Header from '@/components/Header';
import { TuningDashboard } from '@/components/tuning/TuningDashboard';

export const metadata = {
    title: 'Tuning Dashboard | Freddy',
    description: 'Manage and optimize your diabetes profile parameters with AI.',
};

export default function TuningPage() {
    return (
        <div className="min-h-screen bg-black text-white selection:bg-emerald-500/30">
            <Header title="Tuning Dashboard" />

            <main className="max-w-4xl mx-auto px-4 py-8 md:py-12">
                <TuningDashboard />
            </main>

            <footer className="max-w-4xl mx-auto px-4 py-12 border-t border-zinc-900 mt-12 text-center">
                <p className="text-zinc-600 text-sm">
                    Freddy Tuning Engine v1.0 • Phase 1: Insulin Response
                </p>
            </footer>
        </div>
    );
}
