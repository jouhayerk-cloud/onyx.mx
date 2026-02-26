/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React from 'react';
import { useAtom, useSetAtom } from 'jotai/react';
import { uploadCurrentStepAtom, uploadSelectedMediaTypeAtom, uploadMediaFilesAtom, uploadItemDataAtom, notificationsAtom } from '../../lib/atoms';
import { UploadedFile } from '../../lib/Types';

export function UploadMediaStep() {
    const [, setCurrentStep] = useAtom(uploadCurrentStepAtom);
    const [selectedMediaType, setSelectedMediaType] = useAtom(uploadSelectedMediaTypeAtom);
    const setMediaFiles = useSetAtom(uploadMediaFilesAtom);
    const setUploadItemData = useSetAtom(uploadItemDataAtom);
    const setNotifications = useSetAtom(notificationsAtom);

    const notify = (type: 'success' | 'error' | 'warning' | 'notice' | 'loading', message: string) => {
        const id = Date.now();
        setNotifications((prev: any) => [...prev, { id, type, message }]);
        if (type !== 'loading') setTimeout(() => setNotifications((prev: any) => prev.filter((n: any) => n.id !== id)), 3000);
    };

    const mediaOptions = [
        { id: 'single', label: 'Single Item', icon: '#camera', desc: 'Upload one item image — auto-fills details.', emoji: '📸' },
        { id: 'sample', label: 'Sample', icon: '#camera', desc: 'Reference image for style / model extraction.', emoji: '🖼️' },
        { id: 'lot', label: 'Lot Image', icon: '#store', desc: 'Wide shot — extracts batch details.', emoji: '📦' },
        { id: 'video', label: 'Video', icon: '#video', desc: 'Process a video for complex item breakdown.', emoji: '🎬' },
        { id: 'none', label: 'No Media', icon: '#file', desc: 'Skip media and enter details manually.', emoji: '✏️' },
    ] as const;

    const handleSelectOption = async (optionId: string) => {
        setSelectedMediaType(optionId);
        if (optionId === 'none') {
            setMediaFiles([]);
            setUploadItemData({});
            setCurrentStep('details');
        } else {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = optionId === 'video' ? 'video/*' : 'image/*';
            fileInput.multiple = optionId === 'lot';

            fileInput.onchange = async (e: Event) => {
                const target = e.target as HTMLInputElement;
                const files = target.files;
                if (!files || files.length === 0) { setSelectedMediaType(null); return; }

                const uploadedFiles: UploadedFile[] = [];
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    uploadedFiles.push({
                        originalFile: file,
                        localUrl: URL.createObjectURL(file),
                        type: file.type.startsWith('video') ? 'video' : 'image',
                        name: file.name
                    });
                }
                setMediaFiles(uploadedFiles);
                notify('success', `${uploadedFiles.length} file(s) selected.`);
                setCurrentStep('details');
            };
            fileInput.click();
        }
    };

    return (
        <div className="flex flex-col gap-8 animate-in slide-in-from-right-8 duration-300">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-4xl font-black tracking-tighter text-white mb-2">Select Upload Type</h2>
                <p className="text-white/40 text-sm font-medium">What kind of item(s) are you adding to inventory?</p>
            </div>

            {/* Option cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mediaOptions.map(opt => {
                    const isActive = selectedMediaType === opt.id;
                    return (
                        <button
                            key={opt.id}
                            onClick={() => handleSelectOption(opt.id)}
                            className={`group relative p-6 rounded-2xl border text-left transition-all duration-300 overflow-hidden
                                ${isActive
                                    ? 'bg-[var(--main-color)]/15 border-[var(--main-color)]/60 shadow-[0_0_24px_var(--main-color)]/20'
                                    : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/20'
                                }`}
                        >
                            {/* Glow blob on active */}
                            {isActive && (
                                <div className="absolute inset-0 bg-[var(--main-color)]/5 backdrop-blur-sm pointer-events-none" />
                            )}
                            <div className="relative flex items-start gap-4">
                                <div className={`text-2xl w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300
                                    ${isActive ? 'bg-[var(--main-color)]/20 scale-110' : 'bg-white/5 group-hover:bg-white/10'}`}>
                                    {opt.emoji}
                                </div>
                                <div className="flex flex-col gap-1 pt-0.5">
                                    <h3 className={`text-sm font-black uppercase tracking-widest transition-colors
                                        ${isActive ? 'text-[var(--main-color)]' : 'text-white/80 group-hover:text-white'}`}>
                                        {opt.label}
                                    </h3>
                                    <p className={`text-xs leading-relaxed transition-colors
                                        ${isActive ? 'text-white/60' : 'text-white/30 group-hover:text-white/50'}`}>
                                        {opt.desc}
                                    </p>
                                </div>
                            </div>
                            {/* Active check */}
                            {isActive && (
                                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[var(--main-color)] flex items-center justify-center text-black text-[9px] font-black">✓</div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Hint */}
            <p className="text-center text-[10px] text-white/20 font-medium uppercase tracking-widest">
                Tap a type to immediately select files
            </p>
        </div>
    );
}
