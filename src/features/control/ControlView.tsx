
import React, { useState } from 'react';
import { useSetAtom } from 'jotai';
import { activeViewAtom } from '../../lib/atoms';
import { UserRegistryPanel } from './UserRegistryPanel';
import { DatabaseStatsPanel } from './DatabaseStatsPanel';
import { StoreSettingsPanel } from './StoreSettingsPanel';
import { DataBaseArtifact } from './DataBaseArtifact';
import { DatabaseModePanel } from './DatabaseModePanel';
import { Shield, Database, Users, ShoppingBag, Terminal } from 'lucide-react';

type ControlTab = 'users' | 'database' | 'store';

export function ControlView() {
    const [activeTab, setActiveTab] = useState<ControlTab>('users');
    const setActiveView = useSetAtom(activeViewAtom);

    const tabs: { id: ControlTab; label: string; icon: any }[] = [
        { id: 'users', label: 'Identity Registry', icon: Users },
        { id: 'database', label: 'Nexus Database', icon: Database },
        { id: 'store', label: 'Commercial Core', icon: ShoppingBag },
    ];

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Top Bar: Minimal HUD Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8 px-10 py-8 border-b border-white/3">
                {/* Left: Administrative Context */}
                <div className="flex items-center gap-6">
                    <div className="w-10 h-10 rounded-full border border-(--main-color)/20 flex items-center justify-center bg-(--main-color)/5 shadow-[0_0_20px_rgba(var(--main-color-rgb),0.1)]">
                        <Shield size={18} className="text-(--main-color)" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-[16px] font-black uppercase tracking-[0.5em] text-white">Control</h1>
                            <div className="px-2 py-0.5 rounded bg-(--main-color) text-black text-[8px] font-black tracking-widest uppercase">System Core</div>
                        </div>
                        <p className="text-[9px] font-black text-neutral-500 uppercase tracking-[0.3em]">Developer & Administrator Override Hub</p>
                    </div>
                </div>

                {/* Right: Modern Tab Switcher & Hidden Gateway Launch */}
                <div className="flex items-center gap-8">
                    <nav className="flex items-center gap-10">
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`relative group flex flex-col gap-1 transition-all duration-500 ${isActive ? '' : 'hover:scale-105'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon size={14} className={isActive ? 'text-(--main-color)' : 'text-neutral-500'} />
                                        <span className={`text-[10px] font-black uppercase tracking-[0.25em] ${isActive ? 'text-white' : 'text-neutral-500'}`}>
                                            {tab.label}
                                        </span>
                                    </div>
                                    {/* Active Indicator line */}
                                    <div className={`h-0.5 bg-(--main-color) transition-all duration-500 transform origin-left shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)] ${isActive ? 'scale-x-100' : 'scale-x-0'}`} />
                                </button>
                            );
                        })}
                    </nav>

                    <button
                        onClick={() => setActiveView('pico-bridge')}
                        title="Launch PicoBridge Hardware Gateway (Hidden)"
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600/20 to-indigo-600/20 hover:from-purple-600/40 hover:to-indigo-600/40 border border-purple-500/30 text-purple-300 hover:text-white text-[10px] font-bold tracking-wider uppercase transition-all flex items-center gap-2 shadow-sm"
                    >
                        <Terminal size={14} className="text-purple-400" />
                        <span className="hidden lg:inline">PicoBridge</span>
                    </button>
                </div>
            </div>

            {/* Main Content Area: Frameless Flow */}
            <main className="flex-1 overflow-y-auto px-10 py-12 pb-32 scrollbar-none">
                <div className="max-w-[1800px] mx-auto animate-in fade-in duration-1000">
                    {activeTab === 'users' && <UserRegistryPanel />}
                    {activeTab === 'database' && (
                        <div className="flex flex-col gap-16">
                            <DatabaseModePanel />
                            <DatabaseStatsPanel />
                            <DataBaseArtifact />
                        </div>
                    )}
                    {activeTab === 'store' && <StoreSettingsPanel />}
                </div>
            </main>
        </div>
    );
}
