
import React, { useState } from 'react';
import { useSetAtom } from 'jotai';
import { activeViewAtom } from '../../lib/atoms';
import { UserRegistryPanel } from './UserRegistryPanel';
import { DatabaseStatsPanel } from './DatabaseStatsPanel';
import { StoreSettingsPanel } from './StoreSettingsPanel';
import { DataBaseArtifact } from './DataBaseArtifact';
import { Shield, Database, Users, ShoppingBag, Terminal } from 'lucide-react';
import { tr } from '../../lib/i18n';

type ControlTab = 'users' | 'database' | 'store';

/** Control page with tabs for the identity registry, the database and store settings. */

export function ControlView() {
    const [activeTab, setActiveTab] = useState<ControlTab>('users');
    const setActiveView = useSetAtom(activeViewAtom);

    const tabs: { id: ControlTab; label: string; icon: any }[] = [
        { id: 'users', label: 'Identity Registry', icon: Users },
        { id: 'database', label: 'Nexus Database', icon: Database },
        { id: 'store', label: 'Commercial Core', icon: ShoppingBag },
    ];

    return (
        <div className="flex flex-col h-full overflow-hidden ui-root bg-(--app-bg)">
            {/* Top Bar: Apple HIG Liquid Onyx Island-Safe Command Header */}
            <header className="pt-16 sm:pt-20 pb-4 px-6 md:px-10 border-b border-white/8 sticky top-0 bg-[#0a0d12]/92 backdrop-blur-2xl z-20 shadow-xl flex flex-col gap-3.5">
                {/* Tier 1: Brand Context & Hardware Gateway */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl border border-cyan-500/30 flex items-center justify-center bg-white/[0.04] text-cyan-400 shadow-[0_0_15px_rgba(0,174,239,0.2)] shrink-0">
                            <Shield size={18} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-base md:text-lg font-black uppercase tracking-wider text-white">{tr("Control")}</h1>
                                <span className="px-2 py-0.5 rounded-full border border-cyan-500/30 bg-white/[0.04] text-cyan-400 text-[8px] font-black tracking-widest uppercase">{tr("System Core")}</span>
                                <span className="acc-badge acc-badge-mesh hidden sm:inline-flex">
                                    192.0.2.71
                                </span>
                            </div>
                            <p className="text-[9px] font-black text-white/50 uppercase tracking-[0.2em]">{tr("Developer & Administrator Override Hub")}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setActiveView('pico-bridge')}
                            title={tr("Launch PicoBridge Hardware Gateway (Hidden)")}
                            className="px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/12 text-purple-300 hover:text-white text-[10px] font-bold tracking-wider uppercase transition-all flex items-center gap-2 shadow-sm"
                        >
                            <Terminal size={13} className="text-purple-400" />
                            <span>{tr("PicoBridge")}</span>
                        </button>
                    </div>
                </div>

                {/* Tier 2: Apple HIG Segmented Control (Safely Below Onyx Island) */}
                <div className="flex items-center justify-center w-full">
                    <div className="acc-segmented-control overflow-x-auto max-w-full no-scrollbar shadow-2xl">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`acc-segmented-item ${isActive ? 'active' : ''}`}
                                >
                                    <Icon size={13} className={isActive ? 'text-cyan-400' : 'text-white/50'} />
                                    <span>{tr(tab.label)}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </header>

            {/* Main Content Area: Frameless Translucent Flow */}
            <main className="flex-1 overflow-y-auto px-6 md:px-10 py-8 pb-32 custom-scrollbar">
                <div className="max-w-[1800px] mx-auto animate-in fade-in duration-500">
                    {activeTab === 'users' && <UserRegistryPanel />}
                    {activeTab === 'database' && (
                        <div className="flex flex-col gap-12">
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
