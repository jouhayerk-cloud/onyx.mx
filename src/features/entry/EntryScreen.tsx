/**
 * Add Entry and Edit Entry: one screen, on the UI kit and the AI run engine.
 *
 * It is mounted in two places: inline as the Create Item page (single mode)
 * and as the app-wide modal the header launcher and the inventory row's Edit
 * open (UploadWizard). Both used to be different forms with different
 * numbering, codes and payloads; now both are this, writing through
 * lib/inventoryCreate.
 *
 * What it fixes, by the bugs it replaces:
 *
 *   · Numbering per vendor per book from RxDB (Supabase as fallback), with a
 *     duplicate check before every save. Create Item's lookup always threw
 *     and restarted every vendor at 001.
 *   · State is the screen's own, built once from its props. Nothing is read
 *     from uploadItemDataAtom after mount, so an Edit Entry left in that atom
 *     can no longer pre-fill a new item, and a save no longer wipes the book.
 *   · On an existing item the book is read-only (so are the vendor and the
 *     number once a barcode is printed): changing them would recompute a
 *     barcode that is on a label.
 *   · media_urls is written only when the photos changed.
 *   · One save at a time: the key, Ctrl+S and Ctrl+Enter all go through a
 *     ref checked before anything awaits.
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { Save } from 'lucide-react';
import toast from '../onyxIsland/notify/toast';
import {
    inventoryAtom, InventoryVersionAtom, isAiProcessingEnabledAtom, isDummyModeAtom, userAtom,
} from '../../lib/atoms';
import { CATALOG_PROCESSES } from '../../lib/catalogHubProcesses';
import { tr, trf } from '../../lib/i18n';
import { useFormDraft } from '../../lib/useFormDraft';
import { normalizeInventoryData } from '../../lib/utils';
import { aiErrorMessage } from '../../lib/ai/errors';
import { buildAiPatch, saveAiPatch } from '../../lib/ai/persist';
import { mediaOf, saveSetOf, useAiRun, type ProcessId, type SaveOutcome } from '../../lib/ai/run';
import {
    ENTRY_BOOKS, buildInventoryRow, createInventoryItems, formatItemId, getNextItemNumber, isDuplicate,
    labelPrinted, loadInventoryRow, normalizeWorkbook, storedBarcodeOf, updateInventoryItem,
    type InventoryInsert, type InventoryRow,
} from '../../lib/inventoryCreate';
import { Dialog, ItemTag, Key, cx } from '../../components/ui';
import { LivePreviewCard } from '../../components/inventory/LivePreviewCard';
import {
    EMPTY_ENTRY, entryFromRow, hasTypedContent, isKnownVendor, mediaValues, photosChanged, photosFromRow,
    sameEntry, toInventoryForm, typedChanged, type EntryPhoto, type EntryState,
} from './entryModel';
import { uploadEntryPhotos } from './entryMedia';
import { EntryForm, type EntryLocks, type EntryNumberState } from './EntryForm';
import { ENTRY_PROCESSES, GeneratePanel } from './GeneratePanel';
import './entry.css';
import { useWorkGuard } from '../../lib/useWorkGuard';

export interface EntryScreenProps {
    /** 'page': inline in Create Item. 'modal': the full-screen overlay. */
    variant: 'page' | 'modal';
    mode: 'create' | 'edit';
    /** Edit: the row's uuid. The stored row is read fresh from it. */
    editId?: string;
    /** Edit: the row the caller holds, used when the stored one cannot be read (offline). */
    editRow?: Record<string, any> | null;
    /** Create: vendor and book to start with. */
    preset?: { vendorId?: string | null; workbook?: string | null };
    /** Shows Cancel / Close and handles Esc (modal). */
    onClose?: () => void;
    onSaved?: (row: InventoryRow, mode: 'create' | 'edit') => void;
    /** Ctrl+S / Ctrl+Enter (and Esc in the modal). Off while another entry screen is on top. */
    shortcuts?: boolean;
}

/**
 * The modal re-takes focus when its content is swapped (the loading state
 * replaced by the editor drops focus to <body>). Taking focus on first open
 * and giving it back on close is the host's (UploadWizard), which knows the
 * opener; this only acts when focus was lost, so it never steals it from one.
 */
function useModalFocus(ref: React.RefObject<HTMLElement>, active: boolean) {
    useEffect(() => {
        if (!active) return;
        const el = ref.current;
        if (el && (document.activeElement === document.body || document.activeElement === null)) el.focus();
    }, [ref, active]);
}

/**
 * Loads the stored row for an edit, then mounts the editor with it, so every
 * piece of the editor's state is built once from settled props.
 */
export function EntryScreen(props: EntryScreenProps) {
    const { mode, editId, editRow } = props;
    const [loaded, setLoaded] = useState<{ row: Record<string, any> | null; missing: boolean } | null>(
        mode === 'create' ? { row: null, missing: false } : null,
    );

    useEffect(() => {
        if (mode !== 'edit') return;
        let cancelled = false;
        (async () => {
            const stored = editId ? await loadInventoryRow(editId) : null;
            if (cancelled) return;
            if (stored) setLoaded({ row: stored, missing: false });
            // Not in `inventory`: a production-table row, or deleted meanwhile.
            // Shown read-only; the old upsert created a duplicate here.
            else setLoaded({ row: editRow ? { ...editRow, id: editId } : null, missing: true });
        })();
        return () => { cancelled = true; };
    }, [mode, editId, editRow]);

    // While the row loads, the modal can still be closed (Close, or Esc):
    // the editor, which owns those keys, has not mounted yet.
    const { variant, onClose, shortcuts = true } = props;
    const loadingRef = useRef<HTMLDivElement>(null);
    useModalFocus(loadingRef, !loaded && variant === 'modal');
    useEffect(() => {
        if (loaded || variant !== 'modal' || !onClose || !shortcuts) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onClose(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [loaded, variant, onClose, shortcuts]);

    if (!loaded) {
        return (
            <div ref={loadingRef} className={cx('ui-root entry', `entry--${variant}`)}
                role={variant === 'modal' ? 'dialog' : 'region'} aria-modal={variant === 'modal' ? true : undefined}
                aria-label={tr('Edit Entry')} aria-busy="true" tabIndex={variant === 'modal' ? -1 : undefined}>
                {onClose && (
                    <header className="ui-bar entry-bar">
                        <span className="ui-grow" />
                        <Key onClick={onClose}>{tr('Close')}</Key>
                    </header>
                )}
                <p className="entry-note entry-loading">{tr('Loading the item…')}</p>
            </div>
        );
    }
    return <EntryEditor key={loaded.row?.id || 'new'} {...props} existing={loaded.row} missing={loaded.missing} />;
}

const DEFAULT_PROCESSES = new Set<ProcessId>(
    CATALOG_PROCESSES.filter(p => p.defaultChecked && ENTRY_PROCESSES.includes(p.id)).map(p => p.id),
);

/** A row the engine and the tag can read even while the form is incomplete. */
function looseRow(state: EntryState, media: readonly string[], id: string): Record<string, any> {
    const num = parseInt(state.itemNumber, 10);
    const vendor = state.vendorId.trim().toUpperCase();
    return {
        id,
        vendor_id: vendor || null,
        workbook: normalizeWorkbook(state.workbook) || null,
        item_number: Number.isFinite(num) ? num : null,
        item_id: vendor && Number.isFinite(num) ? formatItemId(vendor, num) : null,
        shape: state.shape || null,
        short_description: state.type || null,
        material: state.material || null,
        color: state.color || null,
        description: state.description || null,
        quantity: parseInt(state.quantity, 10) || 1,
        price_mxn: parseFloat(state.price) || null,
        width_cm: parseFloat(state.widthCm) || null,
        height_cm: parseFloat(state.heightCm) || null,
        length_cm: parseFloat(state.lengthCm) || null,
        weight_kg: parseFloat(state.weightKg) || null,
        media_urls: media.length ? media.join(',') : null,
    };
}

/**
 * Fill in the URLs an upload produced, by photo key, on the photos as they are
 * NOW: one added or removed while the upload ran is kept as it is.
 */
const withUrls = (current: EntryPhoto[], uploaded: readonly EntryPhoto[]): EntryPhoto[] =>
    current.map(p => {
        if (p.url) return p;
        const u = uploaded.find(x => x.key === p.key)?.url;
        return u ? { ...p, url: u } : p;
    });

interface EditorProps extends EntryScreenProps {
    existing: Record<string, any> | null;
    missing: boolean;
}

type Confirm = { kind: 'close' } | { kind: 'restore'; draft: EntryState };

/**
 * The inline Add Entry (Create Item) unmounts when the user goes to another
 * view. Its fields and photos (picked files included) are kept here, in
 * memory, and the screen comes back with them; the typed-fields draft in
 * storage only survives a reload. Generated content is not kept: the run
 * stops with the screen.
 */
interface PageStash {
    form: EntryState;
    photos: EntryPhoto[];
    baseline: { form: EntryState; photos: EntryPhoto[] };
    draftId: string;
    ownerKey: string | null;
}
let pageStash: PageStash | null = null;

function EntryEditor({ variant, mode, preset, onClose, onSaved, shortcuts = true, existing, missing }: EditorProps) {
    const user = useAtomValue(userAtom);
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const catalogue = useAtomValue(inventoryAtom);
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    const [aiEnabled, setAiEnabled] = useAtom(isAiProcessingEnabledAtom);
    const titleId = useId();

    const isEdit = mode === 'edit';
    const vendorLock = user?.role === 'Vendor' && isKnownVendor(user?.name) ? String(user.name) : null;
    const ownerKey = user?.id ? String(user.id) : user?.name ? String(user.name) : null;
    const stashes = variant === 'page' && !isEdit;
    // Read once, on mount: the inline screen coming back from another view.
    // (Cleared in an effect, not here: an initializer must stay pure.)
    const [stash] = useState<PageStash | null>(() =>
        stashes && pageStash && pageStash.ownerKey === ownerKey ? pageStash : null);
    useEffect(() => { if (stashes) pageStash = null; }, [stashes]);

    // ── state, built once ──
    const initial = useMemo<{ form: EntryState; photos: EntryPhoto[] }>(() => {
        if (stash) return stash.baseline;
        if (isEdit && existing) return { form: entryFromRow(existing), photos: photosFromRow(existing) };
        const wb = normalizeWorkbook(preset?.workbook);
        return {
            form: {
                ...EMPTY_ENTRY,
                vendorId: vendorLock || (isKnownVendor(preset?.vendorId) ? String(preset!.vendorId) : ''),
                workbook: (ENTRY_BOOKS as readonly string[]).includes(wb) ? wb : EMPTY_ENTRY.workbook,
            },
            photos: [],
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [form, setForm] = useState<EntryState>(stash?.form ?? initial.form);
    const [photos, setPhotos] = useState<EntryPhoto[]>(stash?.photos ?? initial.photos);
    const baseline = useRef(initial);
    // Create: the uuid the row will be inserted with, so the run item keeps
    // one key while the number and book are still being typed.
    const [draftId, setDraftId] = useState<string>(() => stash?.draftId ?? (isEdit && existing?.id ? String(existing.id) : crypto.randomUUID()));
    const rowNow = useRef(new Date().toISOString());

    const [numberState, setNumberState] = useState<EntryNumberState>({ checking: false, duplicate: false });
    const autoNumber = useRef(!isEdit && !(stash && stash.form.itemNumber !== stash.baseline.form.itemNumber));
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const [stage, setStage] = useState('');
    const [confirm, setConfirm] = useState<Confirm | null>(null);

    const [processes, setProcesses] = useState<Set<ProcessId>>(() => new Set(DEFAULT_PROCESSES));
    const [preparing, setPreparing] = useState(false);
    const [prepLabel, setPrepLabel] = useState('');
    const pendingRun = useRef<Set<ProcessId> | null>(null);
    const [pendingTick, setPendingTick] = useState(0);
    const [keyMissing, setKeyMissing] = useState(false);

    const patch = useCallback((p: Partial<EntryState>) => {
        if ('itemNumber' in p) autoNumber.current = false;
        setForm(prev => ({ ...prev, ...p }));
    }, []);

    // ── locks ──
    const printed = isEdit ? storedBarcodeOf(existing) : null;
    // A label can be out without a stored barcode (printed while the column
    // was empty): the print records say so, and the same locks apply.
    const numberLocked = isEdit && labelPrinted(existing);
    const locks: EntryLocks = {};
    if (isEdit) locks.workbook = tr('An existing item stays in its book: moving it would change its printed barcode.');
    if (numberLocked) {
        const why = printed ? trf('Printed on the label as {code}.', { code: printed }) : tr('A label has been printed for this item.');
        locks.vendorId = why;
        locks.itemNumber = why;
    }
    if (vendorLock) locks.vendorId = tr('Your vendor account.');

    // ── numbering ──
    useEffect(() => {
        if (isEdit || !form.vendorId || !form.workbook) return;
        let cancelled = false;
        setNumberState(s => ({ ...s, checking: true }));
        getNextItemNumber(form.vendorId, form.workbook)
            .then(next => {
                if (cancelled) return;
                setNumberState(s => ({ ...s, checking: false, next }));
                // A vendor or book change renumbers, unless a number was typed.
                if (autoNumber.current) setForm(prev => ({ ...prev, itemNumber: String(next) }));
            })
            .catch(err => {
                if (cancelled) return;
                setNumberState(s => ({ ...s, checking: false }));
                toast.error(aiErrorMessage(err));
            });
        return () => { cancelled = true; };
    }, [isEdit, form.vendorId, form.workbook]);

    // A changed vendor or book means the number is picked for it again.
    const lastPair = useRef(`${form.vendorId}|${form.workbook}`);
    useEffect(() => {
        const pair = `${form.vendorId}|${form.workbook}`;
        if (pair !== lastPair.current && !isEdit) autoNumber.current = true;
        lastPair.current = pair;
    }, [form.vendorId, form.workbook, isEdit]);

    // A number found taken means the offered "next" may be stale too (taken
    // meanwhile on another device): read it again for the key below.
    const refreshNext = useCallback((vendorId: string, workbook: string) => {
        getNextItemNumber(vendorId, workbook)
            .then(next => setNumberState(s => ({ ...s, next })))
            .catch(() => { /* the key keeps the last known number */ });
    }, []);

    // Duplicate check, a moment after typing stops.
    useEffect(() => {
        if (!form.vendorId || !form.workbook || !form.itemNumber || numberLocked) {
            setNumberState(s => (s.duplicate ? { ...s, duplicate: false } : s));
            return;
        }
        if (isEdit && existing && sameEntry(form, entryFromRow(existing))) return;
        let cancelled = false;
        const t = setTimeout(() => {
            isDuplicate(form.vendorId, form.workbook, form.itemNumber, { excludeId: isEdit ? existing?.id : null })
                .then(dup => {
                    if (cancelled) return;
                    setNumberState(s => ({ ...s, duplicate: dup }));
                    if (dup) refreshNext(form.vendorId, form.workbook);
                })
                .catch(() => { /* the save re-checks */ });
        }, 350);
        return () => { cancelled = true; clearTimeout(t); };
    }, [form.vendorId, form.workbook, form.itemNumber, isEdit, numberLocked, existing, refreshNext]);

    // ── the row the engine, the tag and the codes read ──
    const media = useMemo(() => mediaValues(photos), [photos]);
    const runRow = useMemo(() => {
        let cols: Record<string, any>;
        try {
            cols = isEdit
                ? { ...buildInventoryRow(toInventoryForm(form, media), { mode: 'edit', now: rowNow.current }) }
                : { ...buildInventoryRow(toInventoryForm(form, media), { mode: 'create', id: draftId, now: rowNow.current }) };
        } catch {
            cols = looseRow(form, media, draftId);
        }
        // An edit keeps every stored column (the AI ones, the printed barcode)
        // under the form's; a printed barcode is never replaced.
        const row: Record<string, any> = isEdit && existing ? { ...existing, ...cols, id: String(existing.id) } : { ...cols, id: draftId };
        // Only a printed barcode is carried as the row's barcode. A computed
        // one left in would read as printed to the tag and the codes card;
        // without it they compute the same value and say so.
        row.book_barcode = printed ?? null;
        return row;
    }, [form, media, draftId, isEdit, existing, printed]);

    const runItems = useMemo(() => [runRow], [runRow]);
    const run = useAiRun({
        items: runItems,
        processes,
        processingMode: 'bgreplace',
        bgQuality: '2K',
        user,
        donorInventory: catalogue,
    });
    const runItem = run.get(runRow.id);
    const runBusy = !!runItem && (runItem.status === 'running' || runItem.saving);

    // ── dirty ──
    const formChanged = !sameEntry(form, baseline.current.form);
    // A new entry counts as changed by what was typed, not by the number,
    // book or vendor the screen filled in by itself.
    const formDirty = isEdit ? formChanged : typedChanged(form, baseline.current.form);
    const mediaDirty = isEdit ? photosChanged(baseline.current.photos, photos) : photos.length > 0;
    const aiDirty = !!runItem?.dirty;
    const dirty = formDirty || mediaDirty || aiDirty;
    useWorkGuard(dirty || runBusy);

    // ── draft (new entries only; typed fields, not photos) ──
    const { restored, ready: draftReady, clear: clearDraft } = useFormDraft<EntryState>(
        `inventory-add-entry-${variant}`,
        form,
        // Only what was typed since the screen opened (or the last save): the
        // attributes carried over to the next entry are not a draft.
        { ownerKey: user?.id ?? user?.name ?? null, enabled: !isEdit && !saving && formDirty && hasTypedContent(form) && confirm?.kind !== 'restore' },
    );
    const offeredDraft = useRef(!!stash);
    useEffect(() => {
        if (isEdit || !draftReady || offeredDraft.current) return;
        offeredDraft.current = true;
        if (restored && hasTypedContent(restored)) setConfirm({ kind: 'restore', draft: { ...EMPTY_ENTRY, ...restored } });
    }, [isEdit, draftReady, restored]);

    // ── generate ──
    const blockedReason = isDummyMode ? tr('Not available in demo mode.')
        : saving ? tr('Saving…')
            : missing ? tr('This item cannot be edited here.')
                : undefined;

    const startPending = useCallback(async (only: Set<ProcessId>) => {
        const res = await run.start([runRow.id], { processes: only });
        setPreparing(false);
        setPrepLabel('');
        if (res.error?.code === 'key_missing') { setKeyMissing(true); return; }
        const it = run.get(runRow.id);
        if (it?.status === 'failed') toast.error(it.error || tr('Generate failed.'));
        else if (it?.status === 'partial') toast(tr('Generated, with some failures. See the steps.'), { duration: 6000 });
    }, [run, runRow.id]);

    const handleGenerate = async () => {
        if (preparing || runBusy || blockedReason) return;
        setKeyMissing(false);
        const only = new Set(Array.from(processes).filter(p => {
            if (p === 'video_proc') return photos.some(x => x.isVideo);
            if (p === 'img_clean' || p === 'image_segmentation' || p === 'hex_map') return photos.some(x => !x.isVideo);
            return true;
        }));
        if (!only.size) { toast.error(tr('Tick at least one process.')); return; }
        setPreparing(true);
        // The engine reads photos by URL: upload first, with the helper the
        // save uses, so nothing is uploaded twice.
        let uploaded = false;
        if (photos.some(p => p.file && !p.url)) {
            const up = await uploadEntryPhotos(photos, user, p => setPrepLabel(trf('Uploading photo {n} of {total}…', { n: Math.min(p.done + 1, p.total), total: p.total })));
            uploaded = true;
            setPhotos(prev => withUrls(prev, up.photos));
            if (up.failed.length) {
                setPreparing(false);
                setPrepLabel('');
                toast.error(trf('Could not upload {names}. Nothing was generated.', { names: up.failed.join(', ') }));
                return;
            }
        }
        setPrepLabel(tr('Starting…'));
        pendingRun.current = only;
        // The run starts once the engine has seen the uploaded photos (the
        // effect below), not before: it reads the row it was last handed.
        if (!uploaded) setPendingTick(t => t + 1);
    };

    useEffect(() => {
        const only = pendingRun.current;
        if (!only) return;
        const it = run.get(runRow.id);
        if (!it) return;
        const want = mediaOf(normalizeInventoryData(runRow)).map(m => m.url).join('|');
        const have = it.media.map(m => m.url).join('|');
        if (want !== have) return;
        pendingRun.current = null;
        void startPending(only);
    }, [run.state, runRow, pendingTick, run, startPending]);

    // ── save ──
    const label = `${form.vendorId || '?'}${normalizeWorkbook(form.workbook).slice(1)} ${form.itemNumber || '?'}`;

    const validate = (): string | null => {
        if (missing) return tr('This item is not in the inventory table, so it cannot be edited here.');
        if (!form.vendorId) return tr('Choose a vendor.');
        if (!normalizeWorkbook(form.workbook)) return tr('Choose a book.');
        const n = parseInt(form.itemNumber, 10);
        if (!Number.isFinite(n) || n < 1) return tr('Enter the item number.');
        if (numberState.duplicate && !numberLocked) return trf('{id} is already taken in this book.', { id: formatItemId(form.vendorId, n) });
        if (runBusy || preparing) return tr('Wait for Generate to finish, or stop it.');
        return null;
    };

    const resetForNext = (saved: InventoryRow) => {
        const savedNo = Number(saved.item_number) || parseInt(form.itemNumber, 10) || 0;
        // Vendor, book and status stay, and so do the attributes a lot from
        // one vendor shares (shape, Type, material, colour). The rest is new.
        const next: EntryState = {
            ...EMPTY_ENTRY,
            vendorId: form.vendorId,
            workbook: form.workbook,
            status: form.status,
            shape: form.shape,
            type: form.type,
            material: form.material,
            color: form.color,
            itemNumber: String(savedNo + 1),
        };
        photos.forEach(p => { if (p.file && p.preview.startsWith('blob:')) URL.revokeObjectURL(p.preview); });
        autoNumber.current = true;
        setForm(next);
        setPhotos([]);
        baseline.current = { form: next, photos: [] };
        setDraftId(crypto.randomUUID());
        setKeyMissing(false);
        // The lookup may know a higher number (another device); it wins.
        getNextItemNumber(next.vendorId, next.workbook)
            .then(n => {
                setNumberState(s => ({ ...s, next: n }));
                if (autoNumber.current && n > savedNo + 1) setForm(prev => ({ ...prev, itemNumber: String(n) }));
            })
            .catch(() => { /* the typed number stands; the save re-checks */ });
    };

    const save = async () => {
        if (savingRef.current) return;
        const problem = validate();
        if (problem) { toast.error(problem); return; }
        savingRef.current = true;
        setSaving(true);
        try {
            if (isDummyMode) {
                toast(tr('Demo mode: nothing was saved.'));
                return;
            }
            // Checked again now: the debounced check may be stale, and another
            // device may have taken the number since.
            if (!numberLocked && (!isEdit || form.itemNumber !== baseline.current.form.itemNumber || form.vendorId !== baseline.current.form.vendorId)) {
                setStage(tr('Checking the number…'));
                if (await isDuplicate(form.vendorId, form.workbook, form.itemNumber, { excludeId: isEdit ? existing?.id : null })) {
                    setNumberState(s => ({ ...s, duplicate: true }));
                    refreshNext(form.vendorId, form.workbook);
                    toast.error(trf('{id} is already taken in this book.', { id: formatItemId(form.vendorId, form.itemNumber) }));
                    return;
                }
            }

            const up = await uploadEntryPhotos(photos, user, p => setStage(trf('Uploading photo {n} of {total}…', { n: Math.min(p.done + 1, p.total), total: p.total })));
            setPhotos(prev => withUrls(prev, up.photos));
            if (up.failed.length) {
                toast.error(trf('Could not upload {names}. Nothing was saved; press Save to try again.', { names: up.failed.join(', ') }));
                return;
            }
            const urls = mediaValues(up.photos);
            const it = run.get(runRow.id);

            if (!isEdit) {
                const row = buildInventoryRow(toInventoryForm(form, urls), { mode: 'create', id: draftId, user });
                let aiWarnings: string[] = [];
                let aiFailed = false;
                let segmentations: Awaited<ReturnType<typeof buildAiPatch>>['segmentations'] = [];
                if (it?.dirty) {
                    const { result, processes: done } = saveSetOf(it);
                    if (done.size) {
                        setStage(tr('Saving the generated images…'));
                        const aiPatch = await buildAiPatch(result, row, done, { user });
                        // Only AI columns come back, so nothing typed is overwritten.
                        Object.assign(row, aiPatch.columns as Partial<InventoryInsert>);
                        aiWarnings = aiPatch.warnings;
                        aiFailed = aiPatch.failedUploads.length > 0;
                        segmentations = aiPatch.segmentations;
                    }
                }
                setStage(tr('Saving…'));
                const [res] = await createInventoryItems([row]);
                if (!res.ok || !res.row) throw new Error(res.error || tr('Save failed.'));
                if (segmentations.length) {
                    await saveAiPatch(String(res.row.id), { columns: {}, segmentations, warnings: [], failedUploads: [] }, { user });
                }
                await clearDraft();
                setInventoryVersion(v => v + 1);
                toast.success(trf('{label} saved', { label }));
                // A failed upload left its column out: that image is NOT saved,
                // so it is reported as an error, not a footnote.
                if (aiFailed) toast.error(trf('Saved without some generated images: {why}', { why: aiWarnings.slice(0, 3).join(' · ') }), { duration: 10000 });
                else if (aiWarnings.length) toast(aiWarnings.slice(0, 3).join(' · '), { duration: 8000 });
                onSaved?.(res.row, 'create');
                resetForNext(res.row);
                return;
            }

            // ── edit ──
            if (!existing?.id) throw new Error(tr('This item has no database id.'));
            const changedMedia = photosChanged(baseline.current.photos, up.photos);
            let savedRow: InventoryRow | null = null;
            if (formChanged || changedMedia) {
                setStage(tr('Saving…'));
                const entryPatch = buildInventoryRow(toInventoryForm(form, changedMedia ? urls : undefined), { mode: 'edit', existing });
                savedRow = await updateInventoryItem(String(existing.id), entryPatch);
                // Written: a second Save (after a failed AI save below) does
                // not resend the entry.
                baseline.current = { form, photos: up.photos };
            }
            let aiOutcome: SaveOutcome | undefined;
            if (it?.dirty) {
                setStage(tr('Saving the generated content…'));
                // The engine's writer, by uuid, merged into the row as stored now.
                [aiOutcome] = await run.save([it.id]);
            }
            setInventoryVersion(v => v + 1);
            if (aiOutcome && (aiOutcome.outcome === 'failed' || aiOutcome.outcome === 'incomplete')) {
                toast.error(trf('{label}: the entry saved, the generated content did not: {why}', {
                    label, why: aiOutcome.error || aiOutcome.warnings.join('; ') || tr('uploads failed'),
                }), { duration: 10000 });
                return;
            }
            if (!savedRow && !aiOutcome) { toast(tr('Nothing changed.')); onClose?.(); return; }
            toast.success(trf('{label} saved', { label }));
            onSaved?.(savedRow || (existing as InventoryRow), 'edit');
            onClose?.();
        } catch (err) {
            toast.error(aiErrorMessage(err));
        } finally {
            savingRef.current = false;
            setSaving(false);
            setStage('');
        }
    };

    const requestClose = () => {
        if (!onClose || savingRef.current) return;
        if (dirty || runBusy || preparing) setConfirm({ kind: 'close' });
        else onClose();
    };

    // ── keys ──
    const saveRef = useRef(save);
    saveRef.current = save;
    const closeRef = useRef(requestClose);
    closeRef.current = requestClose;
    useEffect(() => {
        if (!shortcuts) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'Enter')) {
                e.preventDefault();
                // Auto-repeat and a second press land here too; save() ignores
                // them while one is running.
                if (!e.repeat) void saveRef.current();
                return;
            }
            if (e.key === 'Escape' && variant === 'modal' && !e.defaultPrevented) {
                e.preventDefault();
                closeRef.current();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [shortcuts, variant]);

    // Picked-file previews are object URLs; release them with the screen,
    // unless the inline screen keeps them for when it comes back (pageStash).
    const photosRef = useRef(photos);
    photosRef.current = photos;
    const stashRef = useRef<PageStash | null>(null);
    stashRef.current = stashes && !savingRef.current && (mediaDirty || formDirty)
        ? { form, photos, baseline: baseline.current, draftId, ownerKey }
        : null;
    useEffect(() => () => {
        if (stashRef.current) { pageStash = stashRef.current; return; }
        photosRef.current.forEach(p => { if (p.file && p.preview.startsWith('blob:')) URL.revokeObjectURL(p.preview); });
    }, []);

    const rootRef = useRef<HTMLDivElement>(null);
    useModalFocus(rootRef, variant === 'modal');

    const title = isEdit ? tr('Edit Entry') : tr('Add Entry');
    const facts = [
        form.vendorId,
        normalizeWorkbook(form.workbook),
        isEdit ? (printed ? trf('barcode {code}', { code: printed }) : '') : numberState.next ? trf('next number {n}', { n: numberState.next }) : '',
    ].filter(Boolean).join(' · ');

    const photoNote = isEdit && photosChanged(baseline.current.photos, photos) && photos[0]?.url !== baseline.current.photos[0]?.url
        && (existing?.generated_png_url || existing?.spatial_masks)
        ? tr('The first photo changed: run Clean PNG and Mask again so the stored cutouts match it.')
        : undefined;

    return (
        <div ref={rootRef} className={cx('ui-root entry', `entry--${variant}`)} role={variant === 'modal' ? 'dialog' : 'region'}
            aria-modal={variant === 'modal' ? true : undefined} aria-labelledby={titleId}
            tabIndex={variant === 'modal' ? -1 : undefined}>
            <header className="ui-bar entry-bar">
                <div className="entry-brand">
                    <span className="entry-logo" aria-hidden="true" />
                    <div>
                        <h2 id={titleId} className="entry-brand__name">{title}</h2>
                        {facts && <small className="entry-brand__facts ui-tnum">{facts}</small>}
                    </div>
                </div>
                <span className="ui-grow" />
                {stage && <span className="entry-stage ui-tnum" aria-live="polite">{stage}</span>}
                {form.vendorId && <ItemTag item={runRow} size="lg" />}
                {onClose && <Key onClick={requestClose} disabled={saving}>{isEdit ? tr('Cancel') : tr('Close')}</Key>}
                <Key variant="go" icon={<Save size={14} />} busy={saving} disabled={!!missing}
                    title={tr('Save (Ctrl+S)')} onClick={() => void save()}>
                    {isEdit ? tr('Save changes') : tr('Save entry')}
                </Key>
            </header>

            {missing && (
                <p className="entry-banner" role="alert">
                    {tr('This item is not in the inventory table (it may be a production-table row), so it cannot be edited here.')}
                </p>
            )}

            <div className="entry-body">
                <div className="entry-main">
                    <EntryForm
                        value={form}
                        onChange={patch}
                        photos={photos}
                        onPhotosChange={setPhotos}
                        locks={locks}
                        numberState={numberState}
                        suggestionRows={catalogue}
                        photoNote={photoNote}
                        disabled={saving || missing}
                    />
                    {numberState.duplicate && numberState.next && !locks.itemNumber && (
                        <div className="entry-inline">
                            <Key size="sm" onClick={() => { autoNumber.current = true; setForm(prev => ({ ...prev, itemNumber: String(numberState.next) })); }}>
                                {trf('Use the next free number ({n})', { n: numberState.next })}
                            </Key>
                        </div>
                    )}
                    <LivePreviewCard row={runRow} />
                </div>

                <GeneratePanel
                    run={run}
                    item={runItem}
                    processes={processes}
                    onProcessesChange={setProcesses}
                    photos={photos}
                    onGenerate={() => void handleGenerate()}
                    preparing={preparing}
                    prepLabel={prepLabel}
                    aiEnabled={aiEnabled}
                    onEnableAi={() => setAiEnabled(true)}
                    blockedReason={blockedReason}
                    keyMissing={keyMissing || run.runError?.code === 'key_missing'}
                    onKeySaved={() => { run.clearRunError(); setKeyMissing(false); void handleGenerate(); }}
                    mode={mode}
                />
            </div>

            {confirm && (
                <Dialog
                    title={confirm.kind === 'close'
                        ? (runBusy || preparing ? tr('Generate is running') : tr('Unsaved changes'))
                        : tr('Restore your unsaved entry?')}
                    onCancel={() => setConfirm(null)}
                    actions={confirm.kind === 'close' ? (
                        <>
                            <Key data-autofocus onClick={() => setConfirm(null)}>{tr('Keep editing')}</Key>
                            <Key variant="danger" onClick={() => { setConfirm(null); run.stop(); onClose?.(); }}>
                                {runBusy || preparing ? tr('Stop and close') : tr('Discard and close')}
                            </Key>
                        </>
                    ) : (
                        <>
                            <Key onClick={() => { void clearDraft(); setConfirm(null); }}>{tr('Discard it')}</Key>
                            <Key data-autofocus variant="go" onClick={() => {
                                const d = confirm.draft;
                                autoNumber.current = !d.itemNumber;
                                setForm(prev => ({
                                    ...d,
                                    vendorId: vendorLock || d.vendorId || prev.vendorId,
                                    workbook: (ENTRY_BOOKS as readonly string[]).includes(normalizeWorkbook(d.workbook)) ? normalizeWorkbook(d.workbook) : prev.workbook,
                                }));
                                setConfirm(null);
                            }}>{tr('Restore')}</Key>
                        </>
                    )}
                >
                    {confirm.kind === 'close'
                        ? <p>{runBusy || preparing
                            ? tr('Closing stops Generate; requests in flight are cancelled and nothing is saved.')
                            : tr('The changes, photos and generated content on this screen are not saved. Closing discards them.')}</p>
                        : <p>{trf('An entry you did not save was found: {what}. Restore it, or discard it and start clean?', {
                            what: [confirm.draft.vendorId, confirm.draft.shape, confirm.draft.type, confirm.draft.material].filter(Boolean).join(' · ') || tr('typed fields'),
                        })}</p>}
                </Dialog>
            )}
        </div>
    );
}
