/**
 * syncEngine.ts
 * React hook that manages the full sync lifecycle:
 *  - Detects online / offline transitions
 *  - On reconnect: flushes local change queue → then pulls updates from Supabase
 *  - Provides sync status to all consumers via Jotai atoms
 */
import { useEffect, useCallback } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { flushQueue, getQueueStats } from './changeQueue';
import {
    isOfflineModeAtom,
    syncStatusAtom,
    syncQueueCountAtom,
    lastSyncedAtAtom,
    syncProgressAtom,
} from './atoms';
import { getDatabase } from './database';
import { supabase } from './supabase';
import toast from 'react-hot-toast';

const LAST_SYNC_KEY = 'onyx_last_synced_at';

/** Delta pull: only fetch records updated since last sync */
async function deltaPull(table: string, collection: any, since: string | null): Promise<number> {
    try {
        let query = supabase.from(table).select('*');
        if (since) {
            query = query.gte('updated_at', since);
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) return 0;

        // Upsert changed records into local DB
        for (let i = 0; i < data.length; i += 150) {
            const chunk = data.slice(i, i + 150).map((d: any) => ({
                ...d,
                id: String(d.id),
            }));
            try {
                await collection.bulkUpsert(chunk);
            } catch (e) {
                console.warn(`[SyncEngine] Delta upsert chunk error (${table}):`, e);
            }
        }
        return data.length;
    } catch (err) {
        console.warn(`[SyncEngine] Delta pull failed for ${table}:`, err);
        return 0;
    }
}

export function useSyncEngine() {
    const [isOffline, setIsOffline] = useAtom(isOfflineModeAtom);
    const setSyncStatus = useSetAtom(syncStatusAtom);
    const setSyncQueueCount = useSetAtom(syncQueueCountAtom);
    const setLastSynced = useSetAtom(lastSyncedAtAtom);
    const setSyncProgress = useSetAtom(syncProgressAtom);

    /** Update queue count badge */
    const refreshQueueCount = useCallback(() => {
        const { count } = getQueueStats();
        setSyncQueueCount(count);
    }, [setSyncQueueCount]);

    /** Full sync: push local queue → delta pull from Supabase */
    const runSync = useCallback(async (silent = false) => {
        if (isOffline) return;
        if (!navigator.onLine) return;

        setSyncStatus('syncing');
        if (!silent) toast.loading('Syncing with cloud…', { id: 'sync' });

        try {
            // Step 1: Push local changes
            const { count: queueSize } = getQueueStats();
            if (queueSize > 0) {
                setSyncProgress({ phase: 'push', done: 0, total: queueSize, label: 'Uploading local changes…' });
                const { success, failed } = await flushQueue((done, total, label) => {
                    setSyncProgress({ phase: 'push', done, total, label });
                });
                if (!silent) {
                    if (failed > 0) toast.error(`${failed} changes failed to upload`, { id: 'sync' });
                    else if (success > 0) toast.success(`${success} changes uploaded`, { id: 'sync' });
                }
            }

            // Step 2: Delta pull from Supabase
            const since = localStorage.getItem(LAST_SYNC_KEY);
            const db = await getDatabase();
            const tables = [
                { name: 'inventory', col: db.inventory },
                { name: 'logistics', col: db.logistics },
                { name: 'finance', col: db.finance },
                { name: 'production', col: db.production },
            ];

            let totalPulled = 0;
            for (let i = 0; i < tables.length; i++) {
                const { name, col } = tables[i];
                if (!col) continue;
                setSyncProgress({ phase: 'pull', done: i, total: tables.length, label: `Pulling ${name}…` });
                const count = await deltaPull(name, col, since);
                totalPulled += count;
            }

            const now = new Date().toISOString();
            localStorage.setItem(LAST_SYNC_KEY, now);
            setLastSynced(now);
            setSyncStatus('idle');
            setSyncProgress(null);
            refreshQueueCount();

            if (!silent && totalPulled > 0) {
                toast.success(`Sync complete · ${totalPulled} records updated`, { id: 'sync' });
            } else if (!silent) {
                toast.dismiss('sync');
            }
        } catch (err) {
            console.error('[SyncEngine] Sync failed:', err);
            setSyncStatus('error');
            setSyncProgress(null);
            if (!silent) toast.error('Sync failed — will retry on next connection', { id: 'sync' });
        }
    }, [isOffline, setSyncStatus, setSyncProgress, setLastSynced, refreshQueueCount]);

    // Listen for online/offline events
    useEffect(() => {
        const handleOnline = () => {
            if (!isOffline) {
                console.log('[SyncEngine] Connection restored — starting sync');
                toast.success('Back online · syncing…', { duration: 2000 });
                runSync(false);
            }
        };

        const handleOffline = () => {
            console.warn('[SyncEngine] Connection lost');
            setSyncStatus('pending');
            toast('Working offline — changes queued', {
                icon: '📵',
                duration: 3000,
            });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Initial queue count
        refreshQueueCount();

        // If we're online on mount and there's a pending queue, sync silently
        if (navigator.onLine && !isOffline) {
            const { count } = getQueueStats();
            if (count > 0) {
                console.log(`[SyncEngine] ${count} pending changes found on mount — syncing`);
                runSync(true);
            }
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [isOffline, runSync, refreshQueueCount, setSyncStatus]);

    /** Toggle offline mode manually (from Settings) */
    const goOffline = useCallback(() => {
        setIsOffline(true);
        setSyncStatus('pending');
        localStorage.setItem('offlineMode', 'true');
        toast('Offline mode ON — all changes saved locally', { icon: '📵' });
    }, [setIsOffline, setSyncStatus]);

    const goOnline = useCallback(async () => {
        setIsOffline(false);
        localStorage.setItem('offlineMode', 'false');
        toast('Going online…');
        await runSync(false);
    }, [setIsOffline, runSync]);

    return { runSync, goOffline, goOnline, refreshQueueCount };
}
