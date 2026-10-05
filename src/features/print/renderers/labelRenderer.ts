import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { LABEL_STOCK_PRESETS, LABEL_TYPE_SCALE, LABEL_PALETTE } from '../design/labelDesignSystem';

export type LabelElement =
    | { type: 'text'; x: number; y: number; text: string; fontSize: number; fontWeight?: string; fontFamily?: string; align?: 'left' | 'center' | 'right' | 'justify'; maxWidth?: number; rotation?: number }
    | { type: 'qr'; x: number; y: number; size: number; data: string; }
    | { type: 'barcode'; x: number; y: number; width: number; height: number; data: string; rotation?: number }
    | { type: 'line'; x1: number; y1: number; x2: number; y2: number; thickness: number }
    | { type: 'rect'; x: number; y: number; width: number; height: number; thickness: number; fill?: boolean }
    | { type: 'image'; x: number; y: number; width: number; height: number; image: ImageBitmap | HTMLCanvasElement; rotation?: number };

export interface LabelSpec {
    presetId?: keyof typeof LABEL_STOCK_PRESETS;
    widthDots?: number;
    heightDots?: number;
    orientation: 'portrait' | 'landscape';
    elements: LabelElement[];
}

export interface MonoBitmap {
    widthBytes: number;
    height: number;
    data: Uint8Array;
}

export interface InventoryItemForLabel {
    codes: {
        bookBarcode: string;
        bookAqCode: string;
    };
    normData: {
        color: string;
        material: string;
        shape: string;
        shortDescription: string;
        weightKg: number;
        lengthCm: number;
        widthCm: number;
        heightCm: number;
    };
}

export interface ItemLabelOptions {
    tagId: string;
    qrData: string;
    axoImage?: HTMLCanvasElement | ImageBitmap;
}

export async function renderLabelToCanvas(spec: LabelSpec): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    
    const baseW = spec.widthDots || (spec.presetId ? LABEL_STOCK_PRESETS[spec.presetId].widthDots : 400);
    const baseH = spec.heightDots || (spec.presetId ? LABEL_STOCK_PRESETS[spec.presetId].heightDots : 240);
    
    let w = baseW;
    let h = baseH;
    
    if (spec.orientation === 'portrait') {
        w = baseH;
        h = baseW;
    }
    
    canvas.width = w;
    canvas.height = h;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error("Could not get 2d context");
    
    ctx.fillStyle = LABEL_PALETTE.white;
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    
    for (const el of spec.elements) {
        ctx.save();
        if (el.type === 'text') {
            const size = Math.max(el.fontSize, LABEL_TYPE_SCALE.utility.dots);
            const weightStr = el.fontWeight ? el.fontWeight + ' ' : '';
            ctx.font = `${weightStr}${size}px ${el.fontFamily || 'monospace'}`;
            ctx.fillStyle = LABEL_PALETTE.black;
            ctx.textBaseline = 'top';
            
            ctx.translate(el.x, el.y);
            if (el.rotation) {
                ctx.rotate(el.rotation * Math.PI / 180);
            }
            
            let currentScale = 1;
            if (el.maxWidth) {
                const metrics = ctx.measureText(el.text);
                if (metrics.width > el.maxWidth) {
                    currentScale = el.maxWidth / metrics.width;
                }
            }
            
            if (currentScale !== 1) {
                ctx.scale(currentScale, 1);
            }
            
            if (el.align === 'center') {
                ctx.textAlign = 'center';
            } else if (el.align === 'right') {
                ctx.textAlign = 'right';
            } else {
                // UNKNOWN: Canvas 2D doesn't natively support full justification trivially.
                // Safest default: left
                ctx.textAlign = 'left';
            }
            
            ctx.fillText(el.text, 0, 0);
            
        } else if (el.type === 'qr') {
            const qr = QRCode.create(el.data, { errorCorrectionLevel: 'H' });
            const modules = qr.modules;
            const size = modules.size;
            
            const quietZone = 4;
            const totalSize = size + quietZone * 2;
            const modulePixelSize = Math.floor(el.size / totalSize);
            const actualSize = totalSize * modulePixelSize;
            const offset = Math.floor((el.size - actualSize) / 2);
            
            ctx.fillStyle = LABEL_PALETTE.white;
            ctx.fillRect(el.x, el.y, el.size, el.size);
            
            ctx.fillStyle = LABEL_PALETTE.black;
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (modules.get(r, c)) {
                        ctx.fillRect(
                            el.x + offset + (c + quietZone) * modulePixelSize,
                            el.y + offset + (r + quietZone) * modulePixelSize,
                            modulePixelSize,
                            modulePixelSize
                        );
                    }
                }
            }
        } else if (el.type === 'barcode') {
            const tempCanvas = document.createElement('canvas');
            try {
                JsBarcode(tempCanvas, el.data || "INVALID", {
                    format: "CODE128",
                    displayValue: false,
                    margin: 0,
                    width: 2,
                    height: el.height
                });
                
                if (el.rotation) {
                    ctx.translate(el.x, el.y);
                    ctx.rotate(el.rotation * Math.PI / 180);
                    ctx.drawImage(tempCanvas, 0, 0, el.width, el.height);
                } else {
                    ctx.drawImage(tempCanvas, el.x, el.y, el.width, el.height);
                }
            } catch (e) {
                // UNKNOWN: Barcode generation failure behavior not explicitly specified.
                // Safest default is to ignore/skip drawing rather than crashing the label entirely.
                console.warn("Barcode generation failed", e);
            }
        } else if (el.type === 'line') {
            ctx.beginPath();
            ctx.moveTo(el.x1, el.y1);
            ctx.lineTo(el.x2, el.y2);
            ctx.lineWidth = el.thickness;
            ctx.strokeStyle = LABEL_PALETTE.black;
            ctx.stroke();
        } else if (el.type === 'rect') {
            if (el.fill) {
                ctx.fillStyle = LABEL_PALETTE.black;
                ctx.fillRect(el.x, el.y, el.width, el.height);
            } else {
                ctx.lineWidth = el.thickness;
                ctx.strokeStyle = LABEL_PALETTE.black;
                ctx.strokeRect(el.x, el.y, el.width, el.height);
            }
        } else if (el.type === 'image') {
            if (el.rotation) {
                ctx.translate(el.x, el.y);
                ctx.rotate(el.rotation * Math.PI / 180);
                ctx.drawImage(el.image, 0, 0, el.width, el.height);
            } else {
                ctx.drawImage(el.image, el.x, el.y, el.width, el.height);
            }
        }
        ctx.restore();
    }
    
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        
        let lum = 255;
        if (a > 0) {
            lum = 0.299 * r + 0.587 * g + 0.114 * b;
            lum = lum * (a / 255) + 255 * (1 - a / 255);
        }
        
        const val = lum < 160 ? 0 : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    
    return canvas;
}

export function canvasToMonoBitmap(canvas: HTMLCanvasElement, threshold = 160): MonoBitmap {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get 2d context");
    
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    
    const widthBytes = Math.ceil(w / 8);
    const monoData = new Uint8Array(widthBytes * h);
    
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];
            
            let lum = 255;
            if (a > 0) {
                lum = 0.299 * r + 0.587 * g + 0.114 * b;
                lum = lum * (a / 255) + 255 * (1 - a / 255);
            }
            
            if (lum < threshold) {
                const byteIdx = y * widthBytes + Math.floor(x / 8);
                const bitIdx = 7 - (x % 8);
                monoData[byteIdx] |= (1 << bitIdx);
            }
        }
    }
    
    return {
        widthBytes,
        height: h,
        data: monoData
    };
}

export async function monoBitmapToPngBlob(bitmap: MonoBitmap): Promise<Blob> {
    const w = bitmap.widthBytes * 8;
    const h = bitmap.height;
    
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("No context");
    
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const byteIdx = y * bitmap.widthBytes + Math.floor(x / 8);
            const bitIdx = 7 - (x % 8);
            const isBlack = (bitmap.data[byteIdx] & (1 << bitIdx)) !== 0;
            
            const idx = (y * w + x) * 4;
            const val = isBlack ? 0 : 255;
            data[idx] = val;
            data[idx + 1] = val;
            data[idx + 2] = val;
            data[idx + 3] = 255;
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to create blob"));
        }, 'image/png');
    });
}

export function buildItemLabelSpec(item: InventoryItemForLabel, options: ItemLabelOptions): LabelSpec {
    const elements: LabelElement[] = [];
    
    elements.push({
        type: 'text',
        // UNKNOWN: The exact rotation origin for the old template was x: -95, y: 107.2, rotation: 90
        // Safest default: position on left edge and rotate -90 to read upwards from bottom left.
        x: 16, y: 224, 
        text: "MADE IN MEXICO",
        fontSize: Math.max(15, LABEL_TYPE_SCALE.utility.dots),
        rotation: -90,
        fontFamily: "monospace",
        fontWeight: "bold"
    });
    
    const retail = `${item.codes.bookAqCode || ''}-${item.codes.bookBarcode || ''}`;
    elements.push({
        type: 'text',
        x: 200, y: 0,
        text: retail,
        fontSize: Math.max(15, LABEL_TYPE_SCALE.utility.dots),
        align: 'center',
        fontFamily: "monospace",
        fontWeight: "bold"
    });
    
    elements.push({
        type: 'text',
        x: 200, y: 22,
        text: `${item.normData.color || ''} ${item.normData.material || ''}`.trim(),
        fontSize: Math.max(23, LABEL_TYPE_SCALE.body.dots),
        align: 'center',
        fontFamily: "monospace",
        fontWeight: "bold"
    });
    
    elements.push({
        type: 'text',
        x: 200, y: 50,
        text: `${item.normData.shape || ''} ${item.normData.shortDescription || ''}`.trim(),
        fontSize: Math.max(23, LABEL_TYPE_SCALE.body.dots),
        align: 'center',
        fontFamily: "monospace"
    });
    
    const sizes = `${item.normData.widthCm || 0}*${item.normData.lengthCm || 0}*${item.normData.heightCm || 0} CM  WT ${item.normData.weightKg || 0} KG`;
    elements.push({
        type: 'text',
        x: 200, y: 80,
        text: sizes,
        fontSize: Math.max(15, LABEL_TYPE_SCALE.utility.dots),
        align: 'center',
        fontFamily: "monospace",
        fontWeight: "bold"
    });
    
    if (options.axoImage) {
        elements.push({
            type: 'image',
            x: 24, y: 12,
            width: 73, height: 73,
            image: options.axoImage
        });
    }
    
    elements.push({
        type: 'qr',
        x: 290, y: 5,
        size: 95,
        data: options.qrData
    });
    
    elements.push({
        type: 'barcode',
        x: 24, y: 102,
        width: 360, height: 110,
        data: options.tagId
    });
    
    // Explicit tag string below barcode to ensure legible crispness instead of trusting JsBarcode text scale
    elements.push({
        type: 'text',
        x: 204, y: 215,
        text: options.tagId,
        fontSize: Math.max(16, LABEL_TYPE_SCALE.utility.dots),
        align: 'center',
        fontFamily: "monospace",
        fontWeight: "bold"
    });
    
    return {
        presetId: 'Standard_50x30',
        widthDots: 400,
        heightDots: 240,
        orientation: 'landscape',
        elements
    };
}

export async function renderLabelBatch(specs: LabelSpec[]): Promise<MonoBitmap[]> {
    const bitmaps: MonoBitmap[] = [];
    for (const spec of specs) {
        const canvas = await renderLabelToCanvas(spec);
        const bitmap = canvasToMonoBitmap(canvas);
        bitmaps.push(bitmap);
    }
    return bitmaps;
}

// EXTENSION POINT: Phomemo transport and WebBluetooth queueing will be connected here later.
// The flow expects `renderLabelBatch` -> chunk the `MonoBitmap.data` per `WIDTH_BYTES` -> Phomemo Driver.
