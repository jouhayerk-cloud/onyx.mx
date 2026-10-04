import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { 
    CheckCircle2, AlertCircle, AlertTriangle, Info, Sparkles 
} from 'lucide-react';
import { tr, trf } from '../../lib/i18n';
import { useIslandNotifications, markAllRead, clearHistory } from './notify/store';
import type { IslandNotification } from './notify/types';
import { OnyxFace } from '../onyxAgent/face/OnyxFace';

const OnyxAgentHost = React.lazy(() => import('../onyxAgent/OnyxAgentHost').then(m => ({ default: m.OnyxAgentHost })));

type Tab = 'notifications' | 'assistant';
type Filter = 'all' | 'alerts' | 'agent';

function getRelativeTime(timestamp: number, now: number): string {
    const diff = Math.max(0, now - timestamp);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return tr('Just now');
    if (mins < 60) return trf('{m}m ago', { m: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return trf('{h}h ago', { h: hours });
    return new Date(timestamp).toLocaleDateString();
}

function isToday(timestamp: number, now: number): boolean {
    const date = new Date(timestamp);
    const today = new Date(now);
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
}

const NotificationItem: React.FC<{ notification: IslandNotification; now: number }> = ({ notification, now }) => {
    const [expanded, setExpanded] = useState(false);
    const { kind, title, message, count, createdAt, read, actions } = notification;

    const renderIcon = () => {
        const size = 16;
        switch (kind) {
            case 'success': return <CheckCircle2 size={size} color="#34d399" />;
            case 'error': return <AlertCircle size={size} color="#f87171" />;
            case 'warning': return <AlertTriangle size={size} color="#fbbf24" />;
            case 'info': return <Info size={size} color="#60a5fa" />;
            case 'agent': return <Sparkles size={size} color="var(--main-color, #00aeef)" />;
            case 'loading': return (
                <div 
                    style={{ width: size, height: size, borderWidth: 2, borderTopColor: '#a3a3a3', borderRightColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: 'transparent' }} 
                    className="rounded-full animate-spin border-solid"
                />
            );
            default: return <Info size={size} color="#60a5fa" />;
        }
    };

    return (
        <div 
            role="listitem"
            className="flex gap-3 p-3 rounded-xl isl-hw5 transition-colors cursor-pointer select-none group"
            onClick={() => setExpanded(!expanded)}
        >
            <div className="shrink-0 mt-0.5 relative">
                {renderIcon()}
                {!read && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_0_2px_rgba(11,11,15,1)]" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-2 mb-0.5">
                    {title && (
                        <div className="text-[13px] font-semibold text-white truncate">
                            {title}
                        </div>
                    )}
                    <div className="text-[11px] text-white/50 shrink-0 ml-auto group-hover:text-white/70 transition-colors">
                        {getRelativeTime(createdAt, now)}
                    </div>
                </div>
                <div className={`text-[13px] text-white/70 ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                    {message}
                </div>
                {expanded && actions && actions.length > 0 && (
                    <div className="mt-3 flex gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                        {actions.map((act, i) => (
                            <button
                                key={i}
                                onClick={(e) => { e.stopPropagation(); act.onClick(); }}
                                className="px-3 py-1.5 isl-w10 isl-hw20 text-white rounded-md text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                            >
                                {act.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {count > 1 && (
                <div className="shrink-0">
                    <span className="text-[11px] font-medium px-1.5 py-0.5 isl-w10 text-white/90 rounded-full">
                        &times;{count}
                    </span>
                </div>
            )}
        </div>
    );
};

export const NotificationCenter: React.FC<{ onClose: () => void; tab?: 'notifications' | 'assistant'; hideTabs?: boolean }> = ({ onClose, tab, hideTabs }) => {
    const [activeTab, setActiveTab] = useState<Tab>(tab || 'notifications');
    const [filter, setFilter] = useState<Filter>('all');
    const { history } = useIslandNotifications();
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (tab) setActiveTab(tab);
    }, [tab]);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (activeTab === 'notifications') {
            const timer = setTimeout(() => {
                markAllRead();
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [activeTab]);

    const handleTabKeyDown = (e: React.KeyboardEvent, targetTab: Tab) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            setActiveTab(targetTab);
        }
    };

    const filteredHistory = useMemo(() => {
        return history.filter(item => {
            if (filter === 'alerts') return item.kind === 'error' || item.kind === 'warning';
            if (filter === 'agent') return item.source === 'agent' || item.kind === 'agent';
            return true;
        });
    }, [history, filter]);

    const todayItems = filteredHistory.filter(i => isToday(i.createdAt, now));
    const earlierItems = filteredHistory.filter(i => !isToday(i.createdAt, now));

    return (
        <div className="flex flex-col h-full overflow-hidden text-white">
            {/* Tabs */}
            {!hideTabs && (
                <div className="flex p-3 pb-0 shrink-0">
                    <div 
                        role="tablist" 
                        className="flex isl-b20 p-1 rounded-lg w-full gap-1 border border-white/5"
                    >
                        <button
                            role="tab"
                            aria-selected={activeTab === 'notifications'}
                            onClick={() => setActiveTab('notifications')}
                            onKeyDown={(e) => handleTabKeyDown(e, 'assistant')}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${activeTab === 'notifications' ? 'isl-w15 text-white shadow-sm' : 'text-white/60 hover:text-white isl-hw5'}`}
                        >
                            {tr('Notifications')}
                        </button>
                        <button
                            role="tab"
                            aria-selected={activeTab === 'assistant'}
                            onClick={() => setActiveTab('assistant')}
                            onKeyDown={(e) => handleTabKeyDown(e, 'notifications')}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${activeTab === 'assistant' ? 'isl-w15 text-white shadow-sm' : 'text-white/60 hover:text-white isl-hw5'}`}
                        >
                            {tr('Assistant')}
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-hidden relative mt-2">
                {/* Notifications View */}
                <div 
                    className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${activeTab === 'notifications' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
                >
                    <div className="flex items-center justify-between px-3 pb-2 shrink-0">
                        <div className="flex gap-2" role="tablist">
                            {(['all', 'alerts', 'agent'] as Filter[]).map(f => (
                                <button
                                    key={f}
                                    role="tab"
                                    aria-selected={filter === f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white border ${filter === f ? 'isl-w10 text-white border-white/20' : 'bg-transparent text-white/50 border-transparent isl-hw5'}`}
                                >
                                    {f === 'all' ? tr('All') : f === 'alerts' ? tr('Alerts') : tr('Agent')}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={clearHistory}
                            className="text-[11px] font-semibold text-white/50 hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white px-2 py-1 rounded isl-hw5"
                        >
                            {tr('Clear all')}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4 custom-scrollbar">
                        {filteredHistory.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-white/40 gap-4">
                                <OnyxFace expression="sleepy" size={72} tone="mono" className="opacity-50 !bg-transparent" />
                                <div className="text-sm font-medium">{tr('Nothing new')}</div>
                            </div>
                        ) : (
                            <div role="list" className="flex flex-col gap-1">
                                {todayItems.length > 0 && (
                                    <>
                                        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/40 mt-1">
                                            {tr('Today')}
                                        </div>
                                        {todayItems.map(item => (
                                            <NotificationItem key={item.id} notification={item} now={now} />
                                        ))}
                                    </>
                                )}
                                {earlierItems.length > 0 && (
                                    <>
                                        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/40 mt-3">
                                            {tr('Earlier')}
                                        </div>
                                        {earlierItems.map(item => (
                                            <NotificationItem key={item.id} notification={item} now={now} />
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Assistant View */}
                <div 
                    className={`absolute inset-0 transition-opacity duration-200 ${activeTab === 'assistant' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
                >
                    {activeTab === 'assistant' && (
                        <Suspense fallback={<div className="h-full flex items-center justify-center text-white/50"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                            <OnyxAgentHost variant="drawer" onClose={onClose} />
                        </Suspense>
                    )}
                </div>
            </div>
        </div>
    );
};
