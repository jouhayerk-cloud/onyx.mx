/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import React, { useEffect, useState } from 'react';
import { useAtom } from 'jotai/react';
import { uploadCurrentStepAtom, uploadItemDataAtom, uploadMediaFilesAtom } from '../../lib/atoms';
import { vendors, SCRIPT_URL } from '../../lib/consts';
import { generateUniqueId } from '../../lib/utils';
import { InventoryItemData } from '../../lib/Types';

export function UploadDetailsStep() {
    const [, setCurrentStep] = useAtom(uploadCurrentStepAtom);
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const [mediaFiles] = useAtom(uploadMediaFilesAtom);

    // Initial default values to prevent uncontrolled inputs
    useEffect(() => {
        if (!itemData.itemId) {
            setItemData({
                itemId: generateUniqueId(),
                name: '',
                description: '',
                vendorId: vendors[0].id,
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
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black tracking-tighter text-white">Item Details</h2>
                    <p className="text-[var(--text-color-secondary)]">
                        {mediaFiles.length > 0
                            ? `Verify details extracted from ${mediaFiles.length} media file(s).`
                            : 'Manually enter the details for this item.'}
                    </p>
                </div>
                <button type="button" onClick={() => setCurrentStep('media')} className="text-xs font-bold uppercase tracking-widest text-[var(--text-color-secondary)] hover:text-white transition-colors">
                    ← Back to Media
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-color-secondary)]">Name</label>
                    <input autoFocus required type="text" name="name" value={itemData.name || ''} onChange={handleChange} className="bg-[var(--glass-bg)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--main-color)]" />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-color-secondary)]">Vendor</label>
                    <select name="vendorId" value={itemData.vendorId || ''} onChange={handleChange} className="bg-[var(--glass-bg)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--main-color)]">
                        {Object.entries(vendors).map(([id, vendor]) => <option key={id} value={id}>{id}</option>)}
                    </select>
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-color-secondary)]">Description</label>
                    <textarea name="description" value={itemData.description || ''} onChange={handleChange} rows={3} className="bg-[var(--glass-bg)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--main-color)]" />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-color-secondary)]">Cost (MXN)</label>
                    <div className="relative">
                        <span className="absolute left-4 top-3 text-[var(--text-color-secondary)]">$</span>
                        <input required type="number" step="0.01" name="price" value={itemData.price || ''} onChange={handleChange} className="w-full bg-[var(--glass-bg)] border border-[var(--border-color)] rounded-xl pl-8 pr-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--main-color)]" />
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-color-secondary)]">Category</label>
                    <input type="text" name="category" value={itemData.category || ''} onChange={handleChange} className="bg-[var(--glass-bg)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--main-color)]" />
                </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
                <button type="submit" className="button !bg-[var(--main-color)] !text-black px-8">
                    Review Item →
                </button>
            </div>
        </form>
    );
}
