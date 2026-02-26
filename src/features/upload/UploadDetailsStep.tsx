/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React, { useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { uploadCurrentStepAtom, uploadItemDataAtom, uploadMediaFilesAtom, userAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { generateUniqueId } from '../../lib/utils';

// Shared field styles
const fieldLabel = "text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1.5";
const fieldInput = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[var(--main-color)]/60 focus:bg-white/[0.07] transition-all backdrop-blur-sm";

export function UploadDetailsStep() {
    const [, setCurrentStep] = useAtom(uploadCurrentStepAtom);
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const [mediaFiles] = useAtom(uploadMediaFilesAtom);
    const user = useAtomValue(userAtom);

    const canSelectVendor = user?.role === 'Developer' || user?.role === 'Admin';
    const autoVendorId = user?.id || user?.email || Object.keys(vendors)[0] || '';

    useEffect(() => {
        if (!itemData.itemId) {
            setItemData({
                itemId: generateUniqueId(),
                name: '',
                description: '',
                vendorId: canSelectVendor ? (Object.keys(vendors)[0] || '') : autoVendorId,
                price: '',
                category: 'Uncategorized',
                status: 'YES'
            });
        }
    }, [itemData.itemId, setItemData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setItemData(prev => ({ ...prev, [name]: value }));
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setCurrentStep('review');
    };

    return (
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-6 animate-in slide-in-from-right-8 duration-300">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-4xl font-black tracking-tighter text-white mb-1">Item Details</h2>
                    <p className="text-white/30 text-sm">
                        {mediaFiles.length > 0
                            ? `Verify details extracted from ${mediaFiles.length} media file(s).`
                            : 'Manually enter the details for this item.'}
                    </p>
                </div>
                <button type="button" onClick={() => setCurrentStep('media')}
                    className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white/60 transition-colors flex items-center gap-1 mt-1 shrink-0">
                    ← Media
                </button>
            </div>

            {/* Media previews */}
            {mediaFiles.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {mediaFiles.map((file, i) => (
                        <div key={i} className="relative shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-white/10 bg-white/5">
                            <img src={file.localUrl} alt={`media ${i}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                        </div>
                    ))}
                </div>
            )}

            {/* Glass form panel */}
            <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6 flex flex-col gap-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Name */}
                    <div className="md:col-span-2 flex flex-col">
                        <label className={fieldLabel}>Item Name *</label>
                        <input autoFocus required type="text" name="name"
                            value={itemData.name || ''} onChange={handleChange}
                            placeholder="e.g. Vintage Leather Jacket"
                            className={fieldInput} />
                    </div>

                    {/* Vendor */}
                    <div className="flex flex-col">
                        <label className={fieldLabel}>Vendor</label>
                        {canSelectVendor ? (
                            <select name="vendorId" value={itemData.vendorId || ''} onChange={handleChange} className={fieldInput}>
                                {Object.entries(vendors).map(([id]) => <option key={id} value={id}>{id}</option>)}
                            </select>
                        ) : (
                            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white/40 flex items-center gap-2">
                                <svg className="w-4 h-4 opacity-30"><use href="#lock" /></svg>
                                <span className="truncate">{itemData.vendorId || autoVendorId}</span>
                            </div>
                        )}
                    </div>

                    {/* Category */}
                    <div className="flex flex-col">
                        <label className={fieldLabel}>Category</label>
                        <input type="text" name="category" value={itemData.category || ''} onChange={handleChange}
                            placeholder="e.g. Apparel"
                            className={fieldInput} />
                    </div>

                    {/* Price */}
                    <div className="flex flex-col">
                        <label className={fieldLabel}>Cost (MXN) *</label>
                        <div className="relative">
                            <span className="absolute left-4 top-3 text-white/30 text-sm">$</span>
                            <input required type="number" step="0.01" name="price"
                                value={itemData.price || ''} onChange={handleChange}
                                placeholder="0.00"
                                className={fieldInput + " pl-8 font-mono"} />
                        </div>
                    </div>

                    {/* Item ID (read-only) */}
                    <div className="flex flex-col">
                        <label className={fieldLabel}>Item ID (auto)</label>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3 text-xs font-mono text-white/20 truncate">
                            {itemData.itemId || '—'}
                        </div>
                    </div>

                    {/* Description */}
                    <div className="md:col-span-2 flex flex-col">
                        <label className={fieldLabel}>Description</label>
                        <textarea name="description" value={itemData.description || ''} onChange={handleChange}
                            rows={3} placeholder="Describe the item, condition, origin…"
                            className={fieldInput + " resize-none"} />
                    </div>
                </div>
            </div>

            {/* Action row */}
            <div className="flex justify-end">
                <button type="submit"
                    className="px-8 py-3 bg-[var(--main-color)] text-black text-[11px] font-black tracking-widest rounded-xl shadow-[0_0_24px_var(--main-color)]/30 hover:shadow-[0_0_32px_var(--main-color)]/50 hover:scale-[1.03] active:scale-[0.98] transition-all">
                    Review Item →
                </button>
            </div>
        </form>
    );
}
