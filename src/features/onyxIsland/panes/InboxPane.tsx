import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    CheckCircle2,
    AlertCircle,
    AlertTriangle,
    Info,
    Sparkles,
    Loader,
    Bell,
} from 'lucide-react';
import { tr, trf } from '../../../lib/i18n';
import { useIslandNotifications, markAllRead, clearHistory } from '../notify/store';
import type { IslandNotification } from '../notify/types';
import './inboxPane.css';

const FILTERS = ['all', 'alerts', 'chan'] as const;
type FilterType = (typeof FILTERS)[number];

function getRelativeTime(timestamp: number, now: number): string {
    const diff = Math.max(0, now - timestamp);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return tr('Just now');
    if (mins < 60) return trf('{m}m ago', { m: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return trf('{h}h ago', { h: hours });
    return new Date(timestamp).toLocaleDateString();
}

function getCalendarDayGroup(timestamp: number, now: number): 'today' | 'yesterday' | 'earlier' {
    const itemDate = new Date(timestamp);
    const nowDate = new Date(now);

    const startOfToday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
    const startOfItem = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate()).getTime();

    const diffDays = Math.round((startOfToday - startOfItem) / 86400000);

    if (diffDays <= 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    return 'earlier';
}

interface NotificationRowProps {
    notification: IslandNotification;
    now: number;
}

const NotificationRow: React.FC<NotificationRowProps> = ({ notification, now }) => {
    const [expanded, setExpanded] = useState(false);
    const { kind, title, message, count, createdAt, read, actions } = notification;

    const kindIcon = useMemo(() => {
        const size = 16;
        switch (kind) {
            case 'success':
                return <CheckCircle2 size={size} style={{ color: 'var(--isl-ok)' }} aria-hidden="true" />;
            case 'error':
                return <AlertCircle size={size} style={{ color: 'var(--isl-err)' }} aria-hidden="true" />;
            case 'warning':
                return <AlertTriangle size={size} style={{ color: 'var(--isl-warn)' }} aria-hidden="true" />;
            case 'info':
                return <Info size={size} style={{ color: 'var(--isl-info)' }} aria-hidden="true" />;
            case 'agent':
                return <Sparkles size={size} style={{ color: 'var(--isl-accent)' }} aria-hidden="true" />;
            case 'loading':
                return <Loader size={size} style={{ color: 'var(--isl-ink-3)' }} aria-hidden="true" />;
            default:
                return <Info size={size} style={{ color: 'var(--isl-info)' }} aria-hidden="true" />;
        }
    }, [kind]);

    const kindLabel = useMemo(() => {
        switch (kind) {
            case 'success':
                return tr('Success');
            case 'error':
                return tr('Error');
            case 'warning':
                return tr('Warning');
            case 'info':
                return tr('Info');
            case 'agent':
                return tr('Agent');
            case 'loading':
                return tr('Loading');
            default:
                return tr('Info');
        }
    }, [kind]);

    return (
        <button
            type="button"
            className="isl-row isl-inbox-row"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
        >
            <div className="isl-inbox-row-content">
                <div className="isl-inbox-row-icon-col">
                    <div className="isl-inbox-icon-anchor">
                        {kindIcon}
                        {!read && (
                            <span className="isl-dot isl-inbox-dot" aria-hidden="true" />
                        )}
                    </div>
                    <span className="sr-only">{kindLabel}</span>
                    {!read && (
                        <span className="sr-only">{tr('Unread')}</span>
                    )}
                </div>

                <div className="isl-inbox-row-main">
                    <div className="isl-inbox-row-firstline">
                        {title ? (
                            <span className="isl-title isl-inbox-row-title">
                                {title}
                            </span>
                        ) : (
                            <span className="isl-title isl-inbox-row-title" aria-hidden="true" />
                        )}
                        <div className="isl-inbox-row-meta">
                            {count > 1 && (
                                <span className="isl-chip isl-num">x{count}</span>
                            )}
                            <span className="isl-caption isl-num">
                                {getRelativeTime(createdAt, now)}
                            </span>
                        </div>
                    </div>

                    <div className={`isl-inbox-row-message ${expanded ? 'isl-inbox-row-message--expanded' : ''}`}>
                        {message}
                    </div>
                </div>
            </div>

            {expanded && actions && actions.length > 0 && (
                <div
                    className="isl-inbox-row-actions"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                        }
                    }}
                >
                    {actions.map((act, idx) => (
                        <button
                            key={idx}
                            type="button"
                            className="isl-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                act.onClick();
                            }}
                        >
                            {act.label}
                        </button>
                    ))}
                </div>
            )}
        </button>
    );
};

export const InboxPane: React.FC<{ onClose: () => void }> = ({ onClose: _onClose }) => {
    void _onClose;
    const [filter, setFilter] = useState<FilterType>('all');
    const [confirmingClear, setConfirmingClear] = useState(false);
    const { history, unread } = useIslandNotifications();
    const [now, setNow] = useState(() => Date.now());
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!confirmingClear) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setConfirmingClear(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [confirmingClear]);

    const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
        let nextIndex = index;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            nextIndex = (index + 1) % FILTERS.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            nextIndex = (index - 1 + FILTERS.length) % FILTERS.length;
        } else if (e.key === 'Home') {
            nextIndex = 0;
        } else if (e.key === 'End') {
            nextIndex = FILTERS.length - 1;
        } else {
            return;
        }
        e.preventDefault();
        const nextFilter = FILTERS[nextIndex];
        setFilter(nextFilter);
        tabRefs.current[nextIndex]?.focus();
    };

    const filteredHistory = useMemo(() => {
        return history.filter((item) => {
            if (filter === 'alerts') {
                return item.kind === 'error' || item.kind === 'warning';
            }
            if (filter === 'chan') {
                return item.source === 'agent' || item.kind === 'agent';
            }
            return true;
        });
    }, [history, filter]);

    const sortedHistory = useMemo(() => {
        return [...filteredHistory].sort((a, b) => b.createdAt - a.createdAt);
    }, [filteredHistory]);

    const todayItems = useMemo(() => {
        return sortedHistory.filter((i) => getCalendarDayGroup(i.createdAt, now) === 'today');
    }, [sortedHistory, now]);

    const yesterdayItems = useMemo(() => {
        return sortedHistory.filter((i) => getCalendarDayGroup(i.createdAt, now) === 'yesterday');
    }, [sortedHistory, now]);

    const earlierItems = useMemo(() => {
        return sortedHistory.filter((i) => getCalendarDayGroup(i.createdAt, now) === 'earlier');
    }, [sortedHistory, now]);

    return (
        <div className="isl-pane isl-inbox-pane">
            <span className="sr-only" aria-live="polite">
                {trf('{n} unread', { n: unread })}
            </span>

            <div className="isl-inbox-header">
                <div
                    role="tablist"
                    aria-label={tr('Notification filters')}
                    className="isl-inbox-tablist"
                >
                    {FILTERS.map((f, idx) => (
                        <button
                            key={f}
                            ref={(el) => {
                                tabRefs.current[idx] = el;
                            }}
                            role="tab"
                            type="button"
                            aria-selected={filter === f}
                            tabIndex={filter === f ? 0 : -1}
                            onClick={() => setFilter(f)}
                            onKeyDown={(e) => handleTabKeyDown(e, idx)}
                            className={`isl-inbox-tab ${filter === f ? 'isl-inbox-tab--active' : ''}`}
                        >
                            {f === 'all' ? tr('All') : f === 'alerts' ? tr('Alerts') : tr('Chan')}
                        </button>
                    ))}
                </div>

                <div className="isl-inbox-actions">
                    {confirmingClear ? (
                        <div className="isl-inbox-confirm" role="alert">
                            <span className="isl-caption isl-inbox-confirm-prompt">
                                {tr('Clear all notifications?')}
                            </span>
                            <button
                                type="button"
                                className="isl-btn isl-btn--ghost"
                                onClick={() => setConfirmingClear(false)}
                            >
                                {tr('Cancel')}
                            </button>
                            <button
                                type="button"
                                className="isl-btn isl-btn--primary"
                                onClick={() => {
                                    clearHistory();
                                    setConfirmingClear(false);
                                }}
                            >
                                {tr('Clear')}
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="isl-btn isl-btn--ghost"
                                disabled={unread === 0}
                                onClick={markAllRead}
                            >
                                {tr('Mark all read')}
                            </button>
                            <button
                                type="button"
                                className="isl-btn isl-btn--ghost"
                                disabled={history.length === 0}
                                onClick={() => setConfirmingClear(true)}
                            >
                                {tr('Clear')}
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="isl-inbox-scroll">
                {history.length === 0 ? (
                    <div className="isl-inbox-empty">
                        <Bell size={32} className="isl-inbox-empty-icon" aria-hidden="true" />
                        <div className="isl-title isl-inbox-empty-title">{tr('Nothing yet')}</div>
                        <div className="isl-caption isl-inbox-empty-caption">
                            {tr("Exports, syncs and Chan's messages will appear here.")}
                        </div>
                    </div>
                ) : sortedHistory.length === 0 ? (
                    <div className="isl-inbox-empty">
                        <div className="isl-caption isl-inbox-empty-caption">
                            {tr('No notifications in this filter.')}
                        </div>
                    </div>
                ) : (
                    <>
                        {todayItems.length > 0 && (
                            <div className="isl-inbox-group">
                                <div className="isl-caption isl-inbox-group-title">
                                    {tr('Today')}
                                </div>
                                <div className="isl-inbox-group-rows">
                                    {todayItems.map((item) => (
                                        <NotificationRow
                                            key={item.id}
                                            notification={item}
                                            now={now}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {yesterdayItems.length > 0 && (
                            <div className="isl-inbox-group">
                                <div className="isl-caption isl-inbox-group-title">
                                    {tr('Yesterday')}
                                </div>
                                <div className="isl-inbox-group-rows">
                                    {yesterdayItems.map((item) => (
                                        <NotificationRow
                                            key={item.id}
                                            notification={item}
                                            now={now}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {earlierItems.length > 0 && (
                            <div className="isl-inbox-group">
                                <div className="isl-caption isl-inbox-group-title">
                                    {tr('Earlier')}
                                </div>
                                <div className="isl-inbox-group-rows">
                                    {earlierItems.map((item) => (
                                        <NotificationRow
                                            key={item.id}
                                            notification={item}
                                            now={now}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
