import React, { useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { Copy, Eraser, Save, Undo2, RotateCcw } from 'lucide-react';
import { imageCanvasTargetAtom, inventoryAtom, userAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { extractFileId, fetchImageBatch, imageCache, normalizeInventoryData } from '../../lib/utils';
import { mediaOf } from '../../lib/ai/run';
import { blobToDataUrl, iopaintHealth, IOPAINT_START_CMD } from '../../lib/ai/providers/iopaintService';
import { cleanedPhotoState, rollbackCleanedPhotoInDb, saveCleanedPhotoToDb } from './imageCanvasPersist';
import { CleanupBrushStage } from './CleanupBrushStage';
import { Input, ItemTag, Key, Segmented, StatusPill, Thumb } from '../../components/ui';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { tr } from '../../lib/i18n';

const PASS_HISTORY = 10;

/** The photo as a data: URL. Drive files go through the app's batch loader, so the canvas is never tainted. */
async function loadPhotoDataUrl(url: string): Promise<string> {
    const fileId = extractFileId(url);
    if (fileId) {
        const cached = imageCache.get(fileId);
        if (cached) return cached;
        const d = await fetchImageBatch(fileId);
        const dataUrl = `data:${d.mimeType};base64,${d.base64}`;
        imageCache.set(fileId, dataUrl);
        return dataUrl;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${tr('The photo could not be loaded')} (${res.status})`);
    return blobToDataUrl(await res.blob());
}

/**
 * ImageCanvas (Developer and Admin): the cleanup brush on one still photo of an inventory row. Opened from the
 * catalog's Edit in ImageCanvas keys, or from the search box here.
 */
export function ImageCanvasView() {
    const [target, setTarget] = useAtom(imageCanvasTargetAtom);
    const inventory = useAtomValue(inventoryAtom);
    const user = useAtomValue(userAtom);
    const itemId = target?.itemId ?? '';
    const angleIndex = target?.angleIndex ?? 0;

    const [query, setQuery] = useState('');
    const [row, setRow] = useState<Record<string, any> | null>(null);
    const [source, setSource] = useState<'cleaned' | 'original'>('cleaned');
    const [pass, setPass] = useState<string | null>(null);
    const [passHistory, setPassHistory] = useState<string[]>([]);
    const [service, setService] = useState<'checking' | 'online' | 'offline'>('checking');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const checkService = (force = false) => {
        setService('checking');
        iopaintHealth(force).then(h => setService(h ? 'online' : 'offline'));
    };

    useEffect(() => { checkService(); }, []);

    // The raw row, fresh: the clean map and the rollback key are read from it, never from a cached copy.
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
    const sourceUrl = stills[angleIndex]?.url ?? null;
    const clean = row && sourceUrl ? cleanedPhotoState(row, sourceUrl) : {};
    const showCleaned = source === 'cleaned' && !!clean.cleanedUrl;
    const loadUrl = showCleaned ? clean.cleanedUrl! : sourceUrl;

    // The working image: loaded whenever the photo or the source changes. Passes start over with it.
    useEffect(() => {
        setPass(null);
        setPassHistory([]);
        if (!loadUrl) return;
        let alive = true;
        loadPhotoDataUrl(loadUrl)
            .then(d => { if (alive) setPass(d); })
            .catch(e => { if (alive) setError((e as Error)?.message || tr('The photo could not be loaded')); });
        return () => { alive = false; };
    }, [loadUrl]);

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return inventory.filter(i => (i.label || '').toLowerCase().includes(q)).slice(0, 12);
    }, [query, inventory]);

    const pickItem = (id: string) => {
        setTarget({ itemId: id, angleIndex: 0 });
        setQuery('');
    };

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
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const { savedRow } = await saveCleanedPhotoToDb({ row, angleIndex, sourceUrl, dataUrl: pass, user });
            setRow(savedRow as Record<string, any>);
            setMessage(tr('Saved to Drive and to the inventory row.'));
        } catch (e) {
            setError((e as Error)?.message || tr('Save failed'));
        } finally {
            setSaving(false);
        }
    };

    const restorePrevious = async () => {
        if (!row || !sourceUrl) return;
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const saved = await rollbackCleanedPhotoInDb(row, sourceUrl, user);
            setRow(saved as Record<string, any>);
            setSource('cleaned');
            setMessage(tr('Restored the previous clean version.'));
        } catch (e) {
            setError((e as Error)?.message || tr('Restore failed'));
        } finally {
            setSaving(false);
        }
    };

    const serviceState = service === 'online'
        ? { state: 'done' as const, label: tr('IOPaint online') }
        : service === 'offline'
            ? { state: 'failed' as const, label: tr('IOPaint offline') }
            : { state: 'queued' as const, label: tr('Checking IOPaint') };

    return (
        <div className="ui-root flex h-full min-h-0 flex-col gap-3 p-3">
            <div className="liquid-surface flex flex-wrap items-center gap-2 rounded-md p-2">
                <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tr('Find an item')}
                    aria-label={tr('Find an item')}
                    className="w-48" />
                {matches.map(m => (
                    <Key key={String(m.data.id || m.row)} size="sm" variant="quiet" onClick={() => pickItem(String(m.data.id || m.row))}>
                        {m.label}
                    </Key>
                ))}
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
                <span className="flex-1" />
                <StatusPill state={serviceState.state} label={serviceState.label} />
            </div>

            <div className="liquid-surface flex flex-wrap items-center gap-2 rounded-md p-2">
                <Segmented
                    size="sm"
                    label={tr('Tool')}
                    value="brush"
                    onChange={() => undefined}
                    options={[
                        { value: 'brush', label: tr('Cleanup Brush'), icon: <Eraser size={14} /> },
                        { value: 'vector', label: <>{tr('Mask Vector')} <span className="text-[11px]">{tr('Coming soon')}</span></>, disabled: true, title: tr('Coming soon') },
                    ]} />
                <Segmented
                    size="sm"
                    label={tr('Source')}
                    value={showCleaned ? 'cleaned' : 'original'}
                    onChange={(v) => setSource(v)}
                    options={[
                        { value: 'cleaned', label: tr('Cleaned'), disabled: !clean.cleanedUrl },
                        { value: 'original', label: tr('Original') },
                    ]} />
                <span className="flex-1" />
                <Key size="sm" icon={<Undo2 size={14} />} disabled={!passHistory.length || saving} onClick={undoPass}>{tr('Undo pass')}</Key>
                <Key size="sm" icon={<RotateCcw size={14} />} disabled={!clean.prevUrl || saving} onClick={restorePrevious}>{tr('Restore previous clean')}</Key>
                <Key variant="go" size="sm" icon={<Save size={14} />} disabled={!pass || !row || !sourceUrl || saving} busy={saving} onClick={save}>{tr('Save to Drive')}</Key>
            </div>

            {service === 'offline' && (
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
                    <p className="text-sm">{tr('Find an item above, or open a photo with Edit in ImageCanvas.')}</p>
                ) : row && !sourceUrl ? (
                    <p className="text-sm">{tr('This item has no photo.')}</p>
                ) : pass ? (
                    <CleanupBrushStage
                        baseImageUrl={pass}
                        serviceOnline={service === 'online'}
                        onPassComplete={onPassComplete}
                        onError={setError} />
                ) : !error ? (
                    <div className="flex flex-1 items-center justify-center"><LoadingIndicator /></div>
                ) : null}
            </div>
        </div>
    );
}
