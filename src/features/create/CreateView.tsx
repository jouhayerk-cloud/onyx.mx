/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React from 'react';
import { useAtomValue } from 'jotai/react';
import { createViewActiveTabAtom, workflowStepAtom } from '../../lib/atoms';
import { VideoAnalysisView } from './VideoAnalysisView';
import { VideoBatchView } from './VideoBatchView';
import { OnyxLogo } from '../../components/OnyxLogo';
import { FastEntryForm } from './FastEntryForm';
import { BatchImportModule } from './BatchImportModule';
// import { BatchEntryView } from './BatchEntryView'; // Deprecated

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

    // For 'new' and 'voice' tabs, show a placeholder until a file is selected.
    return (
        <div className="flex items-center justify-center h-full text-center p-8">
            <OnyxLogo className="w-48 h-48 text-[var(--secondary-text-color)] opacity-25" />
        </div>
    );
}