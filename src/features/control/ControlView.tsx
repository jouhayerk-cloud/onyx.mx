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
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-[var(--main-color)]/10 border border-[var(--main-color)]/30">
                    <svg className="w-6 h-6 text-[var(--main-color)]"><use href="#shield" /></svg>
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tighter text-white">Control Center</h1>
                    <p className="text-xs text-[var(--text-color-secondary)] mt-0.5">Developer-only access management &amp; system overview</p>
                </div>
                <div className="ml-auto flex items-center gap-2 bg-[var(--main-color)]/10 border border-[var(--main-color)]/30 rounded-full px-3 py-1">
                    <div className="w-2 h-2 rounded-full bg-[var(--main-color)] animate-pulse" />
                    <span className="text-xs font-bold text-[var(--main-color)] uppercase tracking-widest">Developer</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.id
                                ? 'bg-[var(--main-color)] text-black shadow'
                                : 'text-[var(--text-color-secondary)] hover:text-white'
                            }`}
                    >
                        <svg className="w-4 h-4"><use href={`#${tab.icon}`} /></svg>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Panel */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {activeTab === 'users' && <UserRegistryPanel />}
                {activeTab === 'database' && <DatabaseStatsPanel />}
            </div>
        </div>
    );
}
