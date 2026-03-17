'use client';

import Header from '@/components/Header';
import { Book, Lightbulb, Zap, Shield, HelpCircle, ArrowRight } from 'lucide-react';

export default function GuidePage() {
    return (
        <div className="min-h-screen bg-black text-white font-sans selection:bg-emerald-500/30">
            <Header title="Freddy Guide" />
            
            <main className="max-w-4xl mx-auto px-4 py-12">
                <header className="mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-4">
                        <Book size={12} />
                        Documentation
                    </div>
                    <h1 className="text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
                        Using Freddy
                    </h1>
                    <p className="text-xl text-zinc-400 max-w-2xl leading-relaxed">
                        Master your metabolic health with Freddy's advanced predictive modeling and intelligent insights.
                    </p>
                </header>

                <div className="grid gap-12">
                    {/* Section 1 */}
                    <section className="relative group">
                        <div className="absolute -left-4 top-0 bottom-0 w-1 bg-emerald-500/50 rounded-full scale-y-0 group-hover:scale-y-100 transition-transform duration-500 origin-top" />
                        <div className="flex items-start gap-6">
                            <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center text-emerald-400 border border-zinc-800 shadow-xl shrink-0 group-hover:border-emerald-500/50 transition-colors">
                                <Zap size={24} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold mb-3 group-hover:text-emerald-300 transition-colors">Real-time Dashboard</h2>
                                <p className="text-zinc-400 leading-relaxed mb-4">
                                    The Dashboard provides a live view of your glucose levels, Insulin on Board (IOB), and Carbs on Board (COB). Freddy uses deep learning models to project your glucose levels for the next 4 hours.
                                </p>
                                <ul className="space-y-2 text-sm text-zinc-500">
                                    <li className="flex items-center gap-2">
                                        <ArrowRight size={14} className="text-emerald-500/50" />
                                        <span>Click on any chart point to see detailed metabolic attribution.</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <ArrowRight size={14} className="text-emerald-500/50" />
                                        <span>Toggle predictions to see potential future states based on current trends.</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Section 2 */}
                    <section className="relative group">
                        <div className="absolute -left-4 top-0 bottom-0 w-1 bg-emerald-500/50 rounded-full scale-y-0 group-hover:scale-y-100 transition-transform duration-500 origin-top" />
                        <div className="flex items-start gap-6">
                            <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center text-emerald-400 border border-zinc-800 shadow-xl shrink-0 group-hover:border-emerald-500/50 transition-colors">
                                <Lightbulb size={24} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold mb-3 group-hover:text-emerald-300 transition-colors">Intelligent AI Chat</h2>
                                <p className="text-zinc-400 leading-relaxed mb-4">
                                    Chat with Freddy to analyze your data. You can ask questions like "Why did I go high after lunch?" or "How has my insulin sensitivity been lately?".
                                </p>
                                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 italic text-zinc-500 text-sm">
                                    "Freddy, can you look at my last 3 days and tell me if my basal rate seems correct during the night?"
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Section 3 */}
                    <section className="relative group">
                        <div className="absolute -left-4 top-0 bottom-0 w-1 bg-emerald-500/50 rounded-full scale-y-0 group-hover:scale-y-100 transition-transform duration-500 origin-top" />
                        <div className="flex items-start gap-6">
                            <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center text-emerald-400 border border-zinc-800 shadow-xl shrink-0 group-hover:border-emerald-500/50 transition-colors">
                                <Shield size={24} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold mb-3 group-hover:text-emerald-300 transition-colors">Tuning & Settings</h2>
                                <p className="text-zinc-400 leading-relaxed mb-4">
                                    Adjust your metabolic parameters in the Tuning section. Freddy identifies potential improvements to your ISF (Insulin Sensitivity Factor), CR (Carb Ratio), and Basal rates.
                                </p>
                            </div>
                        </div>
                    </section>
                </div>

                <footer className="mt-24 pt-12 border-t border-zinc-900 text-center">
                    <p className="text-zinc-500 flex items-center justify-center gap-2">
                        <HelpCircle size={16} />
                        Still have questions? Check the 
                        <a href="/apidocs" className="text-emerald-400 hover:underline">API Docs</a>
                        or 
                        <a href="https://github.com/jhaydraude/freddy/issues" className="text-emerald-400 hover:underline">report an issue</a>.
                    </p>
                </footer>
            </main>
        </div>
    );
}
