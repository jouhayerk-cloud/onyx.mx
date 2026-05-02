/**
 * SyncStatusBadge.tsx
 * Floating teal/amber/red pill showing online status + queue count.
 * Mounts in the top bar alongside other status indicators.
 */
import React from 'react';
import { useAtomValue } from 'jotai';
import { syncStatusAtom, syncQueueCountAtom, isOfflineModeAtom, lastSyncedAtAtom } from '../lib/atoms';
import { useSyncEngine } from '../lib/syncEngine';
import { Wifi, WifiOff, RefreshCw, CloudOff, AlertCircle } from 'lucide-react';

function formatLastSync(iso: string | null): string {
    if (!iso) return 'Never';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const SyncStatusBadge: React.FC = () => {
    const syncStatus = useAtomValue(syncStatusAtom);
    const queueCount = useAtomValue(syncQueueCountAtom);
    const isOffline = useAtomValue(isOfflineModeAtom);
    const lastSynced = useAtomValue(lastSyncedAtAtom);
    const { runSync } = useSyncEngine();

    const isActuallyOnline = navigator.onLine && !isOffline;

    if (isOffline || !navigator.onLine) {
        return (
            <button
                onClick={() => {}} // handled by settings
                title={`Offline mode · ${queueCount} changes pending`}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest transition-all"
                style={{
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#f87171',
                }}
            >
                <WifiOff size={11} strokeWidth={2.5} />
                <span>OFFLINE</span>
                {queueCount > 0 && (
                    <span className="px-1 py-0.5 rounded-sm text-[8px] font-black"
                        style={{ background: 'rgba(239,68,68,0.25)' }}>
                        {queueCount}
                    </span>
                )}
            </button>
        );
    }

    if (syncStatus === 'syncing') {
        return (
            <div
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest"
                style={{
                    background: 'rgba(56,189,248,0.12)',
                    border: '1px solid rgba(56,189,248,0.3)',
                    color: '#38bdf8',
                }}
            >
                <RefreshCw size={11} strokeWidth={2.5} className="animate-spin" />
                <span>SYNCING</span>
                {queueCount > 0 && <span className="text-[8px] opacity-60">{queueCount}</span>}
            </div>
        );
    }

    if (syncStatus === 'error') {
        return (
            <button
                onClick={() => runSync(false)}
                title="Sync error — click to retry"
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest"
                style={{
                    background: 'rgba(245,158,11,0.12)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    color: '#fbbf24',
                }}
            >
                <AlertCircle size={11} strokeWidth={2.5} />
                <span>SYNC ERR</span>
            </button>
        );
    }

    if (queueCount > 0) {
        return (
            <button
                onClick={() => runSync(false)}
                title={`${queueCount} changes pending — click to sync`}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-80"
                style={{
                    background: 'rgba(251,191,36,0.12)',
                    border: '1px solid rgba(251,191,36,0.3)',
                    color: '#fbbf24',
                }}
            >
                <CloudOff size={11} strokeWidth={2.5} />
                <span>{queueCount} PENDING</span>
            </button>
        );
    }

    // All good — online, idle, queue empty
    return (
        <button
            onClick={() => runSync(false)}
            title={`Online · Last sync: ${formatLastSync(lastSynced)}`}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-80 transition-all"
            style={{
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.2)',
                color: '#4ade80',
            }}
        >
            <Wifi size={11} strokeWidth={2.5} />
            <span>ONLINE</span>
        </button>
    );
};
