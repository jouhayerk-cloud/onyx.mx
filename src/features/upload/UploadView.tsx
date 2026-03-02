import React from 'react';
import { useAtomValue } from 'jotai/react';
import { uploadTabAtom } from '../../lib/atoms';
import { UploadEntryForm } from './UploadEntryForm';
import { UploadAIPanel } from './UploadAIPanel';

export function UploadView() {
    const tab = useAtomValue(uploadTabAtom);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Content ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
                {tab === 'entry' && <UploadEntryForm />}
                {tab === 'ai' && <UploadAIPanel />}
            </div>
        </div>
    );
}
