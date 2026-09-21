

import { ai } from '@/lib/ai';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import React, { useState, useCallback } from 'react';
import {
    isBatchActionsModalOpenAtom,
    batchActionItemsDataAtom,
    userAtom,
    InventoryVersionAtom,
    isCatalogBatchSelectModeAtom,
    catalogBatchSelectedItemsAtom,
} from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { SCRIPT_URL } from '../../lib/consts';
import { BoundingBox2DType, BoundingBoxMaskType, InventoryItem, PointingType } from '../../lib/Types';
import { createCurvePath, findContour, generatePngAndSvgFromMasks, loadImage, simplifyContour, extractGradientFromMask } from '../../lib/utils';
import { useTranslation, useNotify } from '../../lib/hooks';
import { tr } from '../../lib/i18n';
import { MediaOriginNote } from './ItemMediaPanel';



type ActionType = 'boxes' | 'masks' | 'shortDesc' | 'normalDesc' | 'detailedDesc' | 'delete';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function BatchActionsModal() {
    const t = useTranslation();
    const notify = useNotify();
    const [isOpen, setIsOpen] = useAtom(isBatchActionsModalOpenAtom);
    const [batchActionItems, setBatchActionItems] = useAtom(batchActionItemsDataAtom);
    const user = useAtomValue(userAtom);
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);

    const setIsBatchSelectMode = useSetAtom(isCatalogBatchSelectModeAtom);
    const setBatchSelectedItems = useSetAtom(catalogBatchSelectedItemsAtom);

    const [selectedActions, setSelectedActions] = useState<Set<ActionType>>(new Set());
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTask, setCurrentTask] = useState('');

    /* `masks` is the one action on this list that produces a PROCESSED image:
       it writes generatedPngData, which is the frame every other catalog
       surface labels PROCESSED and the only one the Shopify export ships. An
       operator picking actions for 40 items could not tell that from
       "Generate Segmentation Masks", so the row says it in the same two words
       the badges use. */
    const ACTIONS: { id: ActionType, label: string, desc?: string, adminOnly: boolean }[] = [
        { id: 'boxes', label: tr('Generate 2D Boxes & Points'), adminOnly: false },
        {
            id: 'masks',
            label: tr('Generate Segmentation Masks (inc. PNG/SVG)'),
            desc: tr('Produces the PROCESSED image — the background-cleaned frame shown publicly. Leaves the RAW uploads untouched.'),
            adminOnly: false,
        },
        { id: 'shortDesc', label: tr('Generate Short Description'), adminOnly: false },
        { id: 'normalDesc', label: tr('Generate Bullet Points'), adminOnly: false },
        { id: 'detailedDesc', label: tr('Generate Detailed Description'), adminOnly: false },
        { id: 'delete', label: t.deleteItems, adminOnly: true },
    ];

    const handleClose = () => {
        if (isProcessing) return;
        setIsOpen(false);
        setBatchActionItems([]);
    };

    const resetAndClose = () => {
        handleClose();
        setBatchSelectedItems([]);
        setIsBatchSelectMode(false);
    };

    const handleActionToggle = (actionId: ActionType) => {
        setSelectedActions(prev => {
            const newSet = new Set(prev);
            if (newSet.has(actionId)) {
                newSet.delete(actionId);
            } else {
                newSet.add(actionId);
            }
            return newSet;
        });
    };

    const fetchItemImageAsBase64 = async (imageUrl: string | null): Promise<string | null> => {
        if (!imageUrl) return null;
        try {
            const url = new URL(imageUrl);
            const fileId = url.searchParams.get('id');
            if (!fileId) return null;

            const response = await fetch(SCRIPT_URL, {
                method: 'POST', mode: 'cors', cache: 'no-cache', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getImageBase64FromDriveId', fileId }),
            });
            const result = await response.json();
            if (result.status === 'success') {
                return `data:${result.data.mimeType};base64,${result.data.base64}`;
            }
            return null;
        } catch (e) {
            console.error('Failed to fetch item image for batch processing:', e);
            return null;
        }
    };

    const runDetectionAndTagging = async (imageDataUrl: string, query: string): Promise<{ boxes: BoundingBox2DType[], points: PointingType[] } | null> => {
        try {
            const prompt = `Detect and tag ${query}. Output a single JSON object with two keys: "boxes" and "points". The "boxes" key should be a list where each entry has "box_2d" and "label". The "points" key should be a list where each entry has "point" (in [y,x] format normalized to 1000) and "label".`;
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ inlineData: { data: imageDataUrl.split(',')[1], mimeType: 'image/jpeg' } }, { text: prompt }] },
                config: { responseMimeType: 'application/json' },
            });
            const data = JSON.parse(result.text);
            const boxes: BoundingBox2DType[] = (data.boxes || []).map((b: any) => ({ x: b.box_2d[1] / 1000, y: b.box_2d[0] / 1000, width: (b.box_2d[3] - b.box_2d[1]) / 1000, height: (b.box_2d[2] - b.box_2d[0]) / 1000, label: b.label }));
            const points: PointingType[] = (data.points || []).map((p: any) => ({ point: { x: p.point[1] / 1000, y: p.point[0] / 1000 }, label: p.label }));
            return { boxes, points };
        } catch (error) {
            console.error('[Batch AI] Failed: Detect & Tag.', error);
            return null;
        }
    };

    const runMaskGeneration = async (imageDataUrl: string, item: InventoryItem): Promise<{ masks: BoundingBoxMaskType[], pngData: string | null, svgData: string | null, gradientColor: string | null } | null> => {
        try {
            const shape = item.data.shape || '';
            const material = item.data.material || '';
            let prompt: string;

            if (shape.toLowerCase().includes('mirror')) {
                const query = `the ${material} frame only`;
                prompt = `Give the segmentation masks for ${query}. IMPORTANT: Exclude the reflective mirror surface itself, segment only the frame. Output a JSON list of segmentation masks where each entry contains "box_2d", "mask" (as a base64 string), and "label".`;
            } else {
                const query = `${shape} ${material}`;
                prompt = `Give the segmentation masks for ${query}. Output a JSON list of segmentation masks where each entry contains "box_2d", "mask" (as a base64 string), and "label".`;
            }

            const image = await loadImage(imageDataUrl);
            const imageDimensions = { width: image.width, height: image.height };

            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ inlineData: { data: imageDataUrl.split(',')[1], mimeType: 'image/jpeg' } }, { text: prompt }] },
                config: { responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
            });
            const rawMasks = JSON.parse(result.text);

            const masksPromises = (rawMasks || []).map(async (m: any) => {
                const maskData = m.mask.startsWith('data:image') ? m.mask : `data:image/png;base64,${m.mask}`;
                const maskImage = await loadImage(maskData);
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = maskImage.width; maskCanvas.height = maskImage.height;
                const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
                maskCtx.drawImage(maskImage, 0, 0);
                const imageData = maskCtx.getImageData(0, 0, maskImage.width, maskImage.height);
                const contour = findContour(imageData);
                const simplified = simplifyContour(contour, 1.5);
                return { x: m.box_2d[1] / 1000, y: m.box_2d[0] / 1000, width: (m.box_2d[3] - m.box_2d[1]) / 1000, height: (m.box_2d[2] - m.box_2d[0]) / 1000, label: m.label, maskWidth: maskImage.width, maskHeight: maskImage.height, path: createCurvePath(simplified), points: simplified };
            });
            const masks: BoundingBoxMaskType[] = await Promise.all(masksPromises);
            const { pngData, svgData } = await generatePngAndSvgFromMasks(imageDataUrl, imageDimensions, masks);

            let gradientColor: string | null = null;
            if (masks.length > 0) {
                gradientColor = await extractGradientFromMask(imageDataUrl, masks[0], imageDimensions);
            }

            return { masks, pngData, svgData, gradientColor };
        } catch (error) {
            console.error('[Batch AI] Failed: Generate Masks.', error);
            return null;
        }
    };

    const generateDescription = async (item: InventoryItem, type: 'short' | 'normal' | 'detailed'): Promise<string> => {
        const itemInfo = `Shape: ${item.data.shape}, Material: ${item.data.material}, Dimensions: ${item.data.widthCm}x${item.data.lengthCm}x${item.data.heightCm}cm.`;
        let prompt: string;
        switch (type) {
            case 'short': prompt = `Write a short, one-sentence product description for an item with these details: ${itemInfo}.`; break;
            case 'normal': prompt = `Write 3 to 5 advertisement-style selling bullet points for an item with these details: ${itemInfo}. Each bullet point must be a short, single phrase. Format as a single string, with each bullet point starting with a '*' and separated by a newline. Do not use HTML tags.`; break;
            case 'detailed': prompt = `Write a detailed product description for an item with these details: ${itemInfo}. Use simple HTML tags like <p>, <ul>, <li>, and <strong> for formatting.`; break;
        }

        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        return response.text;
    };

    const saveBatchUpdate = async (item: any, payload: any) => {
        const tableName = item.data?.status === 'Production' ? 'production' : 'inventory';
        const { error } = await supabase.from(tableName).update({
            ...payload.itemData,
            updated_at: new Date().toISOString()
        }).eq('id', item.row);
        
        if (error) throw error;
    };

    const handleDelete = async () => {
        if (!window.confirm(`Are you sure you want to permanently delete ${batchActionItems.length} items? This cannot be undone.`)) return;

        setIsProcessing(true);
        setProgress(0);
        setCurrentTask(`Deleting ${batchActionItems.length} items...`);
        const toastId = notify.loading(currentTask);

        try {
            const inventoryRows = batchActionItems.filter(i => i.data?.status !== 'Production').map(i => i.row);
            const productionRows = batchActionItems.filter(i => i.data?.status === 'Production').map(i => i.row);

            if (inventoryRows.length > 0) {
                const { error } = await supabase.from('inventory').delete().in('id', inventoryRows.map(String));
                if (error) throw error;
            }
            if (productionRows.length > 0) {
                const { error } = await supabase.from('production').delete().in('id', productionRows.map(String));
                if (error) throw error;
            }

            setProgress(batchActionItems.length);
            notify.success(`Successfully deleted ${batchActionItems.length} items.`, { id: toastId });
            setInventoryVersion(v => v + 1);
            setTimeout(resetAndClose, 1500);

        } catch (error: any) {
            notify.error(`Deletion failed: ${error.message}`, { id: toastId });
        } finally {
            setIsProcessing(false);
        }
    }

    const handleStart = async () => {
        if (selectedActions.has('delete')) {
            await handleDelete();
            return;
        }

        const totalItems = batchActionItems.length;
        setIsProcessing(true);
        setProgress(0);
        const toastId = notify.loading(tr("Starting batch process..."));

        for (let i = 0; i < batchActionItems.length; i++) {
            const item = batchActionItems[i];
            const itemLabel = `${item.data.shape} #${item.data.itemNumber}`;
            const progressLabel = `(${i + 1}/${totalItems})`;

            let newDataPayload: any = {};
            let generatedFilesPayload: any = {};

            try {
                setCurrentTask(`Fetching image for ${itemLabel} ${progressLabel}...`);
                notify.loading(currentTask, { id: toastId });
                const imageDataUrl = await fetchItemImageAsBase64(item.imageUrl);
                if (!imageDataUrl) {
                    throw new Error("Could not load item image.");
                }

                if (selectedActions.has('boxes')) {
                    setCurrentTask(`Generating boxes for ${itemLabel} ${progressLabel}...`);
                    notify.loading(currentTask, { id: toastId });
                    const result = await runDetectionAndTagging(imageDataUrl, `${item.data.shape} ${item.data.material}`);
                    if (result) {
                        newDataPayload.spatialBoxes2d = JSON.stringify(result.boxes);
                        newDataPayload.spatialPoints = JSON.stringify(result.points);
                    }
                    await pause(10000);
                }

                if (selectedActions.has('masks')) {
                    setCurrentTask(`Generating masks for ${itemLabel} ${progressLabel}...`);
                    notify.loading(currentTask, { id: toastId });
                    const result = await runMaskGeneration(imageDataUrl, item);
                    if (result) {
                        const masksForSaving = result.masks.map(({ path, ...rest }) => rest);
                        newDataPayload.spatialMasks = JSON.stringify(masksForSaving);
                        generatedFilesPayload.generatedPngData = result.pngData;
                        generatedFilesPayload.generatedSvgData = result.svgData;
                        if (result.gradientColor) {
                            newDataPayload.color = result.gradientColor;
                        }
                    }
                    await pause(10000);
                }

                if (selectedActions.has('shortDesc')) {
                    setCurrentTask(`Generating short desc for ${itemLabel} ${progressLabel}...`);
                    notify.loading(currentTask, { id: toastId });
                    newDataPayload.shortDescription = await generateDescription(item, 'short');
                    await pause(10000);
                }
                if (selectedActions.has('normalDesc')) {
                    setCurrentTask(`Generating bullets for ${itemLabel} ${progressLabel}...`);
                    notify.loading(currentTask, { id: toastId });
                    newDataPayload.generatedDescription = await generateDescription(item, 'normal');
                    await pause(10000);
                }
                if (selectedActions.has('detailedDesc')) {
                    setCurrentTask(`Generating detailed desc for ${itemLabel} ${progressLabel}...`);
                    notify.loading(currentTask, { id: toastId });
                    newDataPayload.detailedDescription = await generateDescription(item, 'detailed');
                    await pause(10000);
                }

                if (Object.keys(newDataPayload).length > 0 || Object.keys(generatedFilesPayload).length > 0) {
                    setCurrentTask(`Saving data for ${itemLabel} ${progressLabel}...`);
                    notify.loading(currentTask, { id: toastId });
                    await saveBatchUpdate(item, { itemData: newDataPayload, ...generatedFilesPayload });
                }

                setProgress(i + 1);

                if (i < batchActionItems.length - 1) {
                    setCurrentTask(`Waiting before processing next item...`);
                    notify.loading(currentTask, { id: toastId });
                    await pause(20000);
                }

            } catch (error: any) {
                notify.error(`Failed on item ${itemLabel}: ${error.message}`, { id: toastId });
                setIsProcessing(false);
                return;
            }
        }

        notify.success(`Batch process completed for ${totalItems} items!`, { id: toastId });
        setInventoryVersion(v => v + 1);
        setTimeout(resetAndClose, 1500);
        setIsProcessing(false);
    };

    if (!isOpen) return null;

    const availableActions = ACTIONS.filter(a => !a.adminOnly || user?.role === 'Admin');
    const totalItems = batchActionItems.length;

    const pct = totalItems > 0 ? Math.round((progress / totalItems) * 100) : 0;

    /* This modal is portalled at the app shell, outside the #catalog root, so
       its own root carries .catalog-hub. The scrim is a compound selector
       (`.catalog-hub.cat-scrim`), hence both classes on the same element. */
    return (
        <div className="catalog-hub cat-scrim">
            <div className="cat-modal" role="dialog" aria-modal="true" aria-label={t.batchActionsTitle(totalItems)}>
                <div className="cat-head">
                    <h2 className="cat-title">{t.batchActionsTitle(totalItems)}</h2>
                </div>
                <hr className="cat-rule" />
                <div className="cat-modal-body">
                    {isProcessing ? (
                        /* An instrument: pressed, mono, tabular. The native
                           <progress> could not be given the module's well, and
                           its percentage was proportional-figure text that
                           jittered as it counted. */
                        <div className="cat-progress" role="status" aria-live="polite">
                            <p className="cat-progress-task">{currentTask}</p>
                            <div
                                className="cat-progress-track"
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={totalItems}
                                aria-valuenow={progress}>
                                <div className="cat-progress-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="cat-progress-n">{progress} / {totalItems} · {pct}%</span>
                        </div>
                    ) : (
                        <>
                            <p className="cat-sub">{t.batchActionsPrompt}</p>
                            {availableActions.map(action => (
                                <label key={action.id} className="cat-action">
                                    <input
                                        type="checkbox"
                                        name="batchAction"
                                        value={action.id}
                                        checked={selectedActions.has(action.id)}
                                        onChange={() => handleActionToggle(action.id)} />
                                    <span className="min-w-0">
                                        <span className="cat-action-t">{action.label}</span>
                                        {action.desc && <span className="cat-action-d">{action.desc}</span>}
                                    </span>
                                </label>
                            ))}
                            {/* The rule in words, said once on this surface too. */}
                            <MediaOriginNote />
                        </>
                    )}
                </div>
                <div className="cat-modal-foot">
                    <button type="button" onClick={handleClose} className="cat-key cat-key--quiet" disabled={isProcessing}>{t.cancel}</button>
                    <button type="button" onClick={handleStart} className="cat-key" disabled={isProcessing || selectedActions.size === 0}>
                        {isProcessing ? t.processing : `${t.start} (${selectedActions.size})`}
                    </button>
                </div>
            </div>
        </div>
    );
}