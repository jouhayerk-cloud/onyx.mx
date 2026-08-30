import React from 'react';
import { useAtomValue } from 'jotai/react';
import { uploadTabAtom } from '../../lib/atoms';
import { CreateItem } from './CreateItem';
import { UploadAIPanel } from './UploadAIPanel';

export function UploadView() {
    const tab = useAtomValue(uploadTabAtom);

    if (tab === 'ai') {
        return (
            <div className="flex flex-col h-full overflow-hidden px-6 py-6">
                <UploadAIPanel />
            </div>
        );
    }

    return (
        <div className="create-item-shell flex flex-col h-full overflow-hidden custom-scrollbar">
            <div className="flex-1 overflow-y-auto py-8 flex flex-col w-full px-2 sm:px-6 md:px-12 animate-in fade-in">
                <CreateItem />
            </div>
        </div>
    );
}
