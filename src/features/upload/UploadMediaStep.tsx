/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React from 'react';
import { useAtom, useSetAtom } from 'jotai/react';
import { uploadCurrentStepAtom, uploadSelectedMediaTypeAtom, uploadMediaFilesAtom, uploadItemDataAtom, notificationsAtom } from '../../lib/atoms';
import { UploadedFile } from '../../lib/Types';
import { handleFileUpload } from '../../lib/utils';

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
        { id: 'single', label: 'Single Item Image', icon: '#image', desc: 'Auto-fill details from one item.' },
        { id: 'sample', label: 'Sample Image', icon: '#image', desc: 'Extracts style/model info for reference.' },
        { id: 'lot', label: 'Lot Image', icon: '#camera', desc: 'Extracts batch details from a wider shot.' },
        { id: 'video', label: 'Video', icon: '#video', desc: 'Process a video for complex item breakdown.' },
        { id: 'none', label: 'No Media', icon: '#file-text', desc: 'Manually enter details.' },
    ] as const;

    const handleSelectOption = async (optionId: string) => {
        setSelectedMediaType(optionId);
        if (optionId === 'none') {
            setMediaFiles([]);
            setUploadItemData({});
            setCurrentStep('details');
        } else {
            // Trigger file picker
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = optionId === 'video' ? 'video/*' : 'image/*';
            fileInput.multiple = optionId === 'single' || optionId === 'lot'; // Allow multiple if single/lot

            fileInput.onchange = async (e: Event) => {
                const target = e.target as HTMLInputElement;
                const files = target.files;
                if (!files || files.length === 0) {
                    setSelectedMediaType(null);
                    return;
                }

                // Process files (Placeholder for actual handleFileUpload logic mapping)
                const uploadedFiles: UploadedFile[] = [];
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const url = URL.createObjectURL(file);
                    uploadedFiles.push({
                        originalFile: file,
                        localUrl: url,
                        type: file.type.startsWith('video') ? 'video' : 'image',
                        name: file.name
                    });
                }

                setMediaFiles(uploadedFiles);
                // Future Enhancement: Call Gemini AI here to populate uploadItemDataAtom before going to details
                notify('success', `Selected ${uploadedFiles.length} media file(s).`);
                setCurrentStep('details');
            };
            fileInput.click();
        }
    };

    return (
        <div className="flex flex-col gap-6 animate-in slide-in-from-right-8 duration-300">
            <div>
                <h2 className="text-3xl font-black tracking-tighter text-white">Select Upload Type</h2>
                <p className="text-[var(--text-color-secondary)]">What kind of item(s) are you adding to inventory?</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mediaOptions.map(opt => (
                    <button
                        key={opt.id}
                        onClick={() => handleSelectOption(opt.id)}
                        className={`p-6 rounded-2xl border transition-all text-left group
                            ${selectedMediaType === opt.id
                                ? 'bg-[var(--main-color)] border-[var(--main-color)] text-black'
                                : 'bg-[var(--glass-bg)] border-[var(--border-color)] hover:border-white/30 hover:bg-white/5'
                            }`}
                    >
                        <div className="flex items-center gap-4 mb-2">
                            <div className={`p-3 rounded-xl ${selectedMediaType === opt.id ? 'bg-black/20 text-black' : 'bg-white/5 text-[var(--main-color)] group-hover:bg-[var(--main-color)] group-hover:text-black transition-colors'}`}>
                                <svg className="w-6 h-6"><use href={opt.icon}></use></svg>
                            </div>
                            <h3 className="text-lg font-bold">{opt.label}</h3>
                        </div>
                        <p className={`text-sm ${selectedMediaType === opt.id ? 'text-black/80' : 'text-[var(--text-color-secondary)]'}`}>
                            {opt.desc}
                        </p>
                    </button>
                ))}
            </div>
        </div>
    );
}
