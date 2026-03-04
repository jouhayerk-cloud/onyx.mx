

import React from 'react';
import { useAtomValue } from 'jotai/react';
import { createViewActiveTabAtom, workflowStepAtom } from '../../lib/atoms';
import { VideoAnalysisView } from './VideoAnalysisView';
import { VideoBatchView } from './VideoBatchView';
import { OnyxLogo } from '../../components/OnyxLogo';
import { FastEntryForm } from './FastEntryForm';
import { BatchImportModule } from './BatchImportModule';

export function CreateView() {
    const activeTab = useAtomValue(createViewActiveTabAtom);
    const workflowStep = useAtomValue(workflowStepAtom);

    if (workflowStep === 'fastEntry' || workflowStep === 'voiceEntry') {
        return <FastEntryForm />;
    }

    if (activeTab === 'video' || activeTab === 'videoBatch') {
        return <VideoAnalysisView />;
    }

    if (activeTab === 'batchEntry' || activeTab === 'batch') {
        return <BatchImportModule />;
    }

    return (
        <div className="flex items-center justify-center h-full text-center p-8">
            <OnyxLogo className="w-48 h-48 text-[var(--secondary-text-color)] opacity-25" />
        </div>
    );
}