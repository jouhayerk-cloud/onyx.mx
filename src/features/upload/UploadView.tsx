skillsimport React, { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai/react';
import { uploadTabAtom, isUploadWizardOpenAtom } from '../../lib/atoms';
import { UploadEntryForm } from './UploadEntryForm';
import { UploadAIPanel } from './UploadAIPanel';

export function UploadView() {
    const tab = useAtomValue(uploadTabAtom);
    const setIsWizardOpen = useSetAtom(isUploadWizardOpenAtom);
    const [isFormDeployed, setIsFormDeployed] = useState(false);

    if (tab === 'ai') {
        return (
            <div className="flex flex-col h-full overflow-hidden px-6 py-6">
                <UploadAIPanel />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden custom-scrollbar">
            <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-8 max-w-4xl mx-auto w-full">

                {/* ── Start Wizard Section ── */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 ml-2">
                        <div className="w-8 h-8 rounded-lg bg-(--main-color)/20 flex items-center justify-center text-(--main-color)">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
                        </div>
                        <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40">Guided Workflow</h2>
                    </div>

                    <button
                        onClick={() => setIsWizardOpen(true)}
                        className="group relative w-full overflow-hidden rounded-[32px] bg-white/5 border border-white/10 p-1 transition-all hover:border-(--main-color)/50 hover:bg-white/8 active:scale-[0.98]"
                    >
                        <div className="flex items-center justify-between px-8 py-10 bg-linear-to-br from-white/5 to-transparent rounded-[28px]">
                            <div className="text-left">
                                <h3 className="text-4xl font-black text-white uppercase tracking-tighter mb-2 group-hover:text-(--main-color) transition-colors">START WIZARD</h3>
                                <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.3em]">Step-by-step guided entry process for maximum speed</p>
                            </div>
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-(--main-color) group-hover:text-black transition-all">
                                <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z" /></svg>
                            </div>
                        </div>
                    </button>
                </div>

                <div className="h-px bg-white/5 w-full" />

                {/* ── Manual Entry Panel ── */}
                <div className="flex flex-col gap-4">
                    <button
                        onClick={() => setIsFormDeployed(!isFormDeployed)}
                        className="flex items-center justify-between px-6 py-4 rounded-2xl bg-white/2 border border-white/5 hover:bg-white/5 transition-all group"
                    >
                        <div className="flex items-center gap-4">
                            <svg className="w-5 h-5 text-white/30 group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40 group-hover:text-white/80">Manual Entry Form</span>
                        </div>
                        <div className={`transition-transform duration-300 ${isFormDeployed ? 'rotate-180' : ''}`}>
                            <svg className="w-4 h-4 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                    </button>

                    {isFormDeployed && (
                        <div className="animate-in fade-in slide-in-from-top-4 duration-500 overflow-hidden">
                            <UploadEntryForm />
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
