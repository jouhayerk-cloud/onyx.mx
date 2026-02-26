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

const STEPS = [
    { id: 'media', label: 'Media', num: 1 },
    { id: 'details', label: 'Details', num: 2 },
    { id: 'review', label: 'Review', num: 3 },
] as const;

export function UploadView() {
    const currentStep = useAtomValue(uploadCurrentStepAtom);
    const stepIdx = STEPS.findIndex(s => s.id === currentStep);

    return (
        <div className="flex-grow flex flex-col h-full overflow-hidden relative">
            {/* ── Step progress bar ─────────────────────────────────── */}
            <div className="shrink-0 flex items-center justify-center gap-0 px-8 py-4 bg-white/[0.02] backdrop-blur-xl border-b border-white/[0.05]">
                {STEPS.map((step, i) => {
                    const done = i < stepIdx;
                    const active = step.id === currentStep;
                    return (
                        <React.Fragment key={step.id}>
                            {/* Step circle */}
                            <div className="flex flex-col items-center gap-1">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black transition-all duration-500
                                    ${active ? 'bg-[var(--main-color)] text-black shadow-[0_0_16px_var(--main-color)] scale-110' :
                                        done ? 'bg-white/20 text-white/80' :
                                            'bg-white/5 text-white/20'}`}>
                                    {done ? '✓' : step.num}
                                </div>
                                <span className={`text-[9px] font-black uppercase tracking-widest transition-colors duration-300
                                    ${active ? 'text-[var(--main-color)]' : done ? 'text-white/50' : 'text-white/20'}`}>
                                    {step.label}
                                </span>
                            </div>
                            {/* Connector line */}
                            {i < STEPS.length - 1 && (
                                <div className={`flex-1 max-w-[80px] h-px mx-3 transition-all duration-500 ${done ? 'bg-white/30' : 'bg-white/10'}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* ── Step content ─────────────────────────────────────── */}
            <div className="flex-grow overflow-y-auto px-6 py-8 flex justify-center custom-scrollbar">
                <div className="w-full max-w-3xl">
                    {currentStep === 'media' && <UploadMediaStep />}
                    {currentStep === 'details' && <UploadDetailsStep />}
                    {currentStep === 'review' && <UploadReviewStep />}
                </div>
            </div>
        </div>
    );
}
