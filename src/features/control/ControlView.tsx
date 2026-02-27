/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React, { useState } from 'react';
import { UserRegistryPanel } from './UserRegistryPanel';
import { DatabaseStatsPanel } from './DatabaseStatsPanel';

type ControlTab = 'users' | 'database';

export function ControlView() {
    const [activeTab, setActiveTab] = useState<ControlTab>('users');

    const tabs: { id: ControlTab; label: string; icon: string }[] = [
        { id: 'users', label: 'User Registry', icon: 'users' },
        { id: 'database', label: 'Database Stats', icon: 'database' },
    ];

    return (
        <div className="flex flex-col h-full p-6 gap-6 overflow-hidden">
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Left: Description & Tags */}
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-[var(--main-color)]/10 border border-[var(--main-color)]/30">
                        <svg className="w-4 h-4 text-[var(--main-color)]"><use href="#shield" /></svg>
                    </div>
                    <div className="flex items-center gap-1.5 bg-[var(--main-color)]/10 border border-[var(--main-color)]/30 rounded-full px-2 py-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--main-color)] animate-pulse" />
                        <span className="text-[10px] font-bold text-[var(--main-color)] uppercase tracking-widest">Developer</span>
                    </div>
                    <p className="text-xs text-[var(--text-color-secondary)] hidden sm:block">
                        Developer-only access management &amp; system overview
                    </p>
                </div>

                {/* Right: Tabs */}
                <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === tab.id
                                ? 'bg-[var(--main-color)] text-black shadow'
                                : 'text-[var(--text-color-secondary)] hover:text-white'
                                }`}
                        >
                            <svg className="w-3.5 h-3.5"><use href={`#${tab.icon}`} /></svg>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Panel */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {activeTab === 'users' && <UserRegistryPanel />}
                {activeTab === 'database' && <DatabaseStatsPanel />}
            </div>
        </div>
    );
}
