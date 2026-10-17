import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { LABEL_STOCK_PRESETS, LABEL_TYPE_SCALE, LABEL_PALETTE } from '../design/labelDesignSystem';
import { decodeRasterToDataUrl } from '../../../utils/PhomemoM110';

export const labelRasterCache = new Map<string, string>();
const labelImageCache = new Map<string, HTMLImageElement>();
export function loadLabelImage(src: string): Promise<HTMLImageElement> {
    if (labelImageCache.has(src)) {
        return Promise.resolve(labelImageCache.get(src)!);
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            labelImageCache.set(src, img);
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
    });
}

export type LabelElement =
    | { type: 'text'; x: number; y: number; text: string; fontSize: number; fontWeight?: string; fontFamily?: string; align?: 'left' | 'center' | 'right' | 'justify'; maxWidth?: number; rotation?: number }
    | { type: 'qr'; x: number; y: number; size: number; data: string; }
    | { type: 'barcode'; x: number; y: number; width: number; height: number; data: string; rotation?: number }
    | { type: 'line'; x1: number; y1: number; x2: number; y2: number; thickness: number }
    | { type: 'rect'; x: number; y: number; width: number; height: number; thickness: number; fill?: boolean }
    | { type: 'image'; x: number; y: number; width: number; height: number; image: ImageBitmap | HTMLCanvasElement | HTMLImageElement; rotation?: number };

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
        bookRetail?: number | string;
    };
    normData: {
        color: string;
        material: string;
        shape: string;
        shortDescription: string;
        itemType?: string;
        type?: string;
        description?: string;
        workbook?: string;
        weightKg: number;
        lengthCm: number;
        widthCm: number;
        heightCm: number;
        variant?: string;
    };
}

export interface ItemLabelOptions {
    tagId: string;
    qrData: string;
    axoImage?: HTMLCanvasElement | ImageBitmap | HTMLImageElement;
    labelSize?: '50x30' | '50x50';
    logoVariant?: 'ArtOfDecor' | 'RareEarth';
    logoImage?: HTMLCanvasElement | ImageBitmap | HTMLImageElement;
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
            const data = (el.data || "INVALID").trim();
            const boxWidth = Math.round(el.width);
            const boxHeight = Math.round(el.height);

            let symbolModules = 0;
            try {
                const measureCanvas = document.createElement('canvas');
                JsBarcode(measureCanvas, data, {
                    format: "CODE128",
                    displayValue: false,
                    margin: 0,
                    width: 1,
                    height: 10
                });
                symbolModules = measureCanvas.width;
            } catch (e) {
                console.warn("Barcode measure failed", e);
                symbolModules = 0;
            }

            if (symbolModules > 0) {
                const quietZoneModules = 10;
                const totalModules = symbolModules + (quietZoneModules * 2);

                // Choose integer module width: 3 dots if it fits, else 2 dots
                let moduleWidth = 2;
                if (totalModules * 3 <= boxWidth) {
                    moduleWidth = 3;
                } else if (totalModules * 2 <= boxWidth) {
                    moduleWidth = 2;
                } else {
                    moduleWidth = 2;
                    console.warn(`[labelRenderer] Barcode "${data}" (${totalModules * 2} dots at 2 dots/mod) exceeds box width (${boxWidth} dots). Squeezing disabled.`);
                }

                const quietZoneDots = quietZoneModules * moduleWidth;
                const totalBarcodeWidth = totalModules * moduleWidth;
                const barHeight = boxHeight;

                const barcodeCanvas = document.createElement('canvas');
                barcodeCanvas.width = totalBarcodeWidth;
                barcodeCanvas.height = barHeight;
                const bCtx = barcodeCanvas.getContext('2d');
                if (bCtx) {
                    bCtx.imageSmoothingEnabled = false;
                    bCtx.fillStyle = '#ffffff';
                    bCtx.fillRect(0, 0, totalBarcodeWidth, barHeight);
                }

                try {
                    JsBarcode(barcodeCanvas, data, {
                        format: "CODE128",
                        width: moduleWidth,
                        height: barHeight,
                        displayValue: false,
                        margin: 0,
                        marginLeft: quietZoneDots,
                        marginRight: quietZoneDots,
                        marginTop: 0,
                        marginBottom: 0,
                        background: '#ffffff',
                        lineColor: '#000000',
                    });

                    // Center barcode horizontally by whole dots within the element box
                    const offsetX = Math.floor((boxWidth - totalBarcodeWidth) / 2);

                    ctx.imageSmoothingEnabled = false;
                    if (el.rotation) {
                        ctx.translate(el.x, el.y);
                        ctx.rotate(el.rotation * Math.PI / 180);
                        ctx.drawImage(barcodeCanvas, offsetX, 0);
                    } else {
                        ctx.drawImage(barcodeCanvas, el.x + offsetX, el.y);
                    }
                } catch (e) {
                    console.warn("Barcode generation failed", e);
                }
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

export function canvasToMonoBitmap(canvas: HTMLCanvasElement, threshold = 160, targetWidthDots = 384): MonoBitmap {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get 2d context");
    
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    
    const outputWidthDots = targetWidthDots || 384;
    const widthBytes = Math.ceil(outputWidthDots / 8);
    const monoData = new Uint8Array(widthBytes * h);

    let srcStartX = 0;
    let dstStartX = 0;
    const copyWidth = Math.min(w, outputWidthDots);

    if (w > outputWidthDots) {
        // Center crop if canvas exceeds printable head width (e.g. 400 dots -> 384 dots, 8 dots margin)
        srcStartX = Math.floor((w - outputWidthDots) / 2);
    } else if (w < outputWidthDots) {
        // Center within printable head if canvas is narrower
        dstStartX = Math.floor((outputWidthDots - w) / 2);
    }
    
    for (let y = 0; y < h; y++) {
        const rowOffset = y * w;
        const outRowOffset = y * widthBytes;
        for (let i = 0; i < copyWidth; i++) {
            const srcX = srcStartX + i;
            const dstX = dstStartX + i;
            const idx = (rowOffset + srcX) * 4;
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
                const byteIdx = outRowOffset + Math.floor(dstX / 8);
                const bitIdx = 7 - (dstX % 8);
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
    const isSquare = options.labelSize === '50x50';
    const norm = item.normData as any;
    const codes = item.codes as any;
    const bookv = String(norm.workbook || '326').replace(/v/gi, '');
    const retailStr = String(codes.bookRetail || '0').padStart(4, '0');
    const retail = `${codes.bookAqCode || ''}-${bookv}${retailStr}`;
    const desc = `${norm.shape || ''} ${norm.itemType || norm.type || norm.shortDescription || norm.description || ''}`.trim() || 'Onyx Piece';
    const matColor = `${norm.color || ''} ${norm.material || 'Onyx'}`.trim();
    const lengthVal = norm.lengthCm ?? norm.widthCm ?? 0;
    const sizes = `${norm.widthCm || 0}*${lengthVal}*${norm.heightCm || 0} CM${norm.weightKg ? `  WT ${norm.weightKg} KG` : ''}`;

    if (isSquare) {
        // 50x50 mm square layout (384x384 dots for M110 printhead)
        elements.push({
            type: 'qr',
            x: 16,
            y: 12,
            size: 96,
            data: options.qrData
        });

        elements.push({
            type: 'text',
            x: 124,
            y: 12,
            text: desc,
            fontSize: Math.max(20, LABEL_TYPE_SCALE.body.dots),
            maxWidth: 244,
            align: 'left',
            fontFamily: "Inter, sans-serif",
            fontWeight: "bold"
        });

        elements.push({
            type: 'text',
            x: 124,
            y: 44,
            text: matColor,
            fontSize: Math.max(18, LABEL_TYPE_SCALE.body.dots),
            maxWidth: 244,
            align: 'left',
            fontFamily: "Inter, sans-serif"
        });

        elements.push({
            type: 'text',
            x: 124,
            y: 74,
            text: sizes,
            fontSize: Math.max(14, LABEL_TYPE_SCALE.utility.dots),
            maxWidth: 244,
            align: 'left',
            fontFamily: "Inter, sans-serif",
            fontWeight: "bold"
        });

        elements.push({
            type: 'text',
            x: 16,
            y: 124,
            text: retail,
            fontSize: Math.max(18, LABEL_TYPE_SCALE.body.dots),
            align: 'left',
            fontFamily: "Inter, sans-serif",
            fontWeight: "bold"
        });

        elements.push({
            type: 'text',
            x: 16,
            y: 158,
            text: "Made in Mexico For",
            fontSize: Math.max(14, LABEL_TYPE_SCALE.utility.dots),
            align: 'left',
            fontFamily: "Inter, sans-serif"
        });

        if (options.logoImage) {
            elements.push({
                type: 'image',
                x: 16,
                y: 182,
                width: 174,
                height: 38,
                image: options.logoImage
            });
        } else {
            elements.push({
                type: 'text',
                x: 16,
                y: 182,
                text: options.logoVariant === 'RareEarth' ? 'RARE EARTH GALLERY' : 'ART OF DECOR',
                fontSize: Math.max(16, LABEL_TYPE_SCALE.utility.dots),
                align: 'left',
                fontFamily: "Inter, sans-serif",
                fontWeight: "bold"
            });
        }

        if (options.axoImage) {
            elements.push({
                type: 'image',
                x: 236,
                y: 92,
                width: 136,
                height: 136,
                image: options.axoImage
            });
        }

        elements.push({
            type: 'barcode',
            x: 16,
            y: 232,
            width: 352,
            height: 104,
            data: options.tagId
        });

        elements.push({
            type: 'text',
            x: 192,
            y: 346,
            text: options.tagId,
            fontSize: Math.max(16, LABEL_TYPE_SCALE.utility.dots),
            align: 'center',
            fontFamily: "Inter, sans-serif",
            fontWeight: "bold"
        });

        return {
            presetId: 'Standard_50x50',
            widthDots: 384,
            heightDots: 384,
            orientation: 'portrait',
            elements
        };
    }

    // Default 50x30 mm landscape layout (384x240 dots for M110 printhead)
    elements.push({
        type: 'text',
        x: 8,
        y: 110,
        text: "MADE IN MEXICO",
        fontSize: Math.max(13, LABEL_TYPE_SCALE.utility.dots),
        rotation: -90,
        fontFamily: "Inter, sans-serif",
        fontWeight: "bold"
    });

    elements.push({
        type: 'text',
        x: 192,
        y: 2,
        text: retail,
        fontSize: Math.max(15, LABEL_TYPE_SCALE.utility.dots),
        maxWidth: 200,
        align: 'center',
        fontFamily: "Inter, sans-serif",
        fontWeight: "bold"
    });

    elements.push({
        type: 'text',
        x: 192,
        y: 24,
        text: desc,
        fontSize: Math.max(21, LABEL_TYPE_SCALE.body.dots),
        maxWidth: 200,
        align: 'center',
        fontFamily: "Inter, sans-serif",
        fontWeight: "bold"
    });

    elements.push({
        type: 'text',
        x: 192,
        y: 50,
        text: matColor,
        fontSize: Math.max(21, LABEL_TYPE_SCALE.body.dots),
        maxWidth: 200,
        align: 'center',
        fontFamily: "Inter, sans-serif"
    });

    elements.push({
        type: 'text',
        x: 192,
        y: 78,
        text: sizes,
        fontSize: Math.max(14, LABEL_TYPE_SCALE.utility.dots),
        maxWidth: 200,
        align: 'center',
        fontFamily: "Inter, sans-serif",
        fontWeight: "bold"
    });

    if (options.axoImage) {
        elements.push({
            type: 'image',
            x: 24,
            y: 10,
            width: 70,
            height: 70,
            image: options.axoImage
        });
    }

    elements.push({
        type: 'qr',
        x: 280,
        y: 6,
        size: 90,
        data: options.qrData
    });

    elements.push({
        type: 'barcode',
        x: 20,
        y: 100,
        width: 344,
        height: 100,
        data: options.tagId
    });

    elements.push({
        type: 'text',
        x: 192,
        y: 206,
        text: options.tagId,
        fontSize: Math.max(15, LABEL_TYPE_SCALE.utility.dots),
        align: 'center',
        fontFamily: "Inter, sans-serif",
        fontWeight: "bold"
    });

    return {
        presetId: 'M110_48x28',
        widthDots: 384,
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

export async function renderLabelToRasterDataUrl(spec: LabelSpec): Promise<string> {
    const canvas = await renderLabelToCanvas(spec);
    const bitmap = canvasToMonoBitmap(canvas);
    return decodeRasterToDataUrl(bitmap.data, bitmap.widthBytes, bitmap.height);
}

export async function renderItemLabelToRaster(
    item: any,
    options: {
        tagId?: string;
        qrData?: string;
        labelSize?: '50x30' | '50x50';
        logoVariant?: 'ArtOfDecor' | 'RareEarth';
        axoImage?: HTMLCanvasElement | ImageBitmap | HTMLImageElement;
        logoImage?: HTMLCanvasElement | ImageBitmap | HTMLImageElement;
        axoSvg?: string;
    } = {}
): Promise<string> {
    const tagId = options.tagId || item?.codes?.bookBarcode || '000';
    const qrData = options.qrData || `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${tagId}`;
    const labelSize = options.labelSize || '50x30';
    const logoVariant = options.logoVariant || 'ArtOfDecor';

    const cacheKey = `${tagId}_${labelSize}_${logoVariant}_${options.axoSvg ? 'axo' : 'noaxo'}`;
    if (labelRasterCache.has(cacheKey)) {
        return labelRasterCache.get(cacheKey)!;
    }
    if (labelRasterCache.has(tagId)) {
        return labelRasterCache.get(tagId)!;
    }

    let axoImage = options.axoImage;
    if (!axoImage && options.axoSvg) {
        try {
            axoImage = await loadLabelImage(options.axoSvg);
        } catch {
            // axo load failed, continue without image
        }
    }

    let logoImage = options.logoImage;
    if (!logoImage && labelSize === '50x50') {
        const logoSrc = logoVariant === 'RareEarth' 
            ? `${import.meta.env.BASE_URL}REG_LogoGrayscale.png` 
            : `${import.meta.env.BASE_URL}ArtOfDecorLogo.png`;
        try {
            logoImage = await loadLabelImage(logoSrc);
        } catch {
            // logo load failed, fallback to text logo in spec
        }
    }

    const spec = buildItemLabelSpec(item, {
        tagId,
        qrData,
        labelSize,
        logoVariant,
        axoImage,
        logoImage
    });

    return renderLabelToRasterDataUrl(spec);
}

// EXTENSION POINT: Phomemo transport and WebBluetooth queueing will be connected here later.
// The flow expects `renderLabelBatch` -> chunk the `MonoBitmap.data` per `WIDTH_BYTES` -> Phomemo Driver.
