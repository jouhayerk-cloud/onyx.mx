import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { ArrowLeft, Copy, Eraser, PenTool, RotateCcw, Save, Undo2 } from 'lucide-react';
import { activeViewAtom, imageCanvasItemIdsAtom, imageCanvasTargetAtom, inventoryAtom, userAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { extractFileId, fetchImageBatch, getCleanImageUrl, normalizeInventoryData } from '../../lib/utils';
import { mediaOf } from '../../lib/ai/run';
import { toPipelineItem } from '../../lib/ai/item';
import { resolve826TypeId } from '../../lib/taxonomy/onyx826';
import { iopaintHealth, IOPAINT_START_CMD } from '../../lib/ai/providers/iopaintService';
import {
    cleanedPhotoState,
    loadPhotoDataUrl,
    maskOutlineState,
    rollbackCleanedPhotoInDb,
    rollbackMaskSvgInDb,
    saveCleanedPhotoToDb,
    saveMaskSvgToDb,
} from './imageCanvasPersist';
import { CleanupBrushStage } from './CleanupBrushStage';
import { MaskVectorStage } from './MaskVectorStage';
import { ItemTag, Key, Segmented, StatusPill, Thumb } from '../../components/ui';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { tr } from '../../lib/i18n';

const PASS_HISTORY = 10;

function decodeBase64Utf8(base64: string): string {
    const clean = base64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    const binary = atob(clean);
    try {
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
    } catch {
        return binary;
    }
}

/**
 * Load the stored SVG outline text: try `fetch` on `getCleanImageUrl(url)` first,
 * and fall back to `fetchImageBatch` for Drive file IDs just like photo loading.
 */
async function loadOutlineSvgText(url: string): Promise<string> {
    const trimmed = url.trim();
    if (trimmed.startsWith('<')) return trimmed;
    if (trimmed.startsWith('data:')) {
        const comma = trimmed.indexOf(',');
        if (comma >= 0) {
            const meta = trimmed.slice(0, comma);
            const payload = trimmed.slice(comma + 1);
            return /;base64/i.test(meta) ? decodeBase64Utf8(payload) : decodeURIComponent(payload);
        }
    }

    const cleanUrl = getCleanImageUrl(trimmed) || trimmed;
    try {
        const res = await fetch(cleanUrl);
        if (res.ok) {
            const text = await res.text();
            if (text.includes('<svg') || text.includes('<path')) return text;
        }
    } catch {
        // Fall back to Drive batch loader below when direct fetch fails or is blocked by CORS.
    }

    const fileId = extractFileId(trimmed);
    if (fileId) {
        const d = await fetchImageBatch(fileId);
        const text = decodeBase64Utf8(d.base64);
        if (text.includes('<svg') || text.includes('<path')) return text;
    }

    throw new Error(tr('The outline SVG could not be loaded'));
}

/**
 * ImageCanvas (Developer and Admin): the cleanup brush and mask vector editor on one still photo of an inventory row.
 * Opened from the inventory selection dock (all selected items) or the catalog's Edit in ImageCanvas keys.
 */
export function ImageCanvasView() {
    const [target, setTarget] = useAtom(imageCanvasTargetAtom);
    const inventory = useAtomValue(inventoryAtom);
    const itemIds = useAtomValue(imageCanvasItemIdsAtom);
    const setActiveView = useSetAtom(activeViewAtom);
    const user = useAtomValue(userAtom);
    const itemId = target?.itemId ?? '';
    const requestedAngle = target?.angleIndex ?? 0;

    const [tool, setTool] = useState<'brush' | 'vector'>('brush');
    const [row, setRow] = useState<Record<string, any> | null>(null);
    const [source, setSource] = useState<'cleaned' | 'original'>('cleaned');
    const [pass, setPass] = useState<string | null>(null);
    const [passHistory, setPassHistory] = useState<string[]>([]);
    const [svgText, setSvgText] = useState<string | null>(null);
    const [svgLoading, setSvgLoading] = useState(false);
    const [service, setService] = useState<'checking' | 'online' | 'offline'>('checking');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    // The clean that the last save just wrote: the photo reload it causes must not start the passes over.
    const savedUrl = useRef<string | null>(null);
    // The item on screen now, read by save and restore results that land after the item may have changed.
    const liveItemId = useRef(itemId);
    liveItemId.current = itemId;

    const checkService = (force = false) => {
        setService('checking');
        iopaintHealth(force).then(h => setService(h ? 'online' : 'offline'));
    };

    useEffect(() => { checkService(); }, []);

    // The raw row, fresh: the clean map, spatial_masks and rollback state are read from it, never from a cached copy.
    useEffect(() => {
        setRow(null);
        setError(null);
        setMessage(null);
        if (!itemId) return;
        let alive = true;
        supabase.from('inventory').select('*').eq('id', itemId).single().then(({ data, error: err }) => {
            if (!alive) return;
            if (err || !data) setError(err?.message || tr('Item not found'));
            else setRow(data as Record<string, any>);
        });
        return () => { alive = false; };
    }, [itemId]);

    const stills = useMemo(() => (row ? mediaOf(normalizeInventoryData(row)).filter(m => !m.isVideo) : []), [row]);
    const angleIndex = Math.min(requestedAngle, Math.max(0, stills.length - 1));
    const sourceUrl = stills[angleIndex]?.url ?? null;
    const clean = row && sourceUrl ? cleanedPhotoState(row, sourceUrl) : {};
    const mask = useMemo(() => (row ? maskOutlineState(row, angleIndex) : { hasPrevOutline: false }), [row, angleIndex]);
    const showCleaned = source === 'cleaned' && !!clean.cleanedUrl;
    const loadUrl = showCleaned ? clean.cleanedUrl! : sourceUrl;

    const isMirror = useMemo(() => {
        if (!row) return false;
        const item = toPipelineItem(row);
        return resolve826TypeId(item.type, item.shape) === 'mirror' || /mirror|espejo/i.test(`${item.type || ''} ${item.shape || ''}`);
    }, [row]);

    // The working image: loaded whenever the photo or the source changes. Passes start over with it.
    useEffect(() => {
        const kept = loadUrl !== null && loadUrl === savedUrl.current;
        savedUrl.current = null;
        if (kept) return;
        setPass(null);
        setPassHistory([]);
        if (!loadUrl) return;
        let alive = true;
        loadPhotoDataUrl(loadUrl)
            .then(d => { if (alive) setPass(d); })
            .catch(e => { if (alive) setError((e as Error)?.message || tr('The photo could not be loaded')); });
        return () => { alive = false; };
    }, [loadUrl]);

    // Load the stored outline SVG whenever the angle's stored svgUrl or pathD changes.
    useEffect(() => {
        setSvgText(null);
        if (!mask.svgUrl && !mask.pathD) {
            setSvgLoading(false);
            return;
        }
        if (!mask.svgUrl && mask.pathD) {
            setSvgText(mask.pathD);
            setSvgLoading(false);
            return;
        }
        let alive = true;
        setSvgLoading(true);
        loadOutlineSvgText(mask.svgUrl!)
            .then(txt => {
                if (alive) setSvgText(txt);
            })
            .catch(e => {
                if (!alive) return;
                if (mask.pathD) setSvgText(mask.pathD);
                else setError((e as Error)?.message || tr('The outline SVG could not be loaded'));
            })
            .finally(() => {
                if (alive) setSvgLoading(false);
            });
        return () => { alive = false; };
    }, [mask.svgUrl, mask.pathD]);

    // The items sent from the inventory selection dock, in selection order.
    const queue = useMemo(() => {
        const byId = new Map(inventory.map(i => [String(i.data.id || i.row), i]));
        return itemIds.map(id => byId.get(id)).filter(Boolean);
    }, [itemIds, inventory]);

    const pickItem = (id: string) => setTarget({ itemId: id, angleIndex: 0 });

    const onPassComplete = (url: string) => {
        if (pass) setPassHistory(h => [...h, pass].slice(-PASS_HISTORY));
        setPass(url);
    };

    const undoPass = () => {
        const last = passHistory[passHistory.length - 1];
        if (!last) return;
        setPassHistory(h => h.slice(0, -1));
        setPass(last);
    };

    const save = async () => {
        if (!row || !sourceUrl || !pass) return;
        const id = String(row.id);
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const { savedRow, uploadedUrl } = await saveCleanedPhotoToDb({ row, angleIndex, sourceUrl, dataUrl: pass, user });
            if (liveItemId.current !== id) return;
            savedUrl.current = uploadedUrl;
            setSource('cleaned');
            setRow(savedRow as Record<string, any>);
            setMessage(tr('Saved to Drive and to the inventory row.'));
        } catch (e) {
            if (liveItemId.current === id) setError((e as Error)?.message || tr('Save failed'));
        } finally {
            setSaving(false);
        }
    };

    const restorePrevious = async () => {
        if (!row || !sourceUrl) return;
        const id = String(row.id);
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const saved = await rollbackCleanedPhotoInDb(row, sourceUrl, user);
            if (liveItemId.current !== id) return;
            setRow(saved as Record<string, any>);
            setSource('cleaned');
            setMessage(tr('Restored the previous clean version.'));
        } catch (e) {
            if (liveItemId.current === id) setError((e as Error)?.message || tr('Restore failed'));
        } finally {
            setSaving(false);
        }
    };

    const saveOutline = async ({
        pathD,
        fillRule,
        width,
        height,
    }: {
        pathD: string;
        fillRule: 'nonzero' | 'evenodd';
        width: number;
        height: number;
    }) => {
        if (!row || !sourceUrl) return;
        const id = String(row.id);
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const { savedRow } = await saveMaskSvgToDb({
                row,
                angleIndex,
                sourceUrl,
                pathD,
                fillRule,
                width,
                height,
                cutoutUrl: mask.cutoutUrl,
                photoUrl: pass,
                user,
            });
            if (liveItemId.current !== id) return;
            setRow(savedRow as Record<string, any>);
            setMessage(tr('Saved the outline, cutout and matte to Drive and to the inventory row.'));
        } catch (e) {
            if (liveItemId.current === id) setError((e as Error)?.message || tr('Save failed'));
        } finally {
            setSaving(false);
        }
    };

    const restorePreviousOutline = async () => {
        if (!row) return;
        const id = String(row.id);
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const saved = await rollbackMaskSvgInDb(row, angleIndex, user);
            if (liveItemId.current !== id) return;
            setRow(saved as Record<string, any>);
            setMessage(tr('Restored the previous outline version.'));
        } catch (e) {
            if (liveItemId.current === id) setError((e as Error)?.message || tr('Restore failed'));
        } finally {
            setSaving(false);
        }
    };

    const serviceState = service === 'online'
        ? { state: 'done' as const, label: tr('IOPaint online') }
        : service === 'offline'
            ? { state: 'failed' as const, label: tr('IOPaint offline') }
            : { state: 'queued' as const, label: tr('Checking IOPaint') };

    const hasOutline = Boolean(mask.svgUrl || mask.pathD);

    return (
        <div className="ui-root flex h-full min-h-0 flex-col gap-3 p-3">
            <div className="liquid-surface flex flex-wrap items-center gap-2 rounded-md p-2">
                {/* Disabled while a save or restore is in flight: its result belongs to the item on screen now. */}
                <fieldset disabled={saving} className="contents">
                    <Key size="sm" variant="quiet" icon={<ArrowLeft size={14} />} onClick={() => setActiveView('inventory')}>{tr('Back')}</Key>
                    {queue.length > 1 && queue.map(m => {
                        const id = String(m.data.id || m.row);
                        return (
                            <Key key={id} size="sm" variant={id === itemId ? 'go' : 'quiet'} onClick={() => pickItem(id)}>
                                {m.data.book_barcode || m.label || id}
                            </Key>
                        );
                    })}
                    {row && <ItemTag item={row} />}
                    {stills.map((m, i) => (
                        <Thumb
                            key={m.url}
                            src={m.url}
                            kind="photo"
                            size="md"
                            current={i === angleIndex}
                            title={`${tr('Photo')} ${i + 1}`}
                            onClick={() => setTarget({ itemId, angleIndex: i })} />
                    ))}
                </fieldset>
                <span className="flex-1" />
                <StatusPill state={serviceState.state} label={serviceState.label} />
            </div>

            <div className="liquid-surface flex flex-wrap items-center gap-2 rounded-md p-2">
                <Segmented
                    size="sm"
                    label={tr('Tool')}
                    value={tool}
                    disabled={saving}
                    onChange={v => setTool(v as "vector" | "brush")}
                    options={[
                        { value: 'brush', label: tr('Cleanup Brush'), icon: <Eraser size={14} /> },
                        { value: 'vector', label: tr('Mask Vector'), icon: <PenTool size={14} /> },
                    ]} />
                <Segmented
                    size="sm"
                    label={tr('Source')}
                    value={showCleaned ? 'cleaned' : 'original'}
                    disabled={saving}
                    onChange={(v) => setSource(v)}
                    options={[
                        { value: 'cleaned', label: tr('Cleaned'), disabled: !clean.cleanedUrl },
                        { value: 'original', label: tr('Original') },
                    ]} />
                {tool === 'brush' && (
                    <>
                        <span className="flex-1" />
                        <Key size="sm" icon={<Undo2 size={14} />} disabled={!passHistory.length || saving} onClick={undoPass}>{tr('Undo pass')}</Key>
                        <Key size="sm" icon={<RotateCcw size={14} />} disabled={!clean.prevUrl || saving} onClick={restorePrevious}>{tr('Restore previous clean')}</Key>
                        <Key variant="go" size="sm" icon={<Save size={14} />} disabled={!pass || !row || !sourceUrl || saving} busy={saving} onClick={save}>{tr('Save to Drive')}</Key>
                    </>
                )}
            </div>

            {tool === 'brush' && service === 'offline' && (
                <div className="liquid-panel flex flex-wrap items-center gap-2 rounded-md p-3">
                    <p className="text-sm">{tr('IOPaint is not running on this PC. Start it, then retry.')}</p>
                    <code className="break-all text-[12px]">{IOPAINT_START_CMD}</code>
                    <Key size="sm" icon={<Copy size={13} />} onClick={() => { navigator.clipboard?.writeText(IOPAINT_START_CMD).catch(() => undefined); }}>{tr('Copy command')}</Key>
                    <Key size="sm" onClick={() => checkService(true)}>{tr('Retry')}</Key>
                </div>
            )}

            {message && <p className="text-sm">{message}</p>}
            {error && <p role="alert" className="text-sm">{error}</p>}

            <div className="flex min-h-0 flex-1 flex-col">
                {!itemId ? (
                    <p className="text-sm">{tr('Select items in Inventory, then choose Image Canvas in the selection actions.')}</p>
                ) : row && !sourceUrl ? (
                    <p className="text-sm">{tr('This item has no photo.')}</p>
                ) : tool === 'vector' ? (
                    row && !hasOutline ? (
                        <div className="liquid-panel rounded-md p-3">
                            <p className="text-sm">{tr('This photo has no stored outline yet. Run Vector Cutout in the Catalog Hub first.')}</p>
                        </div>
                    ) : pass && svgText && !svgLoading ? (
                        <MaskVectorStage
                            baseImageUrl={pass}
                            svgTextOrD={svgText}
                            fallbackWidth={mask.width}
                            fallbackHeight={mask.height}
                            fallbackFillRule={mask.fillRule}
                            cutoutUrl={mask.cutoutUrl}
                            matteUrl={mask.matteUrl}
                            isMirror={isMirror}
                            hasPreviousOutline={mask.hasPrevOutline}
                            saving={saving}
                            onSave={saveOutline}
                            onRestorePrevious={restorePreviousOutline} />
                    ) : !error ? (
                        <div className="flex flex-1 items-center justify-center"><LoadingIndicator /></div>
                    ) : null
                ) : pass ? (
                    <CleanupBrushStage
                        baseImageUrl={pass}
                        serviceOnline={service === 'online'}
                        onPassComplete={onPassComplete}
                        onError={setError}
                        onOffline={() => setService('offline')} />
                ) : !error ? (
                    <div className="flex flex-1 items-center justify-center"><LoadingIndicator /></div>
                ) : null}
            </div>
        </div>
    );
}
