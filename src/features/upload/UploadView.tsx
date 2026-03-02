import React from 'react';
import { useAtomValue } from 'jotai/react';
import { uploadTabAtom, userAtom, uploadItemDataAtom } from '../../lib/atoms';
import { UploadEntryForm } from './UploadEntryForm';
import { UploadAIPanel } from './UploadAIPanel';

export function UploadView() {
    const user = useAtomValue(userAtom);
    const itemData = useAtomValue(uploadItemDataAtom);
    const tab = useAtomValue(uploadTabAtom);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Top Bar ── */}
            <div className="shrink-0 flex items-center justify-end px-6 py-3 bg-black/40 border-b border-white/5 relative z-50">

                <div className="flex items-center gap-10">
                    <div className="flex flex-col items-center">
                        <div className="bg-(--main-color) text-black px-4 py-2 rounded-b-xl shadow-2xl flex flex-col items-center min-w-[70px] border-x border-b border-black/20 transform -translate-y-3 hover:translate-y-0 transition-all duration-500 cursor-default group">
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] leading-none mb-1.5 opacity-60 group-hover:opacity-100 transition-opacity">BOOK V</span>
                            <span className="text-sm font-black font-mono leading-none tracking-tighter">{itemData.workbook || 'v326'}</span>
                        </div>
                    </div>
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
