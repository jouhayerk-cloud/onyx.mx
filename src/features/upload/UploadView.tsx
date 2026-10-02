import React from 'react';
import { CreateItem } from './CreateItem';

// The 'ai' tab (UploadAIPanel) is gone: uploadTabAtom is only ever set to
// 'entry', so the panel could not be opened, yet this import shipped its
// direct Gemini client (key in the URL) in the UploadView chunk.
export function UploadView() {
    return (
        <div className="create-item-shell flex flex-col w-full">
            <div className="flex-1 flex flex-col w-full px-2 sm:px-6 md:px-12 py-8 animate-in fade-in">
                <CreateItem />
            </div>
        </div>
    );
}
