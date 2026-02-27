import React from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { uploadTabAtom, userAtom } from '../../lib/atoms';
import { UploadEntryForm } from './UploadEntryForm';
import { UploadAIPanel } from './UploadAIPanel';

export function UploadView() {
    const [tab, setTab] = useAtom(uploadTabAtom);
    const user = useAtomValue(userAtom);
    const canUseAI = user?.role === 'Developer' || user?.role === 'Admin';

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Tab bar ── */}
            <div className="shrink-0 flex items-center gap-2 px-6 py-2 bg-white/[0.015] border-b border-white/[0.04]">
                <button onClick={() => setTab('entry')}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border
                        ${tab === 'entry'
                            ? 'bg-[#8DC63F]/15 border-[#8DC63F]/50 text-[#8DC63F]'
                            : 'bg-white/[0.03] border-white/[0.08] text-white/30 hover:text-white/60'}`}>
                    ✚ New Entry
                </button>
                {canUseAI && (
                    <button onClick={() => setTab('ai')}
                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border
                            ${tab === 'ai'
                                ? 'bg-[var(--main-color)]/15 border-[var(--main-color)]/50 text-[var(--main-color)]'
                                : 'bg-white/[0.03] border-white/[0.08] text-white/30 hover:text-white/60'}`}>
                        ✨ AI Tools
                    </button>
                )}
                <div className="ml-auto text-[8px] font-black text-white/10 uppercase tracking-widest">
                    {tab === 'entry' ? 'Item Entry Form' : 'AI Processing — Admin / Developer'}
                </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
                {tab === 'entry' && <UploadEntryForm />}
                {tab === 'ai' && <UploadAIPanel />}
            </div>
        </div>
    );
}
