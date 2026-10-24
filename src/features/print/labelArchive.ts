import { supabase } from '../../lib/supabase';
import { getDatabase } from '../../lib/database';
import { uploadCleanedImage } from '../../lib/bgReplace';
import {
    buildItemLabelSpec,
    renderLabelToCanvas,
    canvasToMonoBitmap,
    monoBitmapToPngBlob,
    type MonoBitmap,
} from './renderers/labelRenderer';
import { decodeBarcodeScanline, type BarcodeScanlineCheckResult } from '../../utils/PhomemoM110';

export interface ArchiveLabelOptions {
    inventoryId: string;
    tagId: string;
    labelSize?: '50x30' | '50x50';
    templateId?: string;
    logoVariant?: 'ArtOfDecor' | 'RareEarth';
    item?: any;
    user?: any;
    bitmap?: MonoBitmap;
    blob?: Blob;
    dataUrl?: string;
}

export interface LabelParityResult {
    matchedDigest: boolean;
    barcodeScanlineCheck: BarcodeScanlineCheckResult;
    rasterDigestSha256: string;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error || new Error('Failed to read blob as Data URL'));
        reader.readAsDataURL(blob);
    });
}

/**
 * Uploads exact 1-bit monochrome label PNG to Google Drive and links it in
 * inventory.processed_media_urls._label_png. uploadCleanedImage mints a new Drive
 * file id on every call, so a reprint orphans the previous PNG rather than
 * overwriting it in place.
 */
export async function archiveLabelPng(options: ArchiveLabelOptions): Promise<string | null> {
    const { inventoryId, tagId, user } = options;
    if (!inventoryId || !tagId) return null;

    const labelSize = options.labelSize || '50x30';
    const templateId = options.templateId || (labelSize === '50x50' ? 'ONYX_MASTER_TEMPLATE_50x50' : 'lbl-item-template-v4');
    const fileName = `label_${tagId}_${templateId}_${labelSize}.png`;

    try {
        let finalDataUrl = options.dataUrl;

        // Fall back to provided blob, bitmap, or re-render if dataUrl is not passed
        if (!finalDataUrl) {
            let pngBlob = options.blob;
            if (!pngBlob) {
                let bitmap = options.bitmap;
                if (!bitmap && options.item) {
                    const spec = buildItemLabelSpec(options.item, {
                        tagId,
                        qrData: `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${tagId}`,
                        labelSize,
                        logoVariant: options.logoVariant || 'ArtOfDecor',
                    });
                    const canvas = await renderLabelToCanvas(spec);
                    bitmap = canvasToMonoBitmap(canvas);
                }
                if (bitmap) {
                    pngBlob = await monoBitmapToPngBlob(bitmap);
                }
            }

            if (pngBlob) {
                finalDataUrl = await blobToDataUrl(pngBlob);
            }
        }

        if (!finalDataUrl) {
            console.warn(`[labelArchive] No raster dataUrl, bitmap, or blob available to archive for ${tagId}`);
            return null;
        }

        // Upload first (slow), THEN read+merge+write (Item 7): reading before the slow
        // Drive upload left a window where another write to this row during the upload
        // (e.g. the AI content pipeline) was silently clobbered by this function's own
        // write afterward, since it would still hold the pre-upload snapshot.
        const driveUrl = await uploadCleanedImage(finalDataUrl, fileName, user);
        if (!driveUrl) return null;

        // Data-loss guard (Item 6): re-read fresh processed_media_urls from Supabase
        // immediately before merging & writing.
        const { data: rowData, error: readErr } = await supabase
            .from('inventory')
            .select('processed_media_urls')
            .eq('id', inventoryId)
            .single();

        if (readErr) {
            console.warn(`[labelArchive] Failed to fetch fresh processed_media_urls for ${inventoryId}:`, readErr);
            return null;
        }

        let existingMap: Record<string, any> = {};
        // processed_media_urls is a text column (always string | null at the type level),
        // but this is defensive runtime handling for whatever shape is actually in it --
        // `any` so the typeof narrowing below isn't fighting a static type that can never
        // be "object".
        const rawMedia: any = rowData?.processed_media_urls;

        if (rawMedia !== undefined && rawMedia !== null && rawMedia !== '') {
            if (typeof rawMedia === 'string') {
                const trimmed = rawMedia.trim();
                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                            existingMap = { ...parsed };
                        } else {
                            console.warn(`[labelArchive] Skipping ${inventoryId}: processed_media_urls is non-object JSON; aborting archive to prevent photo data loss`);
                            return null;
                        }
                    } catch (e) {
                        console.warn(`[labelArchive] Skipping ${inventoryId}: processed_media_urls is invalid JSON; aborting archive to prevent photo data loss`, e);
                        return null;
                    }
                } else {
                    // Legacy plain comma-separated string format
                    console.warn(`[labelArchive] Skipping ${inventoryId}: processed_media_urls is legacy non-JSON string; aborting archive to prevent photo data loss`);
                    return null;
                }
            } else if (typeof rawMedia === 'object' && !Array.isArray(rawMedia)) {
                existingMap = { ...rawMedia };
            } else {
                console.warn(`[labelArchive] Skipping ${inventoryId}: processed_media_urls is unexpected format; aborting archive to prevent photo data loss`);
                return null;
            }
        }

        // Item 5: Use _label_png (leading underscore), preserve all existing keys
        existingMap._label_png = driveUrl;
        const serialized = JSON.stringify(existingMap);

        // Update Supabase
        const { error: updateErr } = await supabase.from('inventory').update({
            processed_media_urls: serialized,
            updated_at: new Date().toISOString(),
        }).eq('id', inventoryId);

        if (updateErr) {
            console.warn(`[labelArchive] Supabase update notice for ${inventoryId}:`, updateErr);
            return null;
        }

        // Update RxDB local cache mirror
        try {
            const db: any = await getDatabase();
            if (db?.inventory) {
                const doc = await db.inventory.findOne(String(inventoryId)).exec();
                if (doc) {
                    await doc.patch({ processed_media_urls: serialized });
                }
            }
        } catch {
            // fail soft
        }

        // Mutate in-memory item reference if provided
        if (options.item) {
            if (options.item.data) {
                options.item.data.processed_media_urls = serialized;
                options.item.data.processedMediaUrls = serialized;
            }
            options.item.processed_media_urls = serialized;
        }

        return driveUrl;
    } catch (err) {
        console.warn(`[labelArchive] Failed to archive label for ${tagId}:`, err);
        return null;
    }
}

/**
 * Pixel-perfect verification: validates decoded scanline against tagId and computes SHA-256.
 */
export async function verifyLabelPngParity(
    pngDataUrl: string,
    expectedTagId: string,
    expectedRasterDigest?: string
): Promise<LabelParityResult> {
    if (typeof document === 'undefined') {
        throw new Error('Verification requires DOM/Canvas environment');
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image for verification'));
        img.src = pngDataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d context for parity verification');
    ctx.drawImage(img, 0, 0);

    const bitmap = canvasToMonoBitmap(canvas, 160, img.width);
    const barcodeResult = decodeBarcodeScanline(bitmap.data, bitmap.widthBytes, bitmap.height, expectedTagId);

    let digestHex = '';
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const hashBuffer = await crypto.subtle.digest(
            'SHA-256',
            bitmap.data.buffer.slice(bitmap.data.byteOffset, bitmap.data.byteOffset + bitmap.data.byteLength) as ArrayBuffer
        );
        digestHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    return {
        matchedDigest: expectedRasterDigest ? digestHex === expectedRasterDigest : true,
        barcodeScanlineCheck: barcodeResult,
        rasterDigestSha256: digestHex,
    };
}
