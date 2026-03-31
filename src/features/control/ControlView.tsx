
import React, { useState } from 'react';
import { UserRegistryPanel } from './UserRegistryPanel';
import { DatabaseStatsPanel } from './DatabaseStatsPanel';
import { StoreSettingsPanel } from './StoreSettingsPanel';
import { DataBaseArtifact } from './DataBaseArtifact';

type ControlTab = 'users' | 'database' | 'store';

export function ControlView() {
    const [activeTab, setActiveTab] = useState<ControlTab>('users');

    const tabs: { id: ControlTab; label: string; icon: string }[] = [
        { id: 'users', label: 'Users', icon: 'users' },
        { id: 'database', label: 'DB', icon: 'database' },
        { id: 'store', label: 'Store', icon: 'store' },
    ];

    return (
        <div className="flex flex-col h-full p-6 gap-6 overflow-hidden">
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Left: Description & Tags */}
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-(--main-color)/10 border border-(--main-color)/30">
                        <svg className="w-4 h-4 text-(--main-color)"><use href="#shield" /></svg>
                    </div>
                    <div className="flex items-center gap-1.5 bg-(--main-color)/10 border border-(--main-color)/30 rounded-full px-2 py-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-(--main-color) animate-pulse" />
                        <span className="text-[10px] font-bold text-(--main-color) uppercase tracking-widest">DEV</span>
                    </div>
                    <p className="text-xs text-(--text-color-secondary) hidden sm:block">
                        Admin & System
                    </p>
                </div>

                {/* Right: Tabs */}
                <div className="flex items-center gap-4">
                    <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === tab.id
                                    ? 'bg-(--main-color) text-black shadow'
                                    : 'text-(--text-color-secondary) hover:text-white'
                                    }`}
                            >
                                <svg className="w-3.5 h-3.5"><use href={`#${tab.icon}`} /></svg>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Panel */}
            <div className="flex-1 min-h-0 flex flex-col">
                {activeTab === 'users' && <div className="flex-1 overflow-y-auto"><UserRegistryPanel /></div>}
                {activeTab === 'database' && (
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <div className="flex flex-col gap-6 p-1 pb-20">
                            <DatabaseStatsPanel />
                            <DataBaseArtifact />
                        </div>
                    </div>
                )}
                {activeTab === 'store' && <div className="flex-1 overflow-y-auto"><StoreSettingsPanel /></div>}
            </div>
        </div>
    );
}
