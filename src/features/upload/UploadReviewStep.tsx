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
import { SCRIPT_URL } from '../../lib/consts';

export function UploadReviewStep() {
    const setView = useSetAtom(activeViewAtom);
    const [, setCurrentStep] = useAtom(uploadCurrentStepAtom);
    const itemData = useAtomValue(uploadItemDataAtom);
    const [, setItemData] = useAtom(uploadItemDataAtom);
    const mediaFiles = useAtomValue(uploadMediaFilesAtom);
    const [, setMediaFiles] = useAtom(uploadMediaFilesAtom);
    const user = useAtomValue(userAtom);
    const setNotifications = useSetAtom(notificationsAtom);

    const notify = (type: 'success' | 'error' | 'warning' | 'notice' | 'loading', message: string) => {
        const id = Date.now();
        setNotifications((prev: any) => [...prev, { id, type, message }]);
        if (type !== 'loading') setTimeout(() => setNotifications((prev: any) => prev.filter((n: any) => n.id !== id)), 3000);
    };

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            let uploadedUrls: string[] = [];
            let updatedDriveIds: string[] = [];

            // 1. Upload media files if present
            if (mediaFiles.length > 0) {
                notify('loading', `Uploading ${mediaFiles.length} file(s)...`);
                for (const file of mediaFiles) {
                    if (file.originalFile) {
                        const googleDriveResult = await handleFileUpload(file.originalFile, user);
                        if (googleDriveResult) {
                            uploadedUrls.push(googleDriveResult.thumbnailUrl);
                            updatedDriveIds.push(googleDriveResult.fileId);
                        }
                    }
                }
            }

            // 2. Prepare final data payload
            const finalData = {
                item_id: itemData.itemId,
                data: {
                    ...itemData,
                    image_urls: uploadedUrls.length > 0 ? uploadedUrls : itemData.image_urls || [],
                    drive_ids: updatedDriveIds.length > 0 ? updatedDriveIds : itemData.drive_ids || []
                }
            };

            // 3. Upsert to Supabase
            notify('loading', 'Saving item to database...');
            const { error } = await supabase
                .from('inventory')
                .upsert(finalData, { onConflict: 'item_id' });

            if (error) throw error;

            // 4. Cleanup and Redirect
            notify('success', 'Item successfully uploaded!');
            setItemData({});
            setMediaFiles([]);
            setCurrentStep('media');
            setView('inventory');

        } catch (error: any) {
            console.error('Upload error:', error);
            notify('error', `Failed to upload item: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 animate-in slide-in-from-right-8 duration-300">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black tracking-tighter text-white">Review & Submit</h2>
                    <p className="text-[var(--text-color-secondary)]">Verify the item details before adding them to inventory.</p>
                </div>
                <button type="button" onClick={() => setCurrentStep('details')} className="text-xs font-bold uppercase tracking-widest text-[var(--text-color-secondary)] hover:text-white transition-colors" disabled={isSubmitting}>
                    ← Back to Details
                </button>
            </div>

            <div className="bg-[var(--glass-bg)] border border-[var(--border-color)] rounded-2xl p-6">
                <h3 className="text-lg font-bold mb-4 border-b border-white/10 pb-2">Item Summary</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                    <div>
                        <dt className="text-[10px] uppercase font-bold text-white/40 tracking-widest">ID</dt>
                        <dd className="font-mono text-sm">{itemData.itemId}</dd>
                    </div>
                    <div>
                        <dt className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Name</dt>
                        <dd className="text-sm font-semibold text-white">{itemData.name || '—'}</dd>
                    </div>
                    <div>
                        <dt className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Vendor</dt>
                        <dd className="text-sm">{itemData.vendorId || '—'}</dd>
                    </div>
                    <div>
                        <dt className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Cost (MXN)</dt>
                        <dd className="font-mono text-green-400 font-bold">${itemData.price || '0.00'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Description</dt>
                        <dd className="text-sm text-white/80 whitespace-pre-wrap mt-1">{itemData.description || '—'}</dd>
                    </div>
                </dl>

                {mediaFiles.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-white/10">
                        <h4 className="text-[10px] uppercase font-bold text-white/40 tracking-widest mb-3">Attached Media ({mediaFiles.length})</h4>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {mediaFiles.map((file, i) => (
                                <img key={i} src={file.localUrl} alt="Preview" className="w-20 h-20 object-cover rounded-lg border border-white/20" />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-end mt-4">
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="button !bg-green-500 !text-black px-8 py-4 text-lg font-bold shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? (
                        <><LoadingIndicator /> Uploading...</>
                    ) : (
                        <>Submit to Inventory <svg className="w-5 h-5"><use href="#check"></use></svg></>
                    )}
                </button>
            </div>
        </div>
    );
}
