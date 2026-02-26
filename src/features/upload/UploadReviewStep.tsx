/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React, { useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { uploadCurrentStepAtom, uploadItemDataAtom, uploadMediaFilesAtom, userAtom, activeViewAtom, notificationsAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { handleFileUpload } from '../../lib/utils';

export function UploadReviewStep() {
    const setView = useSetAtom(activeViewAtom);
    const [, setCurrentStep] = useAtom(uploadCurrentStepAtom);
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const [mediaFiles, setMediaFiles] = useAtom(uploadMediaFilesAtom);
    const user = useAtomValue(userAtom);
    const setNotifications = useSetAtom(notificationsAtom);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const notify = (type: 'success' | 'error' | 'warning' | 'notice' | 'loading', message: string) => {
        const id = Date.now();
        setNotifications((prev: any) => [...prev, { id, type, message }]);
        if (type !== 'loading') setTimeout(() => setNotifications((prev: any) => prev.filter((n: any) => n.id !== id)), 3000);
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            let uploadedUrls: string[] = [];
            let updatedDriveIds: string[] = [];

            if (mediaFiles.length > 0) {
                notify('loading', `Uploading ${mediaFiles.length} file(s)…`);
                for (const file of mediaFiles) {
                    if (file.originalFile) {
                        const result = await handleFileUpload(file.originalFile, user);
                        if (result) {
                            uploadedUrls.push(result.thumbnailUrl);
                            updatedDriveIds.push(result.fileId);
                        }
                    }
                }
            }

            const finalData = {
                item_id: itemData.itemId,
                data: {
                    ...itemData,
                    image_urls: uploadedUrls.length > 0 ? uploadedUrls : itemData.image_urls || [],
                    drive_ids: updatedDriveIds.length > 0 ? updatedDriveIds : itemData.drive_ids || []
                }
            };

            notify('loading', 'Saving to database…');
            const { error } = await supabase.from('inventory').upsert(finalData, { onConflict: 'item_id' });
            if (error) throw error;

            notify('success', 'Item successfully uploaded!');
            setItemData({});
            setMediaFiles([]);
            setCurrentStep('media');
            setView('inventory');
        } catch (error: any) {
            console.error('Upload error:', error);
            notify('error', `Failed to upload: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const fieldRows = [
        { label: 'Item ID', value: itemData.itemId, mono: true },
        { label: 'Name', value: itemData.name, mono: false },
        { label: 'Vendor', value: itemData.vendorId, mono: false },
        { label: 'Category', value: itemData.category, mono: false },
        { label: 'Cost (MXN)', value: itemData.price ? `$${itemData.price}` : '—', mono: true, accent: '#8DC63F' },
    ];

    return (
        <div className="flex flex-col gap-6 animate-in slide-in-from-right-8 duration-300">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-4xl font-black tracking-tighter text-white mb-1">Review & Submit</h2>
                    <p className="text-white/30 text-sm">Verify the item details before adding to inventory.</p>
                </div>
                <button type="button" onClick={() => setCurrentStep('details')} disabled={isSubmitting}
                    className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white/60 transition-colors flex items-center gap-1 mt-1 shrink-0">
                    ← Details
                </button>
            </div>

            {/* Summary panel */}
            <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl overflow-hidden">
                {/* Field grid */}
                <div className="p-6 grid grid-cols-2 gap-5">
                    {fieldRows.map(r => (
                        <div key={r.label}>
                            <dt className="text-[9px] font-black uppercase tracking-widest text-white/25 mb-1">{r.label}</dt>
                            <dd className={`text-sm font-semibold ${r.mono ? 'font-mono' : ''}`}
                                style={r.accent ? { color: r.accent } : { color: 'rgba(255,255,255,0.85)' }}>
                                {r.value || '—'}
                            </dd>
                        </div>
                    ))}
                    {/* Description spans full width */}
                    {itemData.description && (
                        <div className="col-span-2">
                            <dt className="text-[9px] font-black uppercase tracking-widest text-white/25 mb-1">Description</dt>
                            <dd className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{itemData.description}</dd>
                        </div>
                    )}
                </div>

                {/* Media preview strip */}
                {mediaFiles.length > 0 && (
                    <div className="border-t border-white/[0.06] px-6 py-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/25 mb-3">
                            Attached Media · {mediaFiles.length} file{mediaFiles.length > 1 ? 's' : ''}
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {mediaFiles.map((file, i) => (
                                <div key={i} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-white/10">
                                    <img src={file.localUrl} alt={`Preview ${i}`} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Submit row */}
            <div className="flex justify-end gap-3 pb-4">
                <button type="button" onClick={() => setCurrentStep('details')} disabled={isSubmitting}
                    className="px-6 py-3 border border-white/10 text-white/30 text-[10px] font-black tracking-widest rounded-xl hover:bg-white/5 hover:text-white/60 transition-all">
                    BACK
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="px-8 py-3 bg-[#8DC63F] text-black text-[11px] font-black tracking-widest rounded-xl shadow-[0_0_24px_rgba(141,198,63,0.3)] hover:shadow-[0_0_36px_rgba(141,198,63,0.5)] hover:scale-[1.03] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                >
                    {isSubmitting ? (
                        <><LoadingIndicator /> UPLOADING…</>
                    ) : (
                        <>SUBMIT TO INVENTORY ✓</>
                    )}
                </button>
            </div>
        </div>
    );
}
