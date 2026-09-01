/**
 * SyncProgressBar.tsx
 * Full-screen glassmorphic overlay shown during active sync operations.
 * Auto-dismisses on completion; can also be closed manually.
 */
import React from 'react';
import { useAtomValue } from 'jotai';
import { syncProgressAtom, syncStatusAtom, syncQueueCountAtom } from '../lib/atoms';
import { RefreshCw, Upload, Download, CheckCircle } from 'lucide-react';
import { tr } from '../lib/i18n';

export const SyncProgressBar: React.FC = () => {
    const progress = useAtomValue(syncProgressAtom);
    const syncStatus = useAtomValue(syncStatusAtom);
    const queueCount = useAtomValue(syncQueueCountAtom);

    if (syncStatus !== 'syncing' || !progress) return null;

    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    const isPush = progress.phase === 'push';

    return (
        <div
            className="fixed inset-0 flex items-end justify-center pb-8 pointer-events-none"
            style={{ zIndex: 25000 }}
        >
            <div
                className="pointer-events-auto w-full max-w-sm mx-4 rounded-xl p-4 shadow-2xl"
                style={{
                    background: 'rgba(10,10,10,0.92)',
                    backdropFilter: 'blur(24px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                }}
            >
                {/* Header */}
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)' }}>
                        {isPush
                            ? <Upload size={14} strokeWidth={2.5} className="text-sky-400" />
                            : <Download size={14} strokeWidth={2.5} className="text-teal-400" />
                        }
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-black uppercase tracking-widest text-white/80 leading-none">
                            {isPush ? 'Uploading Changes' : 'Pulling Updates'}
                        </div>
                        <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-0.5 truncate">
                            {progress.label}
                        </div>
                    </div>
                    <RefreshCw size={13} className="text-sky-400 animate-spin shrink-0" />
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full overflow-hidden mb-2"
                    style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                            width: `${pct}%`,
                            background: isPush
                                ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                                : 'linear-gradient(90deg, #38bdf8, #06b6d4)',
                        }}
                    />
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/20">
                        {progress.done} / {progress.total}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-widest"
                        style={{ color: isPush ? '#fbbf24' : '#38bdf8' }}>
                        {pct}%
                    </span>
                </div>

                {/* Queue info when pushing */}
                {isPush && queueCount > 0 && (
                    <div className="mt-2 text-[8px] text-white/20 font-black uppercase tracking-widest">
                        {queueCount} {tr("changes queued")}
                    </div>
                )}
            </div>
        </div>
    );
};
