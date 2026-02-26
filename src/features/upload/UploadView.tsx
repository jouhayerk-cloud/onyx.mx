/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React from 'react';
import { useAtomValue } from 'jotai/react';
import { uploadCurrentStepAtom } from '../../lib/atoms';
import { UploadMediaStep } from './UploadMediaStep';
import { UploadDetailsStep } from './UploadDetailsStep';
import { UploadReviewStep } from './UploadReviewStep';

export function UploadView() {
    const currentStep = useAtomValue(uploadCurrentStepAtom);

    return (
        <div className="flex-grow flex flex-col h-full overflow-hidden bg-[var(--bg-color)] animate-in fade-in duration-500 relative">
            {/* Header/Progress Indicator could go here */}
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${currentStep === 'media' ? 'bg-[var(--main-color)] text-black' : 'bg-white/10 text-white/50'}`}>1. Media</span>
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${currentStep === 'details' ? 'bg-[var(--main-color)] text-black' : 'bg-white/10 text-white/50'}`}>2. Details</span>
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${currentStep === 'review' ? 'bg-[var(--main-color)] text-black' : 'bg-white/10 text-white/50'}`}>3. Review & Submit</span>
            </div>

            <div className="flex-grow overflow-y-auto p-8 pt-16 flex justify-center">
                <div className="w-full max-w-4xl">
                    {currentStep === 'media' && <UploadMediaStep />}
                    {currentStep === 'details' && <UploadDetailsStep />}
                    {currentStep === 'review' && <UploadReviewStep />}
                </div>
            </div>
        </div>
    );
}
