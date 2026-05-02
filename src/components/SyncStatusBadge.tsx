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

    // Determine color and status label
    let statusColor = '#4ade80'; // Default online green
    let label = 'ONLINE';
    let isPulsating = true;

    if (isOffline || !navigator.onLine) {
        statusColor = '#fbbf24'; // Offline orange
        label = 'OFFLINE';
    } else if (syncStatus === 'syncing') {
        statusColor = '#38bdf8'; // Syncing blue
        label = 'SYNCING';
    } else if (syncStatus === 'error') {
        statusColor = '#f87171'; // Error red
        label = 'SYNC ERR';
    } else if (queueCount > 0) {
        statusColor = '#fbbf24'; // Pending orange
        label = `${queueCount} PENDING`;
    }

    return (
        <button
            onClick={() => runSync(false)}
            title={`${label} · Last sync: ${formatLastSync(lastSynced)}`}
            className="flex items-center gap-2 px-2 py-1 rounded-full transition-all hover:bg-white/5 active:scale-95"
        >
            {/* Pulsating Indicator */}
            <div className="relative flex h-2 w-2">
                {isPulsating && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        style={{ backgroundColor: statusColor }}></span>
                )}
                <span className="relative inline-flex rounded-full h-2 w-2"
                    style={{ backgroundColor: statusColor }}></span>
            </div>

            {/* Label + Queue Count */}
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity"
                style={{ color: statusColor }}>
                {label === 'ONLINE' ? '' : label}
            </span>

            {queueCount > 0 && label === 'ONLINE' && (
                <span className="px-1 py-0.5 rounded-sm text-[8px] font-black"
                    style={{ background: `${statusColor}20`, color: statusColor }}>
                    {queueCount}
                </span>
            )}
        </button>
    );
};
