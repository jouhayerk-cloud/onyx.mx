import React from 'react';
import { CreateItem } from './CreateItem';

// The upload view is Create Item: Single Item (Add Entry) and Batch XLSX.
// The old 'ai' tab (UploadAIPanel, with its own direct Gemini client) and the
// tab atom that switched to it are gone.
export function UploadView() {
    return (
        <div className="create-item-shell flex flex-col w-full">
            <div className="flex-1 flex flex-col w-full px-2 sm:px-6 md:px-12 py-8 animate-in fade-in">
                <CreateItem />
            </div>
        </div>
    );
}
