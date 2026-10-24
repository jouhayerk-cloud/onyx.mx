import { supabase } from '../../lib/supabase';
import { getDatabase } from '../../lib/database';
import { uploadCleanedImage } from '../../lib/bgReplace';
import { normalizeInventoryData, calculateCodesAndPrices } from '../../lib/utils';
import {
    buildItemLabelSpec,
    renderLabelToCanvas,
    canvasToMonoBitmap,
    monoBitmapToPngBlob,
} from './renderers/labelRenderer';
import { blobToDataUrl } from './labelArchive';

export const BACKFILL_CURSOR_KEY = 'onyx_label_png_backfill_cursor';

export interface BackfillOptions {
    /** Explicit gate: must be true, otherwise execution immediately aborts. */
    confirmRun: boolean;
    /** Chunk size per batch step; default 25 per plan specification. */
    batchSize?: number;
    /** If true, clears any existing cursor from storage and starts from the beginning. */
    resetCursor?: boolean;
    /** Optional progress callback. */
    onProgress?: (progress: {
        processed: number;
        skipped: number;
        failed: number;
        total: number;
        currentTag: string;
        lastCursor: string | null;
    }) => void;
}

export interface BackfillSummary {
    totalItems: number;
    processedCount: number;
    skippedCount: number;
    failedCount: number;
    completed: boolean;
    lastCursor: string | null;
}

/**
 * Resumable, idempotent historical backfill of 1-bit monochrome label PNGs.
 * GATED: Will never execute automatically. Requires confirmRun: true.
 */
export async function runLabelPngBackfill(options: BackfillOptions): Promise<BackfillSummary> {
    if (!options || options.confirmRun !== true) {
        throw new Error('Backfill aborted: confirmRun flag must be explicitly set to true. Never auto-run.');
    }

    if (typeof window !== 'undefined' && options.resetCursor) {
        localStorage.removeItem(BACKFILL_CURSOR_KEY);
    }

    const batchSize = Math.max(1, options.batchSize || 25);
    let lastCursor: string | null = null;
    if (typeof window !== 'undefined') {
        lastCursor = localStorage.getItem(BACKFILL_CURSOR_KEY);
    }

    // 1. Source: Query distinct print_job_items with label_size from print_jobs
    const { data: rawItems, error: itemsError } = await supabase
        .from('print_job_items')
        .select('inventory_id, tag_id, print_jobs(label_size)')
        .not('inventory_id', 'is', null)
        .order('inventory_id', { ascending: true });

    if (itemsError || !rawItems) {
        throw new Error(`Failed to query print_job_items: ${itemsError?.message || 'Unknown error'}`);
    }

    // Deduplicate distinct inventory_id records
    const distinctMap = new Map<string, { inventory_id: string; tag_id: string; label_size: string }>();
    for (const row of rawItems) {
        const invId = row.inventory_id;
        if (!invId) continue;
        if (!distinctMap.has(invId)) {
            const printJob = Array.isArray(row.print_jobs) ? row.print_jobs[0] : row.print_jobs;
            const size = (printJob as any)?.label_size === '50x50' ? '50x50' : '50x30';
            distinctMap.set(invId, {
                inventory_id: invId,
                tag_id: row.tag_id || '',
                label_size: size,
            });
        }
    }

    let allTargets = Array.from(distinctMap.values());
    allTargets.sort((a, b) => a.inventory_id.localeCompare(b.inventory_id));

    // Apply cursor resumption if present
    if (lastCursor) {
        const cursorIdx = allTargets.findIndex(t => t.inventory_id === lastCursor);
        if (cursorIdx >= 0) {
            allTargets = allTargets.slice(cursorIdx + 1);
        }
    }

    let processedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const totalItems = allTargets.length;

    // Process in chunks of batchSize (25)
    for (let chunkStart = 0; chunkStart < allTargets.length; chunkStart += batchSize) {
        const chunk = allTargets.slice(chunkStart, chunkStart + batchSize);
        const chunkIds = chunk.map(c => c.inventory_id);

        // Fetch current inventory records
        const { data: invRows, error: invError } = await supabase
            .from('inventory')
            .select('*')
            .in('id', chunkIds);

        if (invError) {
            console.warn(`[backfillLabelPng] Failed to fetch inventory batch:`, invError);
            failedCount += chunk.length;
            continue;
        }

        const invMap = new Map<string, any>((invRows || []).map(r => [r.id, r]));

        for (const target of chunk) {
            const invRow = invMap.get(target.inventory_id);
            if (!invRow) {
                failedCount++;
                continue;
            }

            // 2. Idempotency & Data-loss guard (Item 5 & Item 6)
            let currentMap: Record<string, string> = {};
            const rawMedia = invRow.processed_media_urls;
            if (rawMedia !== undefined && rawMedia !== null && rawMedia !== '') {
                if (typeof rawMedia === 'string') {
                    const trimmed = rawMedia.trim();
                    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                        try {
                            const parsed = JSON.parse(trimmed);
                            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                currentMap = { ...parsed };
                            } else {
                                console.warn(`[backfillLabelPng] Skipping ${invRow.id}: non-object JSON processed_media_urls`);
                                skippedCount++;
                                lastCursor = target.inventory_id;
                                continue;
                            }
                        } catch {
                            console.warn(`[backfillLabelPng] Skipping ${invRow.id}: invalid JSON processed_media_urls`);
                            skippedCount++;
                            lastCursor = target.inventory_id;
                            continue;
                        }
                    } else {
                        console.warn(`[backfillLabelPng] Skipping ${invRow.id}: legacy non-JSON string processed_media_urls`);
                        skippedCount++;
                        lastCursor = target.inventory_id;
                        continue;
                    }
                } else if (typeof rawMedia === 'object' && !Array.isArray(rawMedia)) {
                    currentMap = { ...rawMedia };
                } else {
                    console.warn(`[backfillLabelPng] Skipping ${invRow.id}: unexpected format processed_media_urls`);
                    skippedCount++;
                    lastCursor = target.inventory_id;
                    continue;
                }
            }

            // Check if _label_png is already present (Item 5: key _label_png)
            if (currentMap._label_png) {
                skippedCount++;
                lastCursor = target.inventory_id;
                continue;
            }

            // 3. Execution: Recompute via buildItemLabelSpec -> renderLabelToCanvas -> canvasToMonoBitmap -> monoBitmapToPngBlob
            try {
                const normData = normalizeInventoryData(invRow);
                const codes = calculateCodesAndPrices(normData, 17, String(normData.workbook || '326'));
                const tagId = target.tag_id || codes.bookBarcode || invRow.item_id || '000';
                const labelSize = target.label_size === '50x50' ? '50x50' : '50x30';
                const templateId = labelSize === '50x50' ? 'ONYX_MASTER_TEMPLATE_50x50' : 'lbl-item-template-v4';

                const spec = buildItemLabelSpec({ codes, normData }, {
                    tagId,
                    qrData: `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${tagId}`,
                    labelSize,
                });

                const canvas = await renderLabelToCanvas(spec);
                const bitmap = canvasToMonoBitmap(canvas);
                const blob = await monoBitmapToPngBlob(bitmap);
                const dataUrl = await blobToDataUrl(blob);

                const fileName = `label_${tagId}_${templateId}_${labelSize}.png`;
                const driveUrl = await uploadCleanedImage(dataUrl, fileName);

                if (!driveUrl) {
                    throw new Error('Drive upload did not return a valid URL');
                }

                currentMap._label_png = driveUrl;
                const serialized = JSON.stringify(currentMap);

                // Check Supabase update error and retry if failed (Item 10)
                let updateErr: any = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                    const { error } = await supabase.from('inventory').update({
                        processed_media_urls: serialized,
                        updated_at: new Date().toISOString(),
                    }).eq('id', invRow.id);
                    updateErr = error;
                    if (!updateErr) break;
                }

                if (updateErr) {
                    console.warn(`[backfillLabelPng] Supabase update failed for ${invRow.id}:`, updateErr);
                    failedCount++;
                    // Do NOT advance cursor or count as processed on failure
                    continue;
                }

                try {
                    const db: any = await getDatabase();
                    if (db?.inventory) {
                        const existing = await db.inventory.findOne(String(invRow.id)).exec();
                        if (existing) {
                            await existing.patch({ processed_media_urls: serialized });
                        }
                    }
                } catch {
                    // fail soft
                }

                processedCount++;
                lastCursor = target.inventory_id;

                if (options.onProgress) {
                    options.onProgress({
                        processed: processedCount,
                        skipped: skippedCount,
                        failed: failedCount,
                        total: totalItems,
                        currentTag: tagId,
                        lastCursor,
                    });
                }
            } catch (itemErr) {
                console.warn(`[backfillLabelPng] Error on item ${target.inventory_id} (${target.tag_id}):`, itemErr);
                failedCount++;
            }
        }

        // 4. Resumability: Save cursor after each batch of 25
        if (typeof window !== 'undefined' && lastCursor) {
            localStorage.setItem(BACKFILL_CURSOR_KEY, lastCursor);
        }
    }

    return {
        totalItems,
        processedCount,
        skippedCount,
        failedCount,
        completed: processedCount + skippedCount + failedCount >= totalItems,
        lastCursor,
    };
}
