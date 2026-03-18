import React, { useState, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai/react';
import { userAtom, SelectedItemRowAtom } from '../../lib/atoms';
import { SCRIPT_URL, vendors } from '../../lib/consts';
import { ai } from '../../lib/ai';
import { GoogleGenAI, Type } from '@google/genai';
import { useNotify } from '../../lib/hooks';
import { BoundingBox2DType, BoundingBoxMaskType, PointingType } from '../../lib/Types';
import { handleFileUpload, createCurvePath, findContour, generatePngAndSvgFromMasks, loadImage, readFileAsDataURL, simplifyContour, extractGradientFromMask } from '../../lib/utils';
import { LoadingIndicator } from '../../components/LoadingIndicator';

const uuidv4 = () => self.crypto.randomUUID();



type BatchItemStatus = 'idle' | 'processing' | 'success' | 'error';

interface BatchItem {
    id: string; // proper unique id
    localId: string; // for UI list keys
    files: File[];
    previewUrls: string[];
    status: BatchItemStatus;
    logs: string[];
    data: {
        vendorId: string;
        shape: string;
        material: string;
        price: string;
        quantity: string;
    };
    resultItemNumber?: string;
}

const MAX_ITEMS = 50;

export function BatchImportModule() {
    const user = useAtomValue(userAtom);
    const notify = useNotify();
    const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const defaultVendorId = user?.role === 'Vendor' ? user.id : Object.keys(vendors)[0] || '';

    const addBatchItem = () => {
        if (batchItems.length >= MAX_ITEMS) {
            notify.error(`Maximum batch size of ${MAX_ITEMS} reached.`);
            return;
        }
        setBatchItems(prev => [
            ...prev,
            {
                id: uuidv4(),
                localId: uuidv4(),
                files: [],
                previewUrls: [],
                status: 'idle',
                logs: [],
                data: {
                    vendorId: defaultVendorId,
                    shape: '',
                    material: '',
                    price: '',
                    quantity: '1'
                }
            }
        ]);
    };

    const removeBatchItem = (index: number) => {
        setBatchItems(prev => prev.filter((_, i) => i !== index));
    };

    const updateItemData = (index: number, field: string, value: string) => {
        setBatchItems(prev => {
            const newItems = [...prev];
            newItems[index] = { ...newItems[index], data: { ...newItems[index].data, [field]: value } };
            return newItems;
        });
    };

    const handleFileSelect = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        const newFiles = Array.from(e.target.files);
        const newPreviews = newFiles.map(f => URL.createObjectURL(f));

        setBatchItems(prev => {
            const newItems = [...prev];
            const currentItem = newItems[index];
            newItems[index] = {
                ...currentItem,
                files: [...currentItem.files, ...newFiles],
                previewUrls: [...currentItem.previewUrls, ...newPreviews]
            };
            return newItems;
        });
    };

    const processItem = async (item: BatchItem, index: number): Promise<void> => {
        const log = (msg: string) => {
            setBatchItems(prev => {
                const newItems = [...prev];
                newItems[index].logs.push(msg);
                return newItems;
            });
        };

        try {
            log('Creating draft item...');
            const createResponse = await fetch(SCRIPT_URL, {
                method: 'POST', body: JSON.stringify({ action: 'createInitialItem', vendorId: item.data.vendorId, user }),
            });
            const createResult = await createResponse.json();
            if (createResult.status !== 'success') throw new Error(createResult.message);

            const selectedItemRow = createResult.newRow;
            const itemNumber = createResult.newItemData.itemNumber;
            log(`Draft created: ${itemNumber}`);

            let generatedData: any = {};
            let details: any = {};
            let gradientColor = '';
            const masterFile = item.files[0];
            const mainImageSrc = await readFileAsDataURL(masterFile, 'image', true);
            log('Running AI on Image 1...');
            const prompt1 = `Detect and tag ${item.data.shape || 'object'}. Output a single JSON object with "boxes" and "points".`;
            let result1 = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ inlineData: { data: mainImageSrc.split(',')[1], mimeType: 'image/jpeg' } }, { text: prompt1 }] }, config: { responseMimeType: 'application/json' } });
            const data1 = JSON.parse(result1.text);
            const boxes = (data1.boxes || []).map((b: any) => ({ x: b.box_2d[1] / 1000, y: b.box_2d[0] / 1000, width: (b.box_2d[3] - b.box_2d[1]) / 1000, height: (b.box_2d[2] - b.box_2d[0]) / 1000, label: b.label }));
            const points = (data1.points || []).map((p: any) => ({ point: { x: p.point[1] / 1000, y: p.point[0] / 1000 }, label: p.label }));
            const prompt2 = `Give segmentation masks for ${item.data.shape || 'object'}. Output JSON list with "mask" (base64).`;
            let result2 = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ inlineData: { data: mainImageSrc.split(',')[1], mimeType: 'image/jpeg' } }, { text: prompt2 }] }, config: { responseMimeType: 'application/json' } });
            const rawMasks = JSON.parse(result2.text);
            const masks = await Promise.all((rawMasks || []).map(async (m: any) => {
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
            }));

            const image = await loadImage(mainImageSrc);
            const { pngData, svgData } = await generatePngAndSvgFromMasks(mainImageSrc, { width: image.width, height: image.height }, masks);
            generatedData = { boxes, points, masks, pngData, svgData };

            if (masks.length > 0) {
                gradientColor = await extractGradientFromMask(mainImageSrc, masks[0], { width: image.width, height: image.height });
            }
            const prompt3 = `Analyze the product. Estimate dimensions (widthCm, heightCm, lengthCm), weightKg, and descriptions. Return single JSON.`;
            const schema3 = { type: Type.OBJECT, properties: { widthCm: { type: Type.STRING }, heightCm: { type: Type.STRING }, lengthCm: { type: Type.STRING }, weightKg: { type: Type.STRING }, shortDescription: { type: Type.STRING }, generatedDescription: { type: Type.STRING }, detailedDescription: { type: Type.STRING } } };
            let result3 = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ inlineData: { data: mainImageSrc.split(',')[1], mimeType: 'image/jpeg' } }, { text: prompt3 }] }, config: { responseMimeType: 'application/json', responseSchema: schema3 } });
            details = JSON.parse(result3.text);

            log('AI Processing complete.');
            const photosPayload = await Promise.all(item.files.map(async (file) => {
                const result = await handleFileUpload(file, user);
                return result ? result.thumbnailUrl : null;
            }));
            const validPhotos = photosPayload.filter(Boolean) as string[];

            const payload = {
                ...item.data,
                ...details,
                color: gradientColor || item.data.price,
                spatialBoxes2d: JSON.stringify(generatedData.boxes || []),
                spatialPoints: JSON.stringify(generatedData.points || []),
                spatialMasks: JSON.stringify(generatedData.masks?.map(({ path, ...rest }: any) => rest) || []),
                photos: validPhotos,
            };
            log('Uploading data & images...');
            const updateResponse = await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'updateFullItem',
                    row: selectedItemRow,
                    itemData: payload,
                    user,
                    generatedPngUrl: generatedData.pngData ? (await (async () => {
                        const res = await fetch(generatedData.pngData);
                        const blob = await res.blob();
                        const f = new File([blob], 'mask.png', { type: 'image/png' });
                        const uploadRes = await handleFileUpload(f, user);
                        return uploadRes?.thumbnailUrl;
                    })()) : null,
                    generatedSvgUrl: generatedData.svgData ? (await (async () => {
                        const blob = new Blob([generatedData.svgData], { type: 'image/svg+xml' });
                        const f = new File([blob], 'mask.svg', { type: 'image/svg+xml' });
                        const uploadRes = await handleFileUpload(f, user);
                        return uploadRes?.thumbnailUrl;
                    })()) : null
                }),
            });
            const updateResult = await updateResponse.json();
            if (updateResult.status !== 'success') throw new Error(updateResult.message);

            setBatchItems(prev => {
                const newItems = [...prev];
                newItems[index] = { ...newItems[index], status: 'success', resultItemNumber: itemNumber };
                return newItems;
            });
            log('Success!');

        } catch (error: any) {
            console.error(error);
            setBatchItems(prev => {
                const newItems = [...prev];
                newItems[index] = { ...newItems[index], status: 'error', logs: [...newItems[index].logs, error.message] };
                return newItems;
            });
        }
    };

    const processBatch = async () => {
        setIsBatchProcessing(true);
        for (let i = 0; i < batchItems.length; i++) {
            const item = batchItems[i];
            if (item.status === 'success') continue; // Skip already done

            setBatchItems(prev => {
                const newItems = [...prev];
                newItems[i].status = 'processing';
                return newItems;
            });

            await processItem(item, i);
        }
        setIsBatchProcessing(false);
        notify.success('Batch processing finished.');
    };

    return (
        <div className="batch-import-container p-6 bg-white bg-opacity-90 rounded-xl overflow-y-auto max-h-screen">
            <header className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800">Batch Import ({batchItems.length}/{MAX_ITEMS})</h2>
                <div className="flex gap-4">
                    <button onClick={addBatchItem} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold" disabled={isBatchProcessing}>
                        + Add Item
                    </button>
                    {batchItems.length > 0 && (
                        <button onClick={processBatch} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-lg flex items-center gap-2" disabled={isBatchProcessing}>
                            {isBatchProcessing ? <LoadingIndicator /> : '🚀 Process Batch'}
                        </button>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {batchItems.map((item, index) => (
                    <div key={item.localId} className={`item-card relative border p-4 rounded-lg bg-slate-50 shadow-sm transition-all ${item.status === 'success' ? 'border-green-500 bg-green-50' : item.status === 'error' ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}>
                        {/* Remove Button */}
                        <button onClick={() => removeBatchItem(index)} className="absolute top-2 right-2 text-slate-400 hover:text-red-500" disabled={isBatchProcessing}>&times;</button>

                        {/* Status Badge */}
                        <div className="mb-4 flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${item.status === 'idle' ? 'bg-slate-300' : item.status === 'processing' ? 'bg-blue-500 animate-pulse' : item.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-sm font-semibold uppercase text-slate-500">{item.status}</span>
                            {item.resultItemNumber && <span className="ml-auto font-mono text-blue-600 font-bold">{item.resultItemNumber}</span>}
                        </div>

                        {/* Image Uploader */}
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-700 mb-1">Images ({item.files.length})</label>
                            <div className="flex gap-2 mb-2 overflow-x-auto h-20 bg-white border rounded p-1">
                                {item.previewUrls.map((src, i) => (
                                    <div key={i} className="relative shrink-0 w-16 h-full">
                                        <img src={src} className="h-full w-full object-cover rounded" />
                                        {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-[9px] text-center">AI Master</span>}
                                    </div>
                                ))}
                                <label className="shrink-0 w-16 h-full border-2 border-dashed border-slate-300 rounded flex items-center justify-center cursor-pointer hover:bg-slate-50">
                                    <span className="text-2xl text-slate-400">+</span>
                                    <input type="file" multiple accept="image/*" onChange={(e) => handleFileSelect(index, e)} className="hidden" />
                                </label>
                            </div>
                        </div>

                        {/* Basic Fields */}
                        <div className="space-y-3">
                            <div>
                                <input
                                    type="text"
                                    placeholder="Shape (e.g. Sphere)"
                                    value={item.data.shape}
                                    onChange={(e) => updateItemData(index, 'shape', e.target.value)}
                                    className="w-full px-3 py-2 border rounded text-sm disabled:bg-slate-200"
                                    disabled={item.status === 'success' || isBatchProcessing}
                                />
                            </div>
                            <div>
                                <input
                                    type="text"
                                    placeholder="Material (e.g. Onyx)"
                                    value={item.data.material}
                                    onChange={(e) => updateItemData(index, 'material', e.target.value)}
                                    className="w-full px-3 py-2 border rounded text-sm disabled:bg-slate-200"
                                    disabled={item.status === 'success' || isBatchProcessing}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="number"
                                    placeholder="Price"
                                    value={item.data.price}
                                    onChange={(e) => updateItemData(index, 'price', e.target.value)}
                                    className="w-full px-3 py-2 border rounded text-sm disabled:bg-slate-200"
                                    disabled={item.status === 'success' || isBatchProcessing}
                                />
                                <input
                                    type="number"
                                    placeholder="Qty"
                                    value={item.data.quantity}
                                    onChange={(e) => updateItemData(index, 'quantity', e.target.value)}
                                    className="w-full px-3 py-2 border rounded text-sm disabled:bg-slate-200"
                                    disabled={item.status === 'success' || isBatchProcessing}
                                />
                            </div>
                        </div>

                        {/* Logs */}
                        {item.logs.length > 0 && (
                            <div className="mt-4 p-2 bg-black bg-opacity-5 rounded text-[10px] font-mono h-24 overflow-y-auto">
                                {item.logs.map((l, i) => <div key={i} className="mb-1 text-slate-600">&gt; {l}</div>)}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
