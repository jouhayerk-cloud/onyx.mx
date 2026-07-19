import React, { useState, useEffect, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai/react';
import { createPortal } from 'react-dom';
import { 
    isBatchWizardOpenAtom, 
    batchWizardItemsAtom, 
    inventoryAtom, 
    InventoryVersionAtom,
    userAtom
} from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { getCleanImageUrl, resizeImage, handleProcessedFileUpload, loadImage, cropImage, findContour, simplifyContour, createCurvePath, generatePngAndSvgFromMasks, preprocessForMasking, applyAlphaMask } from '../../lib/utils';
import { X, Play, Loader2, CheckCircle2, AlertCircle, Sparkles, Settings2, UploadCloud, Cloud, Cpu, ZoomIn, ZoomOut, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { removeBackground } from '@imgly/background-removal';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { exportCatalogPdf, CatalogArtifact } from '../../lib/pdfExport';
import { collectAllImages, calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';

const resolveVendorColor = (vendor: string | undefined | null) => {
    if (!vendor) return '#ffffff';
    let hash = 0;
    for (let i = 0; i < vendor.length; i++) hash = vendor.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 80%, 75%)`;
};

interface BatchOp {
    id: string;
    item: any;
    status: 'idle' | 'processing' | 'completed' | 'failed';
    progress: number;
    logs: string[];
    processingMode?: 'local' | 'cloud';
    skipImageProcessing?: boolean;
    result?: {
        description?: string;
        maskUrl?: string;
    };
}

const getApiKey = () => {
    const key = localStorage.getItem('ONYX_GEMINI_KEY') || import.meta.env.VITE_GEMINI_API_KEY || '';
    const clean = String(key).trim().replace(/['"]/g, '');
    return (clean === 'null' || clean === 'undefined') ? '' : clean;
};



export const BatchProcessingWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isBatchWizardOpenAtom);
    const [batchItems, setBatchItems] = useAtom(batchWizardItemsAtom);
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    const [user] = useAtom(userAtom);
    
    const [queue, setQueue] = useState<BatchOp[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isAborted, setIsAborted] = useState(false);
    const [overallProgress, setOverallProgress] = useState(0);
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [showApiModal, setShowApiModal] = useState(false);
    const apiInputRef = useRef<HTMLInputElement>(null);

    const saveApiKey = () => {
        if (apiInputRef.current?.value) {
            localStorage.setItem('ONYX_GEMINI_KEY', apiInputRef.current.value);
            setShowApiModal(false);
            handleStartBatch();
        }
    };

    useEffect(() => {
        if (isOpen && batchItems.length > 0) {
            setQueue(batchItems.map(item => ({
                id: item.id || item.row,
                item,
                status: 'idle',
                progress: 0,
                logs: ['[ WAIT ] Ready for AI processing'],
                processingMode: 'local',
                skipImageProcessing: false
            })));
        } else if (!isOpen) {
            setQueue([]);
            setIsProcessing(false);
            setIsAborted(false);
            setOverallProgress(0);
        }
    }, [isOpen, batchItems]);

    const updateOp = (id: string, updates: Partial<BatchOp> | ((prev: BatchOp) => Partial<BatchOp>)) => {
        setQueue(prev => prev.map(op => op.id === id ? { ...op, ...(typeof updates === 'function' ? updates(op) : updates) } : op));
    };

    const logOp = (id: string, text: string) => {
        updateOp(id, prev => ({ logs: [...prev.logs, text] }));
    };

    const callGemini = async (prompt: string, imgData: string, timeoutMs: number = 40000, modelId: string = "gemini-2.5-flash") => {
        const API_KEY = getApiKey();
        if (!API_KEY) throw new Error("API Key missing");
        
        // Use v1beta endpoint for 1.5-flash since some accounts might not have it exposed on v1
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ 
                    parts: [
                        { text: prompt }, 
                        { inlineData: { mimeType: 'image/jpeg', data: imgData } }
                    ] 
                }] 
            })
        });
        
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (res.status === 400 && err?.error?.message?.includes('API key not valid')) {
                localStorage.removeItem('ONYX_GEMINI_KEY');
                throw new Error("Invalid API Key! Please click the Settings icon above to provide a valid key.");
            }
            throw new Error(`API Error: ${res.status} ${err?.error?.message || ''}`);
        }
        return await res.json();
    };

    const processSingleItem = async (op: BatchOp) => {
        updateOp(op.id, { status: 'processing', progress: 10 });
        logOp(op.id, '[ WAIT ] Resizing image...');
        try {
            const itemData = op.item.data || op.item;
            const imageUrl = getCleanImageUrl(op.item.generatedPngUrl || itemData.generatedPngUrl || op.item.imageUrl || itemData.mediaUrls?.split(',')[0]);
            if (!imageUrl) throw new Error("No image found for item");

            const aiDataUrl = await resizeImage(imageUrl, 1024);
            const base64 = aiDataUrl.split(',')[1];
            logOp(op.id, '[  OK  ] Image resized successfully');

            updateOp(op.id, { progress: 30 });
            logOp(op.id, '[ WAIT ] Analyzing via Gemini...');
            
            const shape = itemData.shape || 'Artifact';
            const type = itemData.shortDescription || itemData.type || 'Object';
            const material = itemData.material || 'Onyx';
            
            const prompt = `FIND the ${material} ${shape} ${type}. 
Generate a short, title-style description (maximum 1 sentence) of the item.

CRITICAL RULES for the description:
- Keep it concise, like a product title.
- Do NOT use the word 'lamp'. ALL lamps MUST be described as 'Luminarie' or 'Luminaries'.

Examples of the desired style:
- Rectangular White Onyx Wall Luminarie pair with green banding running in the center.
- Aqua Onyx Cylinder Luminarie with Rustic open top aqua band in center.
- Round Pink Onyx mirror with brown banding.

Return ONLY valid JSON in this exact structure, with no markdown formatting:
{
  "description": "Your short title-style description here..."
}`;

            const data = await callGemini(prompt, base64);
            logOp(op.id, '[  OK  ] Received Gemini response');
            
            let resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!resultText) throw new Error("Empty response from AI");
            
            updateOp(op.id, { progress: 70 });
            logOp(op.id, '[ WAIT ] Parsing results...');
            
            if (resultText.includes('```')) {
                const match = resultText.match(/```(?:json)?([\s\S]*?)```/);
                if (match) resultText = match[1].trim();
                else resultText = resultText.replace(/```(json)?|```/g, '').trim();
            }
            
            const processed = JSON.parse(resultText);
            if (!processed.description) {
                throw new Error("Invalid output format from AI");
            }
            logOp(op.id, '[  OK  ] Parsing complete');

            let localMaskUrl = null;
            if (!op.skipImageProcessing) {
                if (op.processingMode === 'cloud') {
                    logOp(op.id, '[ WAIT ] Running Cloud AI for background removal...');
                const itemData = op.item.data || op.item;
                const shape = itemData.shape || 'object';
                // Pass 1: Only ask for bounding boxes, NOT masks! Asking for multiple base64 masks in one pass blows past the 8192 token limit!
                const instruction = `Find all discrete objects/panels of this ${shape} Onyx artifact. Instructions: If it is a bowl or basin, strictly extract and separate the 'rim', 'interior', and 'exterior'. Output a JSON list of objects: [{"box_2d": [ymin, xmin, ymax, xmax], "label": "string"}].`;

                try {
                    // Use the latest 2.5 model for unparalleled detection logic
                    const data = await callGemini(instruction, base64, 40000, "gemini-2.5-flash");
                    let resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (!resultText) throw new Error("Empty response from Engine");
                    
                    if (resultText.includes('```')) {
                        const match = resultText.match(/```(?:json)?([\s\S]*?)```/);
                        if (match) resultText = match[1].trim();
                        else resultText = resultText.replace(/```(json)?|```/g, '').trim();
                    }
                    
                    const processed = JSON.parse(resultText);
                    logOp(op.id, `[  OK  ] Found ${processed.length} layers. Refining...`);

                    const img = await loadImage(imageUrl);
                    const originalWidth = img.width;
                    const originalHeight = img.height;
                    const targetSize = 1024;
                    
                    let drawW, drawH;
                    if (originalWidth > originalHeight) { drawW = targetSize; drawH = Math.round(originalHeight * (targetSize / originalWidth)); } 
                    else { drawH = targetSize; drawW = Math.round(originalWidth * (targetSize / originalHeight)); }
                    const offsetX = (targetSize - drawW) / 2;
                    const offsetY = (targetSize - drawH) / 2;

                    const masks: any[] = [];
                    for (let idx = 0; idx < processed.length; idx++) {
                        const m = processed[idx];
                        updateOp(op.id, { progress: 15 + ((idx/processed.length) * 75), stepLabel: `Extracting Mask ${idx+1}/${processed.length}...` });
                        
                        const box = m.box_2d;
                        const bx_x = box[1] / 1000; const bx_y = box[0] / 1000;
                        const bx_w = (box[3] - box[1]) / 1000; const bx_h = (box[2] - box[0]) / 1000;
                        
                        // Crop to 512x512 for Gemini analysis
                        const cropUrl = await cropImage(imageUrl, bx_x, bx_y, bx_w, bx_h, 512);
                        const processedCropUrl = await preprocessForMasking(cropUrl);
                        const cropBase64 = processedCropUrl.split(',')[1];
                        
                        const refInstruction = `Edge Segmenter: Trace the precise outer silhouette boundary of the artifact in this crop and generate a 1-bit monochrome (black and white) PNG mask image. White is the artifact, black is the background.
CRITICAL RULES:
1. Generate a 256x256 image with 1-bit monochrome color depth (no antialiasing) to keep the file size extremely small.
2. Return ONLY the raw base64 encoded string of the PNG. Do NOT use JSON, do NOT use markdown, do NOT include quotes, do NOT include "data:image/png;base64,". Just the raw base64 characters.`;
                        
                        let cropMaskDataUrl = '';
                        const refData = await callGemini(refInstruction, cropBase64, 40000, "gemini-2.5-pro");
                        
                        let refContent = refData?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (refContent) {
                            if (refContent.includes('```')) {
                                const match = refContent.match(/```(?:base64)?([\s\S]*?)```/);
                                if (match) refContent = match[1];
                                else refContent = refContent.replace(/```(base64)?|```/g, '');
                            }
                            refContent = refContent.trim().replace(/\s/g, '');
                            
                            if (refContent.startsWith('iVBORw0KGgo')) {
                                cropMaskDataUrl = `data:image/png;base64,${refContent}`;
                            } else {
                                console.error("Invalid base64 PNG signature:", refContent.substring(0, 50));
                            }
                        }
                        
                        if (!cropMaskDataUrl) {
                            throw new Error("Cloud Mask failed: AI generated invalid mask.");
                        }
                        
                        const maskImg = await loadImage(cropMaskDataUrl);
                        const rcv = document.createElement('canvas');
                        rcv.width = maskImg.width; rcv.height = maskImg.height;
                        const rctx = rcv.getContext('2d', { willReadFrequently: true })!;
                        rctx.drawImage(maskImg, 0, 0);
                        const iData = rctx.getImageData(0, 0, rcv.width, rcv.height);
                        const contour = findContour(iData);
                        
                        const simplified = simplifyContour(contour, 0.2);
                        const maskWidth = maskImg.width;
                        const maskHeight = maskImg.height;
        
                        const x_pad = (box[1] / 1000) * targetSize; const y_pad = (box[0] / 1000) * targetSize;
                        const w_pad = ((box[3] - box[1]) / 1000) * targetSize; const h_pad = ((box[2] - box[0]) / 1000) * targetSize;
                        const x_orig = (x_pad - offsetX) * (originalWidth / drawW);
                        const y_orig = (y_pad - offsetY) * (originalHeight / drawH);
                        const w_orig = w_pad * (originalWidth / drawW);
                        const h_orig = h_pad * (originalHeight / drawH);

                        masks.push({
                            label: obj.label,
                            x: x_orig / originalWidth, y: y_orig / originalHeight, 
                            width: w_orig / originalWidth, height: h_orig / originalHeight,
                            maskWidth: maskWidth,
                            maskHeight: maskHeight,
                            path: createCurvePath(simplified), points: simplified
                        });
                    }

                    logOp(op.id, '[ WAIT ] Generating high-res cutout...');
                    const { pngData } = await generatePngAndSvgFromMasks(imageUrl, { width: img.width, height: img.height }, masks);
                    localMaskUrl = pngData;
                    logOp(op.id, '[  OK  ] Cloud Mask generated');

                } catch (e: any) {
                    logOp(op.id, `[ FAIL ] Cloud Mask failed: ${e.message}`);
                    console.error(e);
                }
            } else {
                logOp(op.id, '[ WAIT ] Running local AI for background removal...');
                try {
                    updateOp(op.id, { progress: 15, stepLabel: 'Preparing Full-Res SDR Image...' });
                    
                    // Convert raw HDR to SDR while PRESERVING original resolution and aspect ratio
                    const sdrDataUrl = await new Promise<string>((resolve, reject) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return reject(new Error('Canvas error'));
                            ctx.drawImage(img, 0, 0, img.width, img.height);
                            resolve(canvas.toDataURL('image/jpeg', 1.0));
                        };
                        img.onerror = () => reject(new Error('Image load failed'));
                        img.src = imageUrl;
                    });

                    logOp(op.id, '[ WAIT ] Extracting background...');
                    const processedSdrUrl = await preprocessForMasking(sdrDataUrl);
                    const bgBlob = await removeBackground(processedSdrUrl, {
                        model: 'isnet', // Upgrade to isnet for perfect solid boundaries and fewer partial cuts
                        output: { format: 'image/png' },
                        debug: false,
                        progress: (key, current, total) => {
                            const p = Math.round((current / total) * 100);
                            updateOp(op.id, { progress: 15 + (p * 0.7), stepLabel: `Extracting: ${key} ${p}%` });
                        }
                    });
                    updateOp(op.id, { progress: 90, stepLabel: 'Finalizing Image...' });
                    localMaskUrl = await applyAlphaMask(sdrDataUrl, bgBlob);
                    logOp(op.id, '[  OK  ] Mask generated locally');
                } catch (err: any) {
                    logOp(op.id, `[ FAIL ] Mask generation failed: ${err.message}`);
                    console.error(err);
                }
            }
            } else {
                logOp(op.id, '[ SKIP ] Image processing skipped');
                updateOp(op.id, { progress: 90 });
            }

            updateOp(op.id, { 
                status: 'completed', 
                progress: 100, 
                result: {
                    description: processed.description,
                    maskUrl: localMaskUrl || undefined
                }
            });
        } catch (err: any) {
            logOp(op.id, `[ FAIL ] ${err.message}`);
            updateOp(op.id, { status: 'failed', progress: 0 });
            throw err;
        }
    };

    const handleSaveDescription = async (op: BatchOp) => {
        if (!op.result?.description) return;
        const toastId = toast.loading(`Saving description...`);
        try {
            const { error } = await supabase
                .from('inventory')
                .update({ detailed_description: op.result.description })
                .eq('id', op.item.id || op.item.row);
                
            if (error) throw error;
            toast.success('Description saved successfully!', { id: toastId });
        } catch (err: any) {
            toast.error(`Failed to save: ${err.message}`, { id: toastId });
        }
    };

    const handleUploadMask = async (op: BatchOp) => {
        if (!op.result?.maskUrl) return;
        const toastId = toast.loading(`Uploading mask for item...`);
        try {
            const upRes = await handleProcessedFileUpload(op.result.maskUrl, `mask_${op.id}.png`, user);
            if (upRes && upRes.thumbnailUrl) {
                const itemData = op.item.data || op.item;
                const currentMasks = itemData.spatialMasks || itemData.spatial_masks || {};
                const updatedMasks = Array.isArray(currentMasks) 
                    ? { angle_0: [{ mask: upRes.thumbnailUrl }] } 
                    : { ...currentMasks, angle_0: [{ mask: upRes.thumbnailUrl }] };

                const { error } = await supabase.from('inventory').update({
                    spatial_masks: updatedMasks,
                    processed_media_urls: upRes.thumbnailUrl
                }).eq('id', op.item.id || op.item.row);
                
                if (error) throw error;
                toast.success('Mask uploaded and linked successfully!', { id: toastId });
            }
        } catch (e: any) {
            toast.error(`Upload failed: ${e.message}`, { id: toastId });
        }
    };

    const getProductCategory = (shape: string, shortDesc: string) => {
        const combined = `${shape} ${shortDesc}`.toLowerCase();
        if (combined.includes('wine rack')) return 'Furniture > Cabinets & Storage > Wine Racks';
        if (combined.includes('pendant')) return 'Home & Garden > Lighting > Lighting Fixtures > Pendant Light Fixtures';
        if (combined.includes('tower lamp') || combined.includes('floor lamp') || combined.includes('pillar')) return 'Home & Garden > Lighting > Lamps > Floor Lamps';
        if (combined.includes('table lamp') || combined.includes('desk lamp') || combined.includes('lamp')) return 'Home & Garden > Lighting > Lamps > Desk Lamps';
        if (combined.includes('coaster')) return 'Home & Garden > Kitchen & Dining > Barware > Coasters';
        if (combined.includes('bathtub') || combined.includes('tub')) return 'Hardware > Plumbing > Plumbing Fixtures > Bathtubs';
        if (combined.includes('sink') || combined.includes('vessel')) return 'Hardware > Plumbing > Plumbing Fixtures > Sinks';
        if (combined.includes('sculpture') || combined.includes('statue') || combined.includes('carving') || combined.includes('figure')) return 'Home & Garden > Decor > Artwork > Sculptures & Statues';
        if (combined.includes('bowl')) return 'Home & Garden > Decor > Decorative Bowls';
        if (combined.includes('plate')) return 'Home & Garden > Decor > Decorative Plates';
        if (combined.includes('tray')) return 'Home & Garden > Decor > Decorative Trays';
        if (combined.includes('fountain') || combined.includes('waterfall')) return 'Home & Garden > Decor > Fountains & Ponds > Fountains & Waterfalls > Fountains';
        if (combined.includes('garden sculpture') || combined.includes('lawn ornament')) return 'Home & Garden > Decor > Lawn Ornaments & Garden Sculptures > Garden Sculptures';
        if (combined.includes('mirror')) return 'Home & Garden > Decor > Mirrors';
        if (combined.includes('shot glass') || combined.includes('tequila glass')) return 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Shot Glasses';
        if (combined.includes('wall light') || combined.includes('sconce')) return 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures';
        if (combined.includes('board game') || combined.includes('chess') || combined.includes('checkers') || combined.includes('tic tac toe')) return 'Toys & Games > Games > Board Games';
        return 'Home & Garden > Decor';
    };

    const handleExportAll = async () => {
        const completedOps = queue.filter(op => op.status === 'completed');
        if (completedOps.length === 0) {
            toast.error('No completed items to export.');
            return;
        }

        const toastId = toast.loading(`Uploading images and descriptions for ${completedOps.length} items...`);
        const exportDataList: any[] = [];
        const catalogResults: CatalogArtifact[] = [];

        try {
            for (const op of completedOps) {
                let thumbnailUrl = '';
                // 1. Upload Mask if it exists
                if (op.result?.maskUrl) {
                    const upRes = await handleProcessedFileUpload(op.result.maskUrl, `mask_${op.id}.png`, user);
                    if (upRes && upRes.thumbnailUrl) {
                        thumbnailUrl = upRes.thumbnailUrl;
                        const itemData = op.item.data || op.item;
                        const currentMasks = itemData.spatialMasks || itemData.spatial_masks || {};
                        const updatedMasks = Array.isArray(currentMasks) 
                            ? { angle_0: [{ mask: upRes.thumbnailUrl }] } 
                            : { ...currentMasks, angle_0: [{ mask: upRes.thumbnailUrl }] };
        
                        await supabase.from('inventory').update({
                            spatial_masks: updatedMasks,
                            processed_media_urls: upRes.thumbnailUrl
                        }).eq('id', op.item.id || op.item.row);
                    }
                }
                // 2. Save Description
                if (op.result?.description) {
                    await supabase.from('inventory').update({ detailed_description: op.result.description }).eq('id', op.item.id || op.item.row);
                }

                const itemData = op.item.data || op.item;
                const shape = itemData.shape || 'object';
                const shortDesc = itemData.shortDescription || itemData.type || '';
                const category = getProductCategory(shape, shortDesc);
                
                // Normalization and code calculation for PDF
                const normData = normalizeInventoryData(itemData);
                const codes = calculateCodesAndPrices(itemData, 1, 'REG'); // default to 1 and 'REG' since we don't have atoms here directly, or we can just calculate them

                const vendorMapping: Record<string, string> = {
                    'ET': 'Betoeduardo',
                    'DH': 'Delfino',
                    'EM': 'Emmanuel',
                    'GE': 'Geraldo',
                    'JM': 'Jose',
                    'ML': 'Maria Luisa',
                    'MM': 'Mariam',
                    'SU': 'Susana',
                    'TE': 'Tellez',
                    'CA': 'Carlos',
                    'AM': 'Alejandro',
                    'CP': 'Cantera Puebla',
                    'AN': 'Angel',
                    'FR': 'Fountain Rock Mine',
                    'BT': 'Bernardo'
                };
                
                const tagId = codes?.bookBarcode || normData.book_barcode || normData.itemId || '';
                const matchPrefix = tagId.match(/^[A-Za-z]+/);
                const extractedPrefix = matchPrefix ? matchPrefix[0] : '';
                const rawVendorId = String(normData.vendor_id || extractedPrefix || '').toUpperCase();
                const vendorName = vendorMapping[rawVendorId] || rawVendorId || 'Art of Decor';

                exportDataList.push({
                    op,
                    thumbnailUrl,
                    category,
                    vendorName
                });

                // Update the normData with the generated AI descriptions and image URLs
                const pdfData = { 
                    ...normData, 
                    detailed_description: op.result?.description || normData.detailed_description, 
                    processed_media_urls: thumbnailUrl || normData.processed_media_urls,
                    category: category
                };
                
                // Use the base64 mask directly for the PDF to avoid CORS and loading delays
                const pdfImage = op.result?.maskUrl || thumbnailUrl || getCleanImageUrl(normData.generatedPngUrl || normData.imageUrl || normData.mediaUrls?.split(',')[0]);

                catalogResults.push({
                    data: pdfData,
                    codes: codes,
                    images: pdfImage ? [pdfImage] : collectAllImages(normData),
                    exportType: 'catalog'
                });
            }

            toast.loading('Generating Shopify XLSX...', { id: toastId });
            
            // Generate Shopify XLSX
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Onyx Dashboard';
            const sheet = workbook.addWorksheet('Shopify Export');
            const headers = [
                'Title', 'Vendor', 'Variant SKU', 'Variant Barcode', 'Variant Cost',
                'Variant Price', 'Variant Grams', 'Image Src', 'Image Position', 
                'Metafield: custom.product_weight [single_line_text_field]', 
                'Variant Metafield: Vendor_SKU', 'Variant Weight Unit', 
                'Variant Metafield: reg.variant_depth', 'Variant Metafield: reg.variant_width', 
                'Variant Metafield: reg.variant_height', 'Variant Metafield: reg.variant_measurements', 
                'Metafield: Measurements', 'Metafield: shopify.material [list.metaobject_reference]', 
                'Metafield: custom.variety [list.single_line_text_field]', 'Variant Country of Origin', 
                'Tags', 'Product Category', 'Metafield: shopify.color-pattern [list.metaobject_reference]', 
                'Metafield: custom.polish_type [list.single_line_text_field]', 
                'Metafield: custom.cut_type [list.single_line_text_field]', 
                'Metafield: shopify.age-group [list.metaobject_reference]', 
                'Metafield: shopify.target-gender [list.metaobject_reference]', 
                'Variant Metafield: mm-google-shopping.custom_label_1', 
                'Metafield: reg.designer', 'Status', 'Published', 'Published Scope', 
                'Variant Taxable', 'Variant Inventory Tracker', 'Variant Inventory Policy', 
                'Variant Fulfillment Service', 'Variant Requires Shipping'
            ];
            sheet.addRow(headers);
            sheet.getRow(1).font = { bold: true };

            exportDataList.forEach(({ op, thumbnailUrl, category, vendorName }) => {
                const itemData = op.item.data || op.item;
                const norm = normalizeInventoryData(itemData);
                const bookRate = 20; // Default exchange rate
                const calc = calculateCodesAndPrices(norm, bookRate, '326');
                
                // Title (Fallback to standard logic if AI title fails)
                const shape = norm.shape || '';
                const shortDesc = norm.shortDescription || norm.type || '';
                const color = norm.color || '';
                const material = norm.material || '';
                const fallbackTitle = `${shape} ${shortDesc} ${color} ${material}`.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const title = op.result?.description || fallbackTitle;

                const tagId = calc.bookBarcode || norm.book_barcode || norm.itemId || String(itemData.row) || '';
                const vendorSku = calc.bookAqCode || tagId.replace(/^[A-Za-z]{2}[-]?\d{3}[-]?/, '') || tagId;
                
                const rawVendorId = String(norm.vendor_id || '').toUpperCase();
                let polishType = 'matte';
                if (rawVendorId === 'JM') polishType = 'high-polish';
                else if (['EM', 'ML', 'TE'].includes(rawVendorId)) polishType = 'polish';

                const parseNum = (val: any) => { const num = parseFloat(val); return isNaN(num) ? 0 : num; };
                const cmToIn = (cm: any) => (parseNum(cm) / 2.54).toFixed(2);
                const kgToLbs = (kg: any) => (parseNum(kg) * 2.20462).toFixed(2);
                
                const costMxn = parseFloat(norm.price || norm.acquisition_price_mxn || '0') || 0;
                const landedUsd = ((costMxn / bookRate) * 1.4) || 0;
                const retailUsd = (landedUsd * 12) || 0;
                const price = Math.round(retailUsd * 100) / 100;
                const cost = calc.bookLanded || '';

                const weightKg = parseNum(norm.weightKg);
                const weightGrams = Math.round(weightKg * 1000);
                const weightLbs = kgToLbs(weightKg);
                
                const depthIn = cmToIn(norm.lengthCm);
                const widthIn = cmToIn(norm.widthCm);
                const heightIn = cmToIn(norm.heightCm);
                const measurementsStr = `D${depthIn}xW${widthIn}xH${heightIn}`;
                const variety = 'Mexican Onyx';
                const formattedMaterial = material ? material.charAt(0).toUpperCase() + material.slice(1) : 'Onyx';

                // Determine 'image src' to use
                let imageSrc = '';
                if (op.skipImageProcessing) {
                    // Use original uploaded image if processing was skipped
                    imageSrc = getCleanImageUrl(norm.imageUrl || norm.mediaUrls?.split(',')[0]) || '';
                } else {
                    // Use newly generated thumbnail or previously generated png
                    imageSrc = getCleanImageUrl(thumbnailUrl) || getCleanImageUrl(norm.generatedPngUrl) || getCleanImageUrl(norm.imageUrl || norm.mediaUrls?.split(',')[0]) || '';
                }
                
                // Shopify often requires image URLs to end with a valid image extension to process them successfully.
                if (imageSrc && imageSrc.includes('google') && !imageSrc.toLowerCase().endsWith('.png') && !imageSrc.toLowerCase().endsWith('.jpg')) {
                    imageSrc = imageSrc.includes('?') ? `${imageSrc}&ext=.png` : `${imageSrc}?.png`;
                }

                const combinedVendorSku = `${tagId}-${vendorSku}${costMxn}`;

                sheet.addRow([
                    title, // A
                    vendorName, // B
                    tagId, // C Variant SKU
                    '', // D Variant Barcode
                    cost, // E Variant Cost
                    price, // F Variant Price
                    weightGrams, // G Variant Grams
                    imageSrc, // H Image Src
                    1, // I Image Position
                    weightLbs, // J custom.product_weight
                    combinedVendorSku, // K Vendor_SKU
                    '', // L Variant Weight Unit
                    depthIn, // M reg.variant_depth
                    widthIn, // N reg.variant_width
                    heightIn, // O reg.variant_height
                    measurementsStr, // P reg.variant_measurements
                    '', // Q Metafield: Measurements
                    formattedMaterial, // R shopify.material
                    variety, // S custom.variety
                    'MX', // T Variant Country of Origin
                    `${formattedMaterial}, ${shape}, ${shortDesc}`.replace(/,\s*$/, ''), // U Tags (Instead of U polish_type as in old export? Wait, old export has Tags column? Let's check headers. Yes, U is Tags in this export!)
                    category, // V Product Category
                    '', // W color-pattern
                    polishType, // X polish_type
                    '', // Y cut_type
                    'Adults', // Z age-group
                    'Unisex', // AA target-gender
                    'Rare Earth Gallery', // AB
                    'Rare Earth Gallery', // AC
                    'active', // AD Status
                    'true', // AE Published
                    'web', // AF Published Scope
                    'true', // AG Taxable
                    'shopify', // AH Inventory Tracker
                    'deny', // AI Inventory Policy
                    'manual', // AJ Fulfillment
                    'true' // AK Requires Shipping
                ]);
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const dateStr = new Date().toISOString().split('T')[0];
            saveAs(new Blob([buffer]), `Shopify_Export_AI_${dateStr}.xlsx`);

            toast.loading('Generating Catalog PDF...', { id: toastId });
            const blob = await exportCatalogPdf(catalogResults, {
                title: `AI Generated Catalog ${dateStr}`,
                method: 'grid',
                logo: 'ArtOfDecor',
                exportType: 'catalog'
            }, () => {}, 'blob');

            if (blob instanceof Blob) {
                saveAs(blob, `Catalog_AI_${dateStr}.pdf`);
            }

            toast.success('Exports completed successfully!', { id: toastId });
            setInventoryVersion(Date.now());
        } catch (e: any) {
            toast.error(`Export failed: ${e.message}`, { id: toastId });
            console.error(e);
        }
    };

    const handleStartBatch = async () => {
        if (!getApiKey()) {
            setShowApiModal(true);
            return;
        }

        setIsProcessing(true);
        setIsAborted(false);
        setOverallProgress(0);

        let completed = 0;
        for (const op of queue) {
            if (isAborted) break;
            if (op.status === 'completed') {
                completed++;
                continue;
            }

            try {
                await processSingleItem(op);
            } catch (err) {
                console.error("Failed processing item:", op.id, err);
            }
            completed++;
            setOverallProgress((completed / queue.length) * 100);
            await new Promise(r => setTimeout(r, 1000)); // Rate limit backoff
        }
        
        setIsProcessing(false);
        setInventoryVersion(v => v + 1);
        if (!isAborted) {
            toast.success("AI Batch Processing Complete!");
        }
    };

    const handleClose = () => {
        if (isProcessing) {
            const ok = window.confirm("Processing is active. Are you sure you want to abort and close?");
            if (!ok) return;
            setIsAborted(true);
        }
        setIsOpen(false);
    };

    const toggleProcessingMode = (id: string) => {
        setQueue(prev => prev.map(op => {
            if (op.id === id) {
                return { ...op, processingMode: op.processingMode === 'local' ? 'cloud' : 'local' };
            }
            return op;
        }));
    };

    const toggleImageProcessing = (id: string) => {
        setQueue(prev => prev.map(op => {
            if (op.id === id) {
                return { ...op, skipImageProcessing: !op.skipImageProcessing };
            }
            return op;
        }));
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex animate-in fade-in duration-500 bg-black/70 backdrop-blur-3xl">
            <div className="relative w-full h-full flex flex-col bg-transparent">
                
                {/* Fullscreen Image Gallery Mode */}
                {fullscreenImage && (
                    <div 
                        className="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in"
                        onClick={() => { setFullscreenImage(null); setZoomLevel(1); }}
                    >
                        <div className="absolute top-6 right-6 flex gap-4 z-50">
                            <button onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.min(z + 0.5, 4)); }} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white backdrop-blur-md transition-all">
                                <ZoomIn size={24} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.max(z - 0.5, 1)); }} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white backdrop-blur-md transition-all">
                                <ZoomOut size={24} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); setZoomLevel(1); }} className="p-3 bg-white/10 hover:bg-rose-500/20 hover:text-rose-400 rounded-xl text-white backdrop-blur-md transition-all">
                                <X size={24} />
                            </button>
                        </div>
                        <div 
                            className="w-full h-full p-12 flex items-center justify-center overflow-auto scrollbar-none"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img 
                                src={fullscreenImage} 
                                style={{ transform: `scale(${zoomLevel})` }}
                                className="max-w-full max-h-full object-contain transition-transform duration-300 ease-out cursor-zoom-in drop-shadow-2xl" 
                                onClick={(e) => { e.stopPropagation(); setZoomLevel(z => z === 1 ? 2 : 1); }}
                            />
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-black/20">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-(--main-color)/20 flex items-center justify-center text-(--main-color)">
                            <Sparkles size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight text-white">AI Content Generator</h2>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Batch segmentation & description logic</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowApiModal(true)} title="API Settings" className="p-3 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-all">
                            <Settings2 size={24} />
                        </button>
                        <button onClick={handleClose} className="p-3 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-all">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Queue List */}
                <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-6">
                    {queue.map((op, idx) => (
                        <div key={op.id} className="relative overflow-hidden bg-black/20 border border-white/5 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center gap-8 shadow-xl">
                            {/* Glowing Progress Background */}
                            <div 
                                className="absolute top-0 left-0 bottom-0 bg-(--main-color)/20 shadow-[0_0_30px_var(--main-color)] transition-all duration-500 ease-out"
                                style={{ width: `${op.progress}%` }}
                            />
                            
                            <div 
                                className="w-32 h-32 md:w-48 md:h-48 rounded-2xl bg-black/40 overflow-hidden shrink-0 relative z-10 border border-white/10 cursor-pointer group"
                                onClick={() => {
                                    const img = op.item.imageUrl || (op.item.data && op.item.data.mediaUrls ? op.item.data.mediaUrls.split(',')[0] : null);
                                    if (img) setFullscreenImage(getCleanImageUrl(img));
                                }}
                            >
                                {op.item.imageUrl || (op.item.data && op.item.data.mediaUrls) ? (
                                    <>
                                        <img src={getCleanImageUrl(op.item.imageUrl || op.item.data.mediaUrls.split(',')[0])} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-all">
                                            <ZoomIn size={24} className="text-white drop-shadow-md" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/20"><Sparkles size={32}/></div>
                                )}
                            </div>
                            
                            <div className="flex-1 relative z-10 w-full">
                                <div className="flex items-start justify-between w-full">
                                    <div>
                                        <h4 
                                            className="text-xl md:text-2xl font-black uppercase tracking-tight"
                                            style={{ color: resolveVendorColor((op.item.data || op.item).vendor || (op.item.data || op.item).supplier) }}
                                        >
                                            {(op.item.data || op.item).itemId || `Item ${(op.item.data || op.item).itemNumber}`}
                                        </h4>
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] font-black uppercase tracking-widest text-white/50">
                                            <span className="text-white/80">{(op.item.data || op.item).shape || 'N/A'}</span>
                                            <span>•</span>
                                            <span className="text-white/80">{(op.item.data || op.item).color || 'N/A'}</span>
                                            <span>•</span>
                                            <span className="text-white/80">{(op.item.data || op.item).material || 'N/A'}</span>
                                            {((op.item.data || op.item).dimensions) && (
                                                <>
                                                    <span>•</span>
                                                    <span className="text-white/60">{(op.item.data || op.item).dimensions}</span>
                                                </>
                                            )}
                                            {((op.item.data || op.item).location || (op.item.data || op.item).zone) && (
                                                <>
                                                    <span>•</span>
                                                    <span className="text-white/60">{(op.item.data || op.item).location || (op.item.data || op.item).zone}</span>
                                                </>
                                            )}
                                            {((op.item.data || op.item).vendor || (op.item.data || op.item).supplier) && (
                                                <>
                                                    <span>•</span>
                                                    <span style={{ color: resolveVendorColor((op.item.data || op.item).vendor || (op.item.data || op.item).supplier) }}>
                                                        {(op.item.data || op.item).vendor || (op.item.data || op.item).supplier}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => toggleImageProcessing(op.id)}
                                            disabled={op.status !== 'idle'}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                                                !op.skipImageProcessing 
                                                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                                    : 'bg-white/5 text-white/40 border-white/10'
                                            } ${op.status !== 'idle' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 hover:text-white'}`}
                                            title="Toggle AI background removal"
                                        >
                                            IMG
                                        </button>
                                        <button 
                                            onClick={() => toggleProcessingMode(op.id)}
                                            disabled={op.status !== 'idle' || op.skipImageProcessing}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                                                op.processingMode === 'cloud' 
                                                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                                    : 'bg-(--main-color)/20 text-(--main-color) border-(--main-color)/30'
                                            } ${op.status !== 'idle' || op.skipImageProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 hover:text-white'}`}
                                        >
                                            {op.processingMode === 'cloud' ? <Cloud size={14} /> : <Cpu size={14} />}
                                            {op.processingMode === 'cloud' ? 'CLOUD' : 'LOCAL'}
                                        </button>
                                    </div>
                                </div>

                                {/* Step Label & Progress text */}
                                {op.status === 'processing' && (
                                    <div className="mt-4 flex items-center justify-between text-xs font-black uppercase tracking-widest text-(--main-color)">
                                        <span className="flex items-center gap-2 animate-pulse"><Loader2 size={12} className="animate-spin"/> {op.stepLabel || 'Processing...'}</span>
                                        <span>{Math.round(op.progress)}%</span>
                                    </div>
                                )}

                                <div className="mt-4 text-xs font-mono text-(--main-color)/60 break-words whitespace-pre-wrap max-h-32 overflow-y-auto flex flex-col gap-1 p-3 bg-black/40 rounded-xl border border-white/5 relative z-10">
                                    {op.logs.map((logStr, i) => (
                                        <div key={i} className={logStr.includes('[ FAIL ]') ? 'text-rose-400' : logStr.includes('[  OK  ]') ? 'text-emerald-400' : ''}>
                                            {">"} {logStr}
                                        </div>
                                    ))}
                                </div>
                                {op.result && (
                                    <div className="mt-4 p-4 bg-black/60 rounded-2xl border border-(--main-color)/30 flex flex-col md:flex-row gap-6 animate-in slide-in-from-top-2">
                                        {op.result.maskUrl && (
                                            <div 
                                                className="w-full md:w-32 h-32 rounded-xl overflow-hidden shrink-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSI+PC9yZWN0Pgo8cGF0aCBkPSJNMCAwTDggOFpNOCAwTDAgOFoiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIj48L3BhdGg+Cjwvc3ZnPg==')] flex flex-col items-center justify-center border border-white/20 group relative cursor-pointer"
                                                onClick={() => setFullscreenImage(op.result!.maskUrl!)}
                                            >
                                                <img src={op.result.maskUrl} className="w-full h-full object-contain drop-shadow-2xl group-hover:scale-110 transition-all duration-300" />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-4">
                                                    <button onClick={(e) => { e.stopPropagation(); handleUploadMask(op); }} className="flex flex-col items-center text-white/80 hover:text-white hover:scale-110 transition-all">
                                                        <UploadCloud size={20} />
                                                        <span className="text-[9px] font-black uppercase mt-1">Upload</span>
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); setFullscreenImage(op.result!.maskUrl!); }} className="flex flex-col items-center text-white/80 hover:text-white hover:scale-110 transition-all">
                                                        <ZoomIn size={20} />
                                                        <span className="text-[9px] font-black uppercase mt-1">View</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex-1 flex flex-col gap-3">
                                            <textarea 
                                                value={op.result.description || ''}
                                                onChange={(e) => updateOp(op.id, { result: { ...op.result, description: e.target.value } })}
                                                className="w-full h-full min-h-[120px] bg-black/40 border border-white/10 rounded-xl p-4 text-xs md:text-sm text-white/90 font-mono leading-relaxed focus:outline-none focus:border-(--main-color) transition-all resize-none scrollbar-thin scrollbar-thumb-white/20"
                                                placeholder="AI generated description will appear here..."
                                            />
                                            <div className="flex justify-end">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleSaveDescription(op); }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-(--main-color)/20 hover:bg-(--main-color) text-(--main-color) hover:text-black text-[10px] font-black uppercase tracking-widest rounded-lg border border-(--main-color)/30 transition-all"
                                                >
                                                    <Save size={14} />
                                                    Save Description
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="relative z-10 w-16 h-16 flex items-center justify-center shrink-0 ml-auto md:ml-0 mt-4 md:mt-0 bg-black/30 rounded-2xl border border-white/10">
                                {op.status === 'processing' && <Loader2 size={24} className="text-(--main-color) animate-spin" />}
                                {op.status === 'completed' && <CheckCircle2 size={24} className="text-emerald-500" />}
                                {op.status === 'failed' && <AlertCircle size={24} className="text-rose-500" />}
                                {op.status === 'idle' && <span className="text-[10px] font-black text-white/20">WAIT</span>}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer Controls */}
                <div className="p-8 border-t border-white/10 bg-black/60 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex flex-col gap-3 flex-1 w-full md:mr-12">
                        <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-white/60">
                            <span>Total Progress</span>
                            <span>{Math.round(overallProgress)}%</span>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-(--main-color) shadow-[0_0_20px_var(--main-color)] transition-all duration-500"
                                style={{ width: `${overallProgress}%` }}
                            />
                        </div>
                    </div>
                    
                    <div className="flex gap-4">
                        {queue.some(op => op.status === 'completed') && (
                            <button 
                                onClick={handleExportAll}
                                className="flex items-center gap-3 px-8 py-4 bg-blue-500 hover:bg-blue-400 text-black font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] shrink-0"
                            >
                                <Save size={20} />
                                EXPORT ALL
                            </button>
                        )}
                        <button 
                            onClick={handleStartBatch}
                            disabled={isProcessing || queue.every(op => op.status === 'completed')}
                            className="flex items-center gap-3 px-8 py-4 bg-(--main-color) hover:bg-(--main-color)/80 text-black font-black uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                            {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
                            {isProcessing ? 'Processing...' : 'Start Engine'}
                        </button>
                    </div>
                </div>

            </div>

            {/* API Key Modal */}
            {showApiModal && (
                <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-[#111] border border-white/10 rounded-2xl p-8 max-w-sm w-full flex flex-col gap-6 shadow-2xl">
                        <div>
                            <h3 className="text-lg font-black text-white uppercase tracking-tight">API Key Required</h3>
                            <p className="text-xs text-white/40 mt-2 font-mono">Please enter your Gemini API Key. It will be stored securely in your local device storage.</p>
                        </div>
                        <input 
                            ref={apiInputRef}
                            type="password"
                            placeholder="AIzaSy..."
                            className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-(--main-color) transition-all"
                        />
                        <div className="flex justify-end gap-3 mt-2">
                            <button onClick={() => setShowApiModal(false)} className="px-4 py-2 text-xs font-bold text-white/60 hover:text-white uppercase tracking-wider">Cancel</button>
                            <button onClick={saveApiKey} className="px-6 py-2 bg-(--main-color) text-black text-xs font-black uppercase tracking-wider rounded-lg hover:bg-white transition-all">Save & Start</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    , document.body);
};
