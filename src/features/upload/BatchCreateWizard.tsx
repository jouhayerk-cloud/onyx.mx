/**
 * Batch Create: a vendor's xlsx in, inventory rows out, then the Catalog Hub
 * for the AI. Three steps on the UI kit, data-dense like the hub:
 *
 *   1. The sheet (batchSheet.ts): COLUMN_MAP, the sheet named after the
 *      vendor, '#' item numbers, at most 100 rows, text kept as typed, the
 *      Spanish attributes translated through lib/ai (buildTranslatePrompt).
 *   2. The review: one ItemRow per row with its tag, photos and every check,
 *      an editor beside the list, the photo-folder drop (batchPhotoMatch.ts)
 *      with the unmatched tray, and the AI processes to run after the import.
 *   3. The import (batchImport.ts): photos uploaded four at a time, rows
 *      inserted through lib/inventoryCreate, one result per row. The created
 *      rows then go to the Catalog Hub with the picked processes, where AI
 *      runs and is reviewed and saved with the hub's own flow; or Done.
 *
 * It used to run the AI itself, before the first insert, through a stub of
 * the pipeline context: no processingMode (so the in-browser cutout ran and
 * its output was thrown away), no setQueue (every hero op threw after its
 * results merged), all of a row's photos racing on one result object, a
 * timeout nobody enforced, failures in the console, and a progress bar parked
 * at 30% under 'Saving 0 / N'. Its results cards showed the vendor's note as
 * the title and the AI title as the marketing copy. Rows were numbered from a
 * max read by a stale closure (every vendor at 001 again), never checked for
 * duplicates, and stayed in batchCreateItemsAtom after saving, so coming back
 * to the view offered to insert them again. The panel of per-process Play and
 * Reload buttons (CatalogHubProcessesPanel) only ever toasted an error and is
 * gone with it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { atom } from 'jotai';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import toast from 'react-hot-toast';
import {
    AlertTriangle, Bot, ChevronLeft, ChevronRight, FileSpreadsheet, FolderOpen, Hash, ImagePlus, Images,
    Languages, Play, RefreshCw, Square, Star, Trash2, X,
} from 'lucide-react';
import {
    batchCreateItemsAtom, batchWizardHandoffAtom, batchWizardItemsAtom, inventoryAtom, InventoryVersionAtom,
    isAiProcessingEnabledAtom, isBatchWizardOpenAtom, isDummyModeAtom, userAtom, type BatchCreateItem,
} from '../../lib/atoms';
import { DEFAULT_EXCHANGE_RATE } from '../../lib/consts';
import { calculateCodesAndPrices } from '../../lib/utils';
import { tr, trf } from '../../lib/i18n';
import { el } from '../../lib/i18nEnums';
import { generateJson } from '../../lib/ai/client';
import { aiErrorMessage } from '../../lib/ai/errors';
import { hasGeminiKey } from '../../lib/ai/keys';
import { buildTranslatePrompt, type TranslationPair } from '../../lib/ai/prompts';
import { CATALOG_PROCESSES } from '../../lib/catalogHubProcesses';
import { buildAttributeSuggestions } from '../../lib/attributeSuggestions';
import { formatItemId, getTakenItemNumbers } from '../../lib/inventoryCreate';
import { processQueueWithConcurrency } from '../../lib/queueProcessor';
import {
    Chip, Drawer, Field, Input, ItemList, ItemRow, ItemTag, Key, ProcessChips, RunBar, StatusPill, Thumb, cx,
    type ItemState, type ProcessId,
} from '../../components/ui';
import { collectDroppedFiles, collectInputFiles, isImageFile, makePhotoPreview, matchPhotosToRows, type PhotoCandidate } from './batchPhotoMatch';
import {
    MAX_ITEMS, NUMERIC_FIELDS, SheetError, TEXT_FIELDS, assignNumbers, cleanNumberCell, itemNumberOf,
    numberConflicts, parseSheet, renumberConflicts, type InvalidCell, type NumericField, type SheetErrorCode,
} from './batchSheet';
import {
    BATCH_WORKBOOK, batchImportAtom, isImportRunning, requestImportStop, rowName, runBatchImport, tagRowOf,
    type ImportRow, type ImportRowState, type ImportState,
} from './batchImport';
import './batchCreate.css';
import { useWorkGuard } from '../../lib/useWorkGuard';

const TRAY_MIME = 'application/x-onyx-photo';
const BOOK = BATCH_WORKBOOK.slice(1);

/**
 * The processes offered for after the import: the hub's, without video (a
 * batch carries photos only) and with Write From Similar for the rows that
 * have no photo.
 */
const OFFERED: readonly ProcessId[] = CATALOG_PROCESSES.map(p => p.id).filter(id => id !== 'video_proc');
const DEFAULT_PROCESSES: readonly ProcessId[] = CATALOG_PROCESSES
    .filter(p => p.defaultChecked && p.id !== 'video_proc')
    .map(p => p.id);
const IMAGE_PROCESSES: readonly ProcessId[] = ['img_clean', 'image_segmentation', 'hex_map', 'dominant_colors'];

/** The vendor the batch's made-up numbers were counted for; a different vendor renumbers them. */
const numberedForAtom = atom('');

/** What the import read from the sheet, shown as issues in the review. */
interface SheetMeta {
    fileName: string;
    sheetName: string;
    vendorSheet: boolean;
    skippedForLimit: number;
    skippedBlank: number;
    unmapped: string[];
    invalidCells: InvalidCell[];
    translation: 'done' | 'off' | 'no_key' | 'failed';
    translationError?: string;
}
const sheetMetaAtom = atom(null as SheetMeta | null);

const FIELD_LABEL: Record<NumericField | 'itemNumber', string> = {
    itemNumber: '#',
    quantity: 'Qty',
    widthCm: 'W cm',
    heightCm: 'H cm',
    lengthCm: 'D cm',
    weightKg: 'Kg',
    price: 'Price MXN',
};

const SHEET_ERROR: Record<SheetErrorCode, string> = {
    unreadable: 'Could not read the file. It may be open in another program, or not be an xlsx.',
    no_rows: 'No data rows found in the spreadsheet.',
    no_headers: 'Could not recognise any column headers. Expected: cantidad, forma, tipo, color, material, ancho, alto, fondo, precio.',
    no_valid_rows: 'No row has a price, shape, type or description.',
};

// A small preview for the thumbnails; the full file is uploaded at import.
const previewFor = async (file: File) => {
    try { return await makePhotoPreview(file); }
    catch { return URL.createObjectURL(file); }
};

const money = (v: string | number) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? `$${Math.round(n).toLocaleString('en-US')}` : '';
};

function useNarrow(query = '(max-width: 1020px)'): boolean {
    const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
    const [narrow, setNarrow] = useState(get);
    useEffect(() => {
        const mq = window.matchMedia?.(query);
        if (!mq) return;
        const on = () => setNarrow(mq.matches);
        on();
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, [query]);
    return narrow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Translation (step 1)
// ─────────────────────────────────────────────────────────────────────────────

/** Spanish attributes to English, keyed by source text. Rows keep the original when the model skips one. */
async function translateItems(items: BatchCreateItem[]): Promise<{ items: BatchCreateItem[]; error?: string }> {
    const texts: string[] = [];
    const seen = new Set<string>();
    items.forEach(item => TEXT_FIELDS.forEach(field => {
        const val = String(item[field] ?? '').trim();
        if (val && !seen.has(val.toUpperCase())) { seen.add(val.toUpperCase()); texts.push(val); }
    }));
    if (!texts.length) return { items };

    try {
        const { prompt, schema } = buildTranslatePrompt(texts);
        const translated = await generateJson<TranslationPair[]>({ job: 'translate', prompt, schema });
        // Keyed by source text, not by position: a positional answer one entry
        // short used to shift every later translation onto the wrong attribute.
        const bySource = new Map<string, string>();
        (Array.isArray(translated) ? translated : []).forEach(pair => {
            if (typeof pair?.source === 'string' && typeof pair?.english === 'string' && pair.english.trim()) {
                bySource.set(pair.source.trim().toUpperCase(), pair.english.trim());
            }
        });
        const map = new Map<string, string>();
        texts.forEach(original => {
            const out = bySource.get(original.toUpperCase());
            // Text that came back unchanged apart from case keeps the sheet's spelling.
            if (out) map.set(original.toUpperCase(), out.toUpperCase() === original.toUpperCase() ? original : out);
        });
        if (!map.size) return { items, error: tr('The translation matched none of the values') };
        const t = (v: string) => map.get(v.trim().toUpperCase()) || v;
        return {
            items: items.map(item => ({
                ...item,
                // Type, colour and the note stay as the vendor wrote them.
                shape: t(item.shape), material: t(item.material),
            })),
        };
    } catch (err) {
        console.error('[BatchCreate] Translation failed', err);
        return { items, error: aiErrorMessage(err) };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row checks (step 2)
// ─────────────────────────────────────────────────────────────────────────────

interface RowIssue {
    level: 'error' | 'warn';
    kind: 'number' | 'cell' | 'price' | 'photo';
    /** A word for the Check column. */
    short: string;
    text: string;
}

function rowIssues(item: BatchCreateItem, conflict: 'invalid' | 'taken' | 'repeated' | undefined, vendor: string): RowIssue[] {
    const out: RowIssue[] = [];
    const n = itemNumberOf(item);
    if (conflict === 'invalid') {
        out.push({ level: 'error', kind: 'number', short: tr('Number'), text: String(item.itemNumber).trim() ? trf('"{n}" is not an item number', { n: item.itemNumber }) : tr('No item number yet') });
    } else if (conflict === 'taken' && n !== null) {
        out.push({ level: 'error', kind: 'number', short: tr('Taken'), text: trf('{id} is already taken in book {book}', { id: formatItemId(vendor || '?', n), book: BOOK }) });
    } else if (conflict === 'repeated' && n !== null) {
        out.push({ level: 'error', kind: 'number', short: tr('Repeated'), text: trf('#{n} is on another row of this batch too', { n }) });
    }
    for (const f of NUMERIC_FIELDS) {
        if (!cleanNumberCell(item[f]).ok) {
            out.push({ level: 'error', kind: 'cell', short: tr('Not a number'), text: trf('{field}: "{value}" is not a number', { field: tr(FIELD_LABEL[f]), value: item[f] }) });
        }
    }
    if (!cleanNumberCell(item.price).value) out.push({ level: 'warn', kind: 'price', short: tr('No price'), text: tr('No price: the row gets no book codes until one is entered') });
    if (!item.mediaFiles.length) out.push({ level: 'warn', kind: 'photo', short: tr('No photo'), text: tr('No photo: image processes skip it; Write From Similar can write its copy') });
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

interface BatchCreateWizardProps {
    vendorKey: string;
}

export function BatchCreateWizard({ vendorKey }: BatchCreateWizardProps) {
    const vendor = String(vendorKey || '').trim().toUpperCase();
    const [batchItems, setBatchItems] = useAtom(batchCreateItemsAtom);
    // A loaded batch is work a page reload would throw away.
    useWorkGuard(batchItems.length > 0);
    const [importState, setImportState] = useAtom(batchImportAtom);
    const [sheetMeta, setSheetMeta] = useAtom(sheetMetaAtom);
    const [numberedFor, setNumberedFor] = useAtom(numberedForAtom);
    const [aiEnabled, setAiEnabled] = useAtom(isAiProcessingEnabledAtom);
    const isDummyMode = useAtomValue(isDummyModeAtom);
    const user = useAtomValue(userAtom);
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    const setHubItems = useSetAtom(batchWizardItemsAtom);
    const setHubOpen = useSetAtom(isBatchWizardOpenAtom);
    const setHandoff = useSetAtom(batchWizardHandoffAtom);

    const [fileStep, setFileStep] = useState(false);
    const [processes, setProcesses] = useState<Set<ProcessId>>(() => new Set(DEFAULT_PROCESSES));

    // The vendor's numbers in the book, for numbering and the duplicate check.
    const [taken, setTaken] = useState<Set<number> | null>(null);
    const [takenError, setTakenError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const takenSeq = useRef(0);

    const loadTaken = useCallback(async (): Promise<Set<number> | null> => {
        if (!vendor) { setTaken(null); return null; }
        const seq = ++takenSeq.current;
        setChecking(true);
        try {
            const t = await getTakenItemNumbers(vendor, BATCH_WORKBOOK);
            if (seq !== takenSeq.current) return t;
            setTaken(t);
            setTakenError(null);
            // Numbers the import made up for another vendor (or could not make
            // up, the book being unreadable then) are made up again for this one.
            setBatchItems(prev => {
                const recount = numberedFor && numberedFor !== vendor;
                const cleared = recount ? prev.map(i => (i.autoNumber ? { ...i, itemNumber: '' } : i)) : prev;
                return cleared.some(i => !String(i.itemNumber ?? '').trim()) ? assignNumbers(cleared, t) : prev;
            });
            setNumberedFor(vendor);
            return t;
        } catch (err: any) {
            if (seq === takenSeq.current) {
                setTaken(null);
                setTakenError(err?.message || String(err));
            }
            return null;
        } finally {
            if (seq === takenSeq.current) setChecking(false);
        }
    }, [vendor, numberedFor, setBatchItems, setNumberedFor]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { void loadTaken(); }, [vendor]);

    const step: 1 | 2 | 3 = importState ? 3 : batchItems.length && !fileStep ? 2 : 1;

    if (step === 3 && importState) {
        return (
            <ImportStep
                state={importState}
                left={batchItems.length}
                aiEnabled={aiEnabled}
                onStop={requestImportStop}
                onHandOff={(autoRun) => {
                    const rows = importState.rows.map(r => r.row).filter(Boolean);
                    if (!rows.length) return;
                    setHubItems(rows);
                    setHandoff({
                        processes: importState.processes.filter(p => p !== 'variation_donor') as ProcessId[],
                        donor: importState.donor,
                        autoRun,
                    });
                    setHubOpen(true);
                }}
                onDone={() => { setImportState(null); setFileStep(false); void loadTaken(); }}
            />
        );
    }

    if (step === 1) {
        return (
            <FileStep
                vendor={vendor}
                pending={batchItems.length}
                onBack={batchItems.length ? () => setFileStep(false) : undefined}
                onLoaded={async (items, meta) => {
                    const t = await loadTakenFresh(vendor);
                    setTaken(t.taken);
                    setTakenError(t.error);
                    setBatchItems(t.taken ? assignNumbers(items, t.taken) : items);
                    setNumberedFor(t.taken ? vendor : '');
                    setSheetMeta(meta);
                    setFileStep(false);
                }}
            />
        );
    }

    return (
        <ReviewStep
            vendor={vendor}
            items={batchItems}
            setItems={setBatchItems}
            meta={sheetMeta}
            taken={taken}
            takenError={takenError}
            checking={checking}
            onRecheck={loadTaken}
            processes={processes}
            setProcesses={setProcesses}
            aiEnabled={aiEnabled}
            onEnableAi={() => setAiEnabled(true)}
            onLoadAnother={() => setFileStep(true)}
            onCreate={async () => {
                if (!vendor) { toast.error(tr('Choose a vendor first')); return; }
                if (isImportRunning()) return;
                if (isDummyMode) { toast(tr('Demo mode: nothing was saved.')); return; }
                const t = await loadTaken();
                if (!t) { toast.error(tr('Could not read the book’s numbers, so nothing was created. Check the connection and try again.')); return; }
                const items = batchItems;
                const conflicts = numberConflicts(items, t);
                if (conflicts.size) { toast.error(trf('{n} rows have a number that cannot be used. Renumber or fix them first.', { n: conflicts.size })); return; }
                if (items.some(i => NUMERIC_FIELDS.some(f => !cleanNumberCell(i[f]).ok))) { toast.error(tr('Some cells are not numbers. Fix them first.')); return; }
                const picked = aiEnabled ? OFFERED.filter(p => processes.has(p)) : [];
                void runBatchImport({
                    items,
                    vendor,
                    user,
                    processes: picked,
                    donor: picked.includes('variation_donor'),
                    setState: setImportState,
                    removeCreated: ids => setBatchItems(prev => prev.filter(i => !ids.includes(i.id))),
                    onCreated: () => setInventoryVersion(Date.now()),
                });
            }}
        />
    );
}

/** The book's numbers, or the error, without touching state (step 1 sets both at once). */
async function loadTakenFresh(vendor: string): Promise<{ taken: Set<number> | null; error: string | null }> {
    try {
        return { taken: await getTakenItemNumbers(vendor, BATCH_WORKBOOK), error: null };
    } catch (err: any) {
        return { taken: null, error: err?.message || String(err) };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 · the sheet
// ─────────────────────────────────────────────────────────────────────────────

function FileStep({ vendor, pending, onBack, onLoaded }: {
    vendor: string;
    pending: number;
    onBack?: () => void;
    onLoaded: (items: BatchCreateItem[], meta: SheetMeta) => Promise<void>;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [over, setOver] = useState(false);
    const [stage, setStage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [translate, setTranslate] = useState(true);
    const keySet = hasGeminiKey();

    const load = async (file: File | undefined) => {
        if (!file || stage) return;
        if (!vendor) { toast.error(tr('Choose a vendor first')); return; }
        if (!/\.xlsx?$/i.test(file.name)) { toast.error(tr('Please drop an .xlsx file')); return; }
        setError(null);
        setStage(tr('Reading the sheet…'));
        try {
            const parsed = parseSheet(await file.arrayBuffer(), vendor);
            let items = parsed.items;
            let translation: SheetMeta['translation'] = 'off';
            let translationError: string | undefined;
            if (translate && keySet) {
                setStage(tr('Translating Spanish → English via Gemini…'));
                const t = await translateItems(items);
                items = t.items;
                translation = t.error ? 'failed' : 'done';
                translationError = t.error;
                if (t.error) toast.error(`${tr('Translation failed: items loaded without translation')}: ${t.error}`);
            } else if (translate) {
                translation = 'no_key';
            }
            setStage(tr('Numbering…'));
            await onLoaded(items, {
                fileName: file.name,
                sheetName: parsed.sheetName,
                vendorSheet: parsed.vendorSheet,
                skippedForLimit: parsed.skippedForLimit,
                skippedBlank: parsed.skippedBlank,
                unmapped: parsed.unmapped,
                invalidCells: parsed.invalidCells,
                translation,
                translationError,
            });
            toast.success(trf('Loaded {n} rows from {file}', { n: items.length, file: file.name }));
            if (parsed.skippedForLimit > 0) {
                toast(trf('{n} more rows were not imported: the limit is {max} per batch. Split the sheet to load the rest.', { n: parsed.skippedForLimit, max: MAX_ITEMS }), { icon: '⚠️', duration: 8000 });
            }
        } catch (err: any) {
            setError(err instanceof SheetError ? tr(SHEET_ERROR[err.code]) : (err?.message || tr('Failed to read the spreadsheet')));
        } finally {
            setStage(null);
        }
    };

    const disabled = !vendor || !!stage;
    return (
        <div className="ui-root bc bc--file">
            <input ref={inputRef} type="file" hidden accept=".xlsx,.xls"
                onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" className={cx('bc-drop', over && 'bc-drop--over')} disabled={disabled}
                aria-describedby="bc-drop-hint"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) void load(e.dataTransfer.files[0]); }}>
                {stage
                    ? <span className="ui-spin bc-drop__spin" aria-hidden="true" />
                    : <FileSpreadsheet size={40} strokeWidth={1.4} aria-hidden="true" />}
                <span className="bc-drop__title">
                    {stage || (vendor ? trf('Drop {vendor}’s XLSX here', { vendor }) : tr('Choose a vendor first'))}
                </span>
                <span className="bc-drop__sub">
                    {stage ? '' : vendor
                        ? trf('or click to choose. The sheet named {vendor} is read, else the first one. Book {book}.', { vendor, book: BOOK })
                        : tr('Its sheet and its numbers in the book are what the import uses.')}
                </span>
            </button>

            <div className="bc-file__opts">
                <Chip pressed={translate && keySet} disabled={!keySet || !!stage} onPressedChange={setTranslate}
                    icon={<Languages size={12} />}
                    title={keySet ? tr('Translate shape and material from Spanish. Type, colour and the note are kept as the vendor wrote them.') : tr('No Gemini key on this device: the sheet is loaded as written')}>
                    {tr('Translate ES → EN')}
                </Chip>
                {onBack && (
                    <Key size="sm" variant="quiet" icon={<ChevronLeft size={13} />} onClick={onBack}>
                        {trf('Back to the review ({n} rows)', { n: pending })}
                    </Key>
                )}
            </div>

            {error && <p className="bc-alert" role="alert"><AlertTriangle size={14} aria-hidden="true" /> {error}</p>}

            <p id="bc-drop-hint" className="bc-hint">
                {tr('Columns: cantidad · forma · tipo · color · material · ancho · alto · fondo · precio. Optional: # (item number) · descripcion · kg.')}
                {' '}{trf('Up to {max} rows per batch. Name photos by item number (EM-004.jpg, EM-004-2.jpg) and drop the folder on the next step.', { max: MAX_ITEMS })}
            </p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 · the review
// ─────────────────────────────────────────────────────────────────────────────

type SuggestField = 'shape' | 'itemType' | 'color' | 'material';

interface TrayPhoto { id: string; file: File; preview: string; reason: string }

const ROW_COLUMNS = '118px 108px minmax(0, 1fr) 128px 104px 96px';

function ReviewStep(props: {
    vendor: string;
    items: BatchCreateItem[];
    setItems: (u: BatchCreateItem[] | ((prev: BatchCreateItem[]) => BatchCreateItem[])) => void;
    meta: SheetMeta | null;
    taken: Set<number> | null;
    takenError: string | null;
    checking: boolean;
    onRecheck: () => Promise<Set<number> | null>;
    processes: Set<ProcessId>;
    setProcesses: (next: Set<ProcessId>) => void;
    aiEnabled: boolean;
    onEnableAi: () => void;
    onLoadAnother: () => void;
    onCreate: () => Promise<void>;
}) {
    const { vendor, items, setItems, meta, taken, takenError, checking, processes, aiEnabled } = props;
    const inventory = useAtomValue(inventoryAtom);
    const narrow = useNarrow();

    const [currentId, setCurrentId] = useState<string | null>(null);
    const [tray, setTray] = useState<TrayPhoto[]>([]);
    const [trayPick, setTrayPick] = useState<string | null>(null);
    const [photoSummary, setPhotoSummary] = useState<{ files: number; rows: number; unmatched: number; ignored: number; duplicates: number } | null>(null);
    const [matching, setMatching] = useState(false);
    const [dropOver, setDropOver] = useState(false);
    const [rowOver, setRowOver] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const filesInput = useRef<HTMLInputElement>(null);
    const folderInput = useRef<HTMLInputElement>(null);
    // One picker for every row's "add photos", aimed at a row before it opens
    // (a ref per row was a fresh createRef on every render).
    const rowInput = useRef<HTMLInputElement>(null);
    const rowInputTarget = useRef<string | null>(null);

    // ── checks ──
    const conflicts = useMemo(() => numberConflicts(items, taken), [items, taken]);
    const issues = useMemo(() => {
        const m = new Map<string, RowIssue[]>();
        items.forEach(i => m.set(i.id, rowIssues(i, conflicts.get(i.id), vendor)));
        return m;
    }, [items, conflicts, vendor]);
    const errorRows = items.filter(i => issues.get(i.id)?.some(x => x.level === 'error')).length;
    const badCells = items.reduce((n, i) => n + NUMERIC_FIELDS.filter(f => !cleanNumberCell(i[f]).ok).length, 0);
    const tags = useMemo(() => {
        const m = new Map<string, Record<string, unknown>>();
        items.forEach(i => m.set(i.id, tagRowOf(i, vendor)));
        return m;
    }, [items, vendor]);

    const blocked = !vendor ? tr('Choose a vendor first')
        : !taken ? (takenError ? tr('The book’s numbers could not be read') : tr('Reading the book’s numbers…'))
            : conflicts.size ? trf('{n} rows have a number that cannot be used', { n: conflicts.size })
                : badCells ? trf('{n} cells are not numbers', { n: badCells })
                    : '';

    const current = (currentId && items.find(i => i.id === currentId)) || (narrow ? undefined : items[0]);

    // ── edits ──
    const updateItem = useCallback((id: string, patch: Partial<BatchCreateItem>) => {
        setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
    }, [setItems]);

    const removeItem = (id: string) => {
        const at = items.findIndex(i => i.id === id);
        const gone = items[at];
        if (!gone) return;
        setItems(prev => prev.filter(i => i.id !== id));
        if (currentId === id) setCurrentId(items[at + 1]?.id ?? items[at - 1]?.id ?? null);
        toast((t) => (
            <span className="bc-toast">
                {trf('Row {n} removed', { n: gone.sheetRow ?? at + 1 })}
                <button type="button" onClick={() => {
                    setItems(prev => (prev.some(i => i.id === gone.id) ? prev : [...prev.slice(0, at), gone, ...prev.slice(at)]));
                    toast.dismiss(t.id);
                }}>{tr('Undo')}</button>
            </span>
        ), { duration: 6000 });
    };

    const addFiles = useCallback(async (id: string, files: FileList | File[]) => {
        const picked = Array.from(files).filter(isImageFile);
        if (!picked.length) return;
        const media = await Promise.all(picked.map(async file => ({ type: 'image' as const, localUrl: await previewFor(file), originalFile: file, name: file.name, tag: 'Item' as const })));
        setItems(prev => prev.map(i => (i.id === id ? { ...i, mediaFiles: [...i.mediaFiles, ...media] } : i)));
    }, [setItems]);

    const moveTrayToRow = useCallback((trayId: string, rowId: string) => {
        const t = tray.find(p => p.id === trayId);
        if (!t) return;
        setItems(prev => prev.map(i => (i.id === rowId
            ? { ...i, mediaFiles: [...i.mediaFiles, { type: 'image' as const, localUrl: t.preview, originalFile: t.file, name: t.file.name, tag: 'Item' as const }] }
            : i)));
        setTray(prev => prev.filter(p => p.id !== trayId));
        if (trayPick === trayId) setTrayPick(null);
    }, [tray, trayPick, setItems]);

    // Drop a folder (or many photos) once: each file goes to the row whose item
    // number is in its name (EM-004.jpg, EM-004-2.jpg). See batchPhotoMatch.ts.
    const attachPhotos = useCallback(async (candidates: PhotoCandidate[]) => {
        if (!candidates.length) return;
        setMatching(true);
        try {
            const match = matchPhotosToRows(candidates, items, vendor);
            const files = [...Array.from(match.assigned.values()).flat(), ...match.unmatched.map(u => u.file)];
            const previews = new Map<File, string>();
            await processQueueWithConcurrency(files, 4, async (file) => { previews.set(file, await previewFor(file)); });
            setItems(prev => prev.map(i => {
                const add = match.assigned.get(i.id);
                if (!add) return i;
                return { ...i, mediaFiles: [...i.mediaFiles, ...add.map(file => ({ type: 'image' as const, localUrl: previews.get(file), originalFile: file, name: file.name, tag: 'Item' as const }))] };
            }));
            setTray(prev => [...prev, ...match.unmatched.map(u => ({ id: crypto.randomUUID(), file: u.file, preview: previews.get(u.file) || '', reason: u.reason }))]);
            const attached = Array.from(match.assigned.values()).reduce((n, f) => n + f.length, 0);
            setPhotoSummary({ files: attached, rows: match.assigned.size, unmatched: match.unmatched.length, ignored: match.ignored, duplicates: match.duplicates });
            if (attached) toast.success(trf('{n} photos attached to {rows} rows', { n: attached, rows: match.assigned.size }));
            else toast.error(tr('No photo names matched an item number in this batch'));
        } catch (err: any) {
            console.error('[BatchCreate] Photo matching failed', err);
            toast.error(`${tr('Could not read those photos')}: ${err?.message || err}`);
        } finally {
            setMatching(false);
        }
    }, [items, vendor, setItems]);

    // ── suggestions: the manual columns only (attributeSuggestions falls back
    // to generated_type for Type, the AI's Shopify category) ──
    const manualRows = useMemo(() => (inventory || []).map((r: any) => {
        const d = r?.data && typeof r.data === 'object' ? r.data : (r || {});
        return { shape: d.shape, material: d.material, color: d.color, short_description: d.short_description ?? d.shortDescription };
    }), [inventory]);
    const suggestions = useMemo((): Record<SuggestField, string[]> => {
        const s = buildAttributeSuggestions(manualRows, current
            ? { shape: current.shape, material: current.material, color: current.color, type: current.itemType }
            : {});
        const cap = (l?: string[]) => (l || []).slice(0, 40);
        return { shape: cap(s.shape), itemType: cap(s.type), color: cap(s.color), material: cap(s.material) };
    }, [manualRows, current?.shape, current?.material, current?.color, current?.itemType]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── process chips ──
    const anyPhoto = items.some(i => i.mediaFiles.length > 0);
    const anyPhotoless = items.some(i => i.mediaFiles.length === 0);
    const unavailable: Partial<Record<ProcessId, string>> = {};
    if (!anyPhoto) IMAGE_PROCESSES.forEach(p => { unavailable[p] = 'Needs a photo'; });
    if (!anyPhotoless) unavailable.variation_donor = 'Every row has a photo';

    const totals = useMemo(() => ({
        qty: items.reduce((n, i) => n + (Number(cleanNumberCell(i.quantity).value) || 1), 0),
        mxn: items.reduce((n, i) => n + (Number(cleanNumberCell(i.price).value) || 0) * (Number(cleanNumberCell(i.quantity).value) || 1), 0),
        photos: items.reduce((n, i) => n + i.mediaFiles.length, 0),
        withPhotos: items.filter(i => i.mediaFiles.length > 0).length,
    }), [items]);

    const create = async () => {
        setCreating(true);
        try { await props.onCreate(); } finally { setCreating(false); }
    };

    const renumber = () => {
        if (!taken) return;
        setItems(prev => renumberConflicts(prev, taken));
        toast.success(trf('{n} rows renumbered from the next free number', { n: conflicts.size }));
    };

    const rowCheck = (i: BatchCreateItem) => {
        const list = issues.get(i.id) || [];
        const err = list.find(x => x.level === 'error');
        const warn = list.find(x => x.level === 'warn');
        const title = list.map(x => x.text).join('\n') || tr('Ready to create');
        if (err) return <span title={title}><StatusPill state="failed" label={err.short} /></span>;
        if (warn) return <span title={title}><StatusPill state="partial" label={warn.short} /></span>;
        return <span title={title}><StatusPill state="done" label={tr('Ready')} /></span>;
    };

    const rowPhotos = (i: BatchCreateItem) => {
        if (!i.mediaFiles.length) return <span className="bc-faint">{tr('No photo')}</span>;
        const shown = i.mediaFiles.slice(0, 3);
        return (
            <span className="ui-thumbs">
                {shown.map((m, k) => m.localUrl
                    ? <Thumb key={k} src={m.localUrl} alt={m.name || `${tr('Photo')} ${k + 1}`}
                        badge={k === 2 && i.mediaFiles.length > 3 ? `+${i.mediaFiles.length - 3}` : undefined} />
                    : <span key={k} className="ui-thumb bc-thumb--empty" title={m.name} />)}
            </span>
        );
    };

    const sizeOf = (i: BatchCreateItem) => {
        const dims = [i.widthCm, i.heightCm, i.lengthCm].map(v => cleanNumberCell(v)).filter(c => c.ok && c.value).map(c => c.value);
        const kg = cleanNumberCell(i.weightKg);
        return [dims.length ? `${dims.join('×')} cm` : '', kg.ok && kg.value ? `${kg.value} kg` : '', `${tr('Q')}${cleanNumberCell(i.quantity).value || 1}`].filter(Boolean).join(' · ');
    };

    const editor = current ? (
        // Not keyed by row: RowEditor holds no per-row state, and remounting it
        // on Previous / Next / Remove dropped keyboard focus to <body> (and,
        // in the overlay drawer, out of its Esc and Tab handling).
        <RowEditor
            item={current}
            vendor={vendor}
            tag={tags.get(current.id) || {}}
            issues={issues.get(current.id) || []}
            suggestions={suggestions}
            index={items.indexOf(current)}
            count={items.length}
            trayPick={tray.find(t => t.id === trayPick) || null}
            onChange={(patch) => updateItem(current.id, patch)}
            onAddPhotos={() => { rowInputTarget.current = current.id; rowInput.current?.click(); }}
            onAttachPicked={() => trayPick && moveTrayToRow(trayPick, current.id)}
            onRemove={() => removeItem(current.id)}
            onStep={(d) => { const next = items[items.indexOf(current) + d]; if (next) setCurrentId(next.id); }}
        />
    ) : null;

    const conflictsByKind = Array.from(conflicts.values()).reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m; }, {} as Record<string, number>);

    return (
        <div className="ui-root bc">
            <input ref={rowInput} type="file" hidden multiple accept="image/*"
                onChange={(e) => { const id = rowInputTarget.current; if (id && e.target.files) void addFiles(id, e.target.files); e.target.value = ''; }} />

            {/* ── bar: what is loaded, and the one action ── */}
            <header className="ui-bar bc-bar">
                <Key size="sm" variant="quiet" icon={<FileSpreadsheet size={13} />} onClick={props.onLoadAnother}
                    title={tr('Read another sheet; it replaces these rows')}>
                    {tr('Another sheet')}
                </Key>
                <div className="bc-bar__title">
                    <h2>{vendor ? trf('{vendor} · book {book}', { vendor, book: BOOK }) : trf('No vendor · book {book}', { book: BOOK })}</h2>
                    <small className="ui-tnum">
                        {[trf('{n} rows', { n: items.length }), meta ? `${meta.fileName} · ${tr('sheet')} ${meta.sheetName}` : ''].filter(Boolean).join(' · ')}
                    </small>
                </div>
                <span className="ui-grow" />
                <Key variant="go" icon={<Play size={13} />} busy={creating || checking} disabled={!!blocked || !items.length}
                    title={blocked || tr('Upload the photos and create the rows in the inventory')}
                    onClick={create}>
                    {trf('Create {n} items', { n: items.length })}
                </Key>
            </header>

            {/* ── after the import ── */}
            <div className="bc-ai">
                <span className="bc-ai__label"><Bot size={13} aria-hidden="true" /> {tr('AI after import')}</span>
                {aiEnabled ? (
                    <>
                        <ProcessChips value={processes} onChange={props.setProcesses} include={OFFERED} unavailable={unavailable}
                            label={tr('Processes to run in the Catalog Hub after the import')} />
                        <span className="bc-ai__note">{tr('Runs in the Catalog Hub, where you review and save it.')}</span>
                    </>
                ) : (
                    <>
                        <span className="bc-ai__note">{tr('AI processes are off, so the rows are created without AI.')}</span>
                        <Key size="sm" onClick={props.onEnableAi}>{tr('Turn AI on')}</Key>
                    </>
                )}
            </div>

            {/* ── what needs attention ── */}
            <ul className="bc-issues" aria-label={tr('Checks')}>
                {!vendor && <li data-level="error">{tr('Choose a vendor above: the numbers and the photo names are checked against it.')}</li>}
                {vendor && takenError && (
                    <li data-level="error">
                        {trf('Could not read {vendor}’s numbers in book {book}: {error}', { vendor, book: BOOK, error: takenError })}
                        <Key size="sm" variant="quiet" icon={<RefreshCw size={12} />} busy={checking} onClick={() => { void props.onRecheck(); }}>{tr('Retry')}</Key>
                    </li>
                )}
                {conflicts.size > 0 && taken && (
                    <li data-level="error">
                        {[
                            conflictsByKind.taken ? trf('{n} numbers already taken in book {book}', { n: conflictsByKind.taken, book: BOOK }) : '',
                            conflictsByKind.repeated ? trf('{n} repeated in this batch', { n: conflictsByKind.repeated }) : '',
                            conflictsByKind.invalid ? trf('{n} not item numbers', { n: conflictsByKind.invalid }) : '',
                        ].filter(Boolean).join(' · ')}
                        <Key size="sm" variant="quiet" icon={<Hash size={12} />} onClick={renumber}
                            title={tr('Give those rows the next free numbers; the other rows keep theirs')}>
                            {trf('Renumber {n}', { n: conflicts.size })}
                        </Key>
                    </li>
                )}
                {badCells > 0 && <li data-level="error">{trf('{n} cells are not numbers. Open the row to fix them.', { n: badCells })}</li>}
                {meta && !meta.vendorSheet && vendor && <li data-level="warn">{trf('No sheet is named {vendor}; read “{sheet}”.', { vendor, sheet: meta.sheetName })}</li>}
                {meta && meta.skippedForLimit > 0 && <li data-level="warn">{trf('{n} more rows were not imported: the limit is {max} per batch. Split the sheet to load the rest.', { n: meta.skippedForLimit, max: MAX_ITEMS })}</li>}
                {meta && meta.skippedBlank > 0 && <li data-level="info">{trf('{n} rows had no price, shape, type or description and were skipped.', { n: meta.skippedBlank })}</li>}
                {meta && meta.unmapped.length > 0 && <li data-level="info">{trf('Columns not read: {cols}', { cols: meta.unmapped.join(', ') })}</li>}
                {meta?.translation === 'failed' && <li data-level="warn">{trf('Not translated: {error}', { error: meta.translationError || '' })}</li>}
                {meta?.translation === 'no_key' && <li data-level="info">{tr('Not translated: no Gemini key on this device.')}</li>}
            </ul>

            <div className={cx('bc-body', narrow && 'bc-body--narrow')}>
                <div className="bc-main">
                    {/* ── photos: drop a folder once; files named by item number go to their row ── */}
                    <div className={cx('bc-photos', dropOver && 'bc-photos--over')}
                        onDragOver={(e) => { if (!e.dataTransfer.types.includes(TRAY_MIME)) { e.preventDefault(); setDropOver(true); } }}
                        onDragLeave={() => setDropOver(false)}
                        onDrop={async (e) => {
                            e.preventDefault();
                            setDropOver(false);
                            if (e.dataTransfer.types.includes(TRAY_MIME)) return;
                            await attachPhotos(await collectDroppedFiles(e.dataTransfer));
                        }}>
                        <div className="bc-photos__head">
                            {matching ? <span className="ui-spin" aria-hidden="true" /> : <Images size={16} aria-hidden="true" />}
                            <div className="bc-photos__text">
                                <strong>{matching ? tr('Matching photos…') : tr('Drop a photo folder here')}</strong>
                                <span>{tr('Each photo goes to the row whose item number is in its name: EM-004.jpg, EM-004-2.jpg, 004b.jpg. Item subfolders (EM-004/) work too.')}</span>
                            </div>
                            <input ref={filesInput} type="file" hidden multiple accept="image/*"
                                onChange={(e) => { if (e.target.files) void attachPhotos(collectInputFiles(e.target.files)); e.target.value = ''; }} />
                            {/* webkitdirectory isn't in React's input props, so it is set on the element. */}
                            <input type="file" hidden multiple
                                ref={(el) => { folderInput.current = el; el?.setAttribute('webkitdirectory', ''); }}
                                onChange={(e) => { if (e.target.files) void attachPhotos(collectInputFiles(e.target.files)); e.target.value = ''; }} />
                            <Key size="sm" icon={<FolderOpen size={12} />} disabled={matching} onClick={() => folderInput.current?.click()}>{tr('Choose folder')}</Key>
                            <Key size="sm" icon={<ImagePlus size={12} />} disabled={matching} onClick={() => filesInput.current?.click()}>{tr('Choose photos')}</Key>
                        </div>

                        {photoSummary && (
                            <p className="bc-photos__sum ui-tnum">
                                <span data-tone="ok">{trf('{n} attached to {rows} rows', { n: photoSummary.files, rows: photoSummary.rows })}</span>
                                {photoSummary.unmatched > 0 && <span data-tone="warn">{trf('{n} unmatched', { n: photoSummary.unmatched })}</span>}
                                {photoSummary.duplicates > 0 && <span>{trf('{n} already attached', { n: photoSummary.duplicates })}</span>}
                                {photoSummary.ignored > 0 && <span>{trf('{n} in other subfolders, ignored', { n: photoSummary.ignored })}</span>}
                            </p>
                        )}

                        {tray.length > 0 && (
                            <div className="bc-tray">
                                <div className="bc-tray__head">
                                    <span>{tr('Unmatched: drag one onto a row, or pick it and use “Attach picked photo” in the row')}</span>
                                    <Key size="sm" variant="quiet" onClick={() => { setTray([]); setTrayPick(null); }}>{tr('Clear')}</Key>
                                </div>
                                <div className="bc-tray__list">
                                    {tray.map(t => (
                                        <button key={t.id} type="button" draggable
                                            className="bc-tray__item" aria-pressed={trayPick === t.id}
                                            title={`${t.file.name}: ${t.reason}`}
                                            onClick={() => setTrayPick(p => (p === t.id ? null : t.id))}
                                            onDragStart={(e) => { e.dataTransfer.setData(TRAY_MIME, t.id); e.dataTransfer.effectAllowed = 'move'; }}>
                                            {t.preview ? <img src={t.preview} alt="" draggable={false} /> : <span className="bc-tray__ph" />}
                                            <span className="bc-tray__name">{t.file.name}</span>
                                            <span className="bc-tray__why">{t.reason}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── rows ── */}
                    <ItemList label={tr('Rows to create')} columns={ROW_COLUMNS} className="bc-list bc-list--review"
                        header={[tr('Item'), tr('Photos'), tr('Description'), tr('Size'), tr('MXN'), tr('Check')]}
                        empty={tr('No rows left in this batch.')}>
                        {items.map(i => (
                            <ItemRow key={i.id}
                                current={current?.id === i.id}
                                label={`${tags.get(i.id)?.item_id || i.itemNumber} ${rowName(i)}`}
                                onOpen={() => setCurrentId(i.id)}
                                onFocus={() => { if (current?.id !== i.id) setCurrentId(i.id); }}
                                className={cx(rowOver === i.id && 'bc-row--drop')}
                                onDragOver={(e) => { e.preventDefault(); if (rowOver !== i.id) setRowOver(i.id); }}
                                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setRowOver(null); }}
                                onDrop={(e) => {
                                    // A tray photo, or files from the desktop.
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setRowOver(null);
                                    const trayId = e.dataTransfer.getData(TRAY_MIME);
                                    if (trayId) moveTrayToRow(trayId, i.id);
                                    else if (e.dataTransfer.files.length) void addFiles(i.id, e.dataTransfer.files);
                                }}>
                                <ItemTag item={tags.get(i.id)} workbook={BOOK} />
                                {rowPhotos(i)}
                                <span className="ui-row__main">
                                    <span className="ui-row__title">{rowName(i) || <em className="bc-faint">{tr('No description')}</em>}</span>
                                    <span className="ui-row__sub">
                                        {[i.sheetRow ? trf('Sheet row {n}', { n: i.sheetRow }) : '', i.autoNumber ? tr('numbered here') : '', i.description && i.description !== rowName(i) ? i.description : ''].filter(Boolean).join(' · ')}
                                    </span>
                                </span>
                                <span className="bc-cell ui-tnum">{sizeOf(i)}</span>
                                <span className="bc-cell bc-cell--num ui-tnum">{money(cleanNumberCell(i.price).value) || '—'}</span>
                                {rowCheck(i)}
                            </ItemRow>
                        ))}
                    </ItemList>

                    <p className="bc-summary ui-tnum">
                        <span>{trf('{n} rows', { n: items.length })}</span>
                        <span>{trf('Qty {n}', { n: totals.qty })}</span>
                        <span>{trf('MXN {total}', { total: money(totals.mxn) || '$0' })}</span>
                        <span>{trf('{n} photos on {rows}/{all} rows', { n: totals.photos, rows: totals.withPhotos, all: items.length })}</span>
                        {errorRows > 0 && <span data-tone="bad">{trf('{n} rows to fix', { n: errorRows })}</span>}
                    </p>
                </div>

                {narrow
                    ? <Drawer variant="overlay" open={!!currentId && !!current} onClose={() => setCurrentId(null)}
                        title={current ? <ItemTag item={tags.get(current.id)} workbook={BOOK} /> : ''} label={tr('Edit row')}>
                        {editor}
                    </Drawer>
                    : current && (
                        <Drawer title={<ItemTag item={tags.get(current.id)} workbook={BOOK} />} label={tr('Edit row')} className="bc-drawer">
                            {editor}
                        </Drawer>
                    )}
            </div>
        </div>
    );
}

/** A stable key per photo object, so reordering keeps each photo's DOM (and focus). */
const shotKeys = new WeakMap<object, string>();
let shotSeq = 0;
const shotKey = (m: object): string => {
    let k = shotKeys.get(m);
    if (!k) { k = `shot-${(shotSeq++).toString(36)}`; shotKeys.set(m, k); }
    return k;
};

function RowEditor({ item, vendor, tag, issues, suggestions, index, count, trayPick, onChange, onAddPhotos, onAttachPicked, onRemove, onStep }: {
    item: BatchCreateItem;
    vendor: string;
    tag: Record<string, unknown>;
    issues: RowIssue[];
    suggestions: Record<SuggestField, string[]>;
    index: number;
    count: number;
    trayPick: TrayPhoto | null;
    onChange: (patch: Partial<BatchCreateItem>) => void;
    onAddPhotos: () => void;
    onAttachPicked: () => void;
    onRemove: () => void;
    onStep: (delta: -1 | 1) => void;
}) {
    const uid = React.useId();
    const listId = (f: SuggestField) => `${uid}-${f}`;
    const set = (k: keyof BatchCreateItem) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [k]: e.target.value } as Partial<BatchCreateItem>);
    const numError = (f: NumericField) => (cleanNumberCell(item[f]).ok ? undefined : tr('Not a number'));
    const numberIssue = issues.find(x => x.kind === 'number');
    // The 17 book rate, as every book code; the codes are printed on the label.
    const codes = calculateCodesAndPrices(tag, DEFAULT_EXCHANGE_RATE, BATCH_WORKBOOK);
    const hasCodes = Number(tag.price_mxn) > 0;
    const code = (v?: string) => (v && v !== '-' && !v.includes('—') ? v : '—');

    const text = (k: SuggestField, label: string) => (
        <Field label={tr(label)}>
            <Input value={item[k]} onChange={set(k)} list={listId(k)} autoComplete="off" />
            <datalist id={listId(k)}>{suggestions[k].map(s => <option key={s} value={s} />)}</datalist>
        </Field>
    );
    const num = (k: NumericField, label: string) => (
        <Field label={tr(label)} error={numError(k)}>
            <Input value={item[k]} onChange={set(k)} inputMode="decimal" className="ui-tnum" />
        </Field>
    );

    const editorRef = React.useRef<HTMLDivElement>(null);
    /**
     * After a key that disappears or goes disabled (Previous on the first
     * row, the star on the new first photo, a removed photo's keys), put
     * focus on `selector` so it does not fall to <body>.
     */
    const keepFocus = (selector: string) => requestAnimationFrame(() => {
        const a = document.activeElement as HTMLButtonElement | null;
        if (a && a !== document.body && a.isConnected && !a.disabled) return;
        const root = editorRef.current;
        const target = root?.querySelector<HTMLElement>(selector)
            || root?.closest<HTMLElement>('[role="dialog"]');
        target?.focus();
    });

    const movePhoto = (from: number, to: number) => {
        const next = item.mediaFiles.slice();
        const [m] = next.splice(from, 1);
        next.splice(to, 0, m);
        onChange({ mediaFiles: next });
        keepFocus(`[data-shot="${shotKey(m)}"] [data-act="remove"]`);
    };

    const removePhoto = (k: number) => {
        const after = item.mediaFiles[k + 1] ?? item.mediaFiles[k - 1];
        onChange({ mediaFiles: item.mediaFiles.filter((_, j) => j !== k) });
        keepFocus(after ? `[data-shot="${shotKey(after)}"] [data-act="remove"]` : '[data-act="add-photos"]');
    };

    return (
        <div className="bc-editor" ref={editorRef}>
            <p className="bc-editor__where ui-tnum">
                {[item.sheetRow ? trf('Sheet row {n}', { n: item.sheetRow }) : '', trf('{i} of {n}', { i: index + 1, n: count }), vendor ? '' : tr('no vendor')].filter(Boolean).join(' · ')}
            </p>

            <div className="bc-fields">
                <Field label={tr('Item #')} error={numberIssue?.text}
                    hint={!numberIssue && item.autoNumber ? tr('Numbered here: the sheet had no #') : undefined}>
                    <Input value={item.itemNumber} inputMode="numeric" className="ui-tnum"
                        onChange={(e) => onChange({ itemNumber: e.target.value.trim(), autoNumber: false })} />
                </Field>
                {num('quantity', 'Qty')}
                {text('shape', 'Shape')}
                {text('itemType', 'Type')}
                {text('color', 'Vendor colour')}
                {text('material', 'Material')}
                {num('widthCm', 'W cm')}
                {num('heightCm', 'H cm')}
                {num('lengthCm', 'D cm')}
                {num('weightKg', 'Kg')}
                {num('price', 'Price MXN')}
                <Field label={tr('Vendor note')} className="bc-fields__wide">
                    <Input value={item.description} onChange={set('description')} />
                </Field>
            </div>

            <p className="bc-codes ui-tnum" aria-label={tr('Book codes at the book rate of 17')}>
                <span>{tr('AQ')} <b>{hasCodes ? code(codes.bookAqCode) : '—'}</b></span>
                <span>{tr('LD')} <b>{hasCodes ? code(codes.bookLandCode) : '—'}</b></span>
                <span>{tr('Landed')} <b>{hasCodes ? `$${codes.bookLanded}` : '—'}</b></span>
                <span>{tr('Retail')} <b>{hasCodes ? `$${codes.bookRetail}` : '—'}</b></span>
            </p>

            <Field group label={tr('Photos')} aside={item.mediaFiles.length ? trf('{n} · the first is the hero', { n: item.mediaFiles.length }) : undefined}>
                <div className="bc-shots">
                    {item.mediaFiles.map((m, k) => (
                        <div key={shotKey(m)} data-shot={shotKey(m)} className="bc-shot">
                            {m.localUrl ? <Thumb src={m.localUrl} size="xl" alt={m.name || `${tr('Photo')} ${k + 1}`} /> : <span className="ui-thumb ui-thumb--xl bc-thumb--empty" />}
                            <span className="bc-shot__acts">
                                {k > 0 && <Key iconOnly size="sm" variant="quiet" icon={<Star size={12} />} label={tr('Make it the first photo')} onClick={() => movePhoto(k, 0)} />}
                                <Key iconOnly size="sm" variant="quiet" icon={<X size={12} />} label={trf('Remove {name}', { name: m.name || `${tr('Photo')} ${k + 1}` })}
                                    data-act="remove" onClick={() => removePhoto(k)} />
                            </span>
                        </div>
                    ))}
                    {!item.mediaFiles.length && <span className="bc-faint">{tr('No photo yet. Drop files on the row, or add them here.')}</span>}
                </div>
                <div className="bc-shots__keys">
                    <Key size="sm" icon={<ImagePlus size={12} />} data-act="add-photos" onClick={onAddPhotos}>{tr('Add photos')}</Key>
                    {trayPick && <Key size="sm" icon={<Images size={12} />} onClick={onAttachPicked} title={trayPick.file.name}>{tr('Attach picked photo')}</Key>}
                </div>
            </Field>

            {issues.length > 0 && (
                <ul className="bc-issues bc-issues--row" aria-label={tr('Checks for this row')}>
                    {issues.map((x, k) => <li key={k} data-level={x.level}>{x.text}</li>)}
                </ul>
            )}

            <div className="bc-editor__foot">
                <Key size="sm" variant="quiet" icon={<ChevronLeft size={13} />} disabled={index <= 0} data-nav="prev"
                    onClick={() => { onStep(-1); keepFocus('[data-nav="next"]'); }}>{tr('Previous')}</Key>
                <Key size="sm" variant="quiet" icon={<ChevronRight size={13} />} disabled={index >= count - 1} data-nav="next"
                    onClick={() => { onStep(1); keepFocus('[data-nav="prev"]'); }}>{tr('Next')}</Key>
                <span className="ui-grow" />
                <Key size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => { onRemove(); keepFocus('[data-nav]:not(:disabled)'); }}>{tr('Remove row')}</Key>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 · the import
// ─────────────────────────────────────────────────────────────────────────────

const STATE_VIEW: Record<ImportRowState, { state: ItemState; label: string }> = {
    queued: { state: 'queued', label: 'Waiting' },
    uploading: { state: 'running', label: 'Uploading' },
    creating: { state: 'running', label: 'Creating' },
    created: { state: 'saved', label: 'Created' },
    partial: { state: 'partial', label: 'Photos missing' },
    failed: { state: 'failed', label: 'Not created' },
    skipped: { state: 'skipped', label: 'Not created' },
};

const RESULT_COLUMNS = '118px 52px minmax(0, 1fr) 96px 112px minmax(0, 1.2fr)';

function ImportStep({ state, left, aiEnabled, onStop, onHandOff, onDone }: {
    state: ImportState;
    /** Rows still in the batch (the ones that were not created). */
    left: number;
    aiEnabled: boolean;
    onStop: () => void;
    onHandOff: (autoRun: boolean) => void;
    onDone: () => void;
}) {
    const rows = state.rows;
    const count = (s: ImportRowState[]) => rows.filter(r => s.includes(r.state)).length;
    const created = count(['created', 'partial']);
    const failed = count(['failed']);
    const skipped = count(['skipped']);
    const counts: Partial<Record<ItemState, number>> = {
        queued: count(['queued']),
        running: count(['uploading', 'creating']),
        saved: count(['created']),
        partial: count(['partial']),
        failed,
        skipped,
    };
    const willRun = aiEnabled && (state.processes.length > 0) && created > 0;
    const photoProblems = rows.filter(r => r.photoFailures.length);
    const stoppedNote = state.phase === 'stopped' ? tr('Stopped. Rows already created stay created.') : '';

    const note = state.running
        ? state.phase === 'upload'
            ? trf('Uploading photos {done} / {total}', state.upload)
            : trf('Creating rows {done} / {total}', { done: created + failed, total: rows.length })
        : stoppedNote || trf('{created} created · {failed} not created', { created, failed: failed + skipped });

    const detail = (r: ImportRow) => {
        if (r.state === 'failed' || r.state === 'skipped') return <span className="bc-bad">{r.reason}</span>;
        if (r.photoFailures.length) return <span className="bc-warn" title={r.photoFailures.join('\n')}>{r.photoFailures.join(' · ')}</span>;
        if (r.row) return <span className="bc-faint">{trf('{n} photos · {status}', { n: r.photoCount, status: String(el(String(r.row.status || ''))) })}</span>;
        return <span className="bc-faint">{r.photoCount ? trf('{n} photos', { n: r.photoCount }) : tr('No photo')}</span>;
    };

    return (
        <div className="ui-root bc">
            <header className="ui-bar bc-bar">
                <div className="bc-bar__title">
                    <h2>{state.running ? tr('Creating items…') : state.phase === 'stopped' ? tr('Import stopped') : tr('Import finished')}</h2>
                    <small className="ui-tnum">{trf('{vendor} · book {book} · {n} rows', { vendor: state.vendor, book: BOOK, n: rows.length })}</small>
                </div>
                <span className="ui-grow" />
                {state.running ? (
                    <Key variant="stop" icon={<Square size={12} />} onClick={onStop}
                        title={tr('Stop after the current row; created rows stay')}>{tr('Stop')}</Key>
                ) : (
                    <>
                        {left > 0 && <Key variant="quiet" icon={<ChevronLeft size={13} />} onClick={onDone}>{trf('Back to the {n} not created', { n: left })}</Key>}
                        {created > 0 && (
                            <Key variant={willRun ? 'quiet' : 'default'} onClick={() => onHandOff(false)}
                                title={tr('Open the created items in the Catalog Hub without starting a run')}>
                                {tr('Open in Catalog Hub')}
                            </Key>
                        )}
                        {willRun && (
                            <Key variant="go" icon={<Bot size={13} />} onClick={() => onHandOff(true)}
                                title={tr('Run the picked processes in the Catalog Hub, then review and save them there')}>
                                {trf('Run AI on {n} in Catalog Hub', { n: created })}
                            </Key>
                        )}
                        <Key variant={willRun ? 'default' : 'go'} onClick={onDone}>{left > 0 ? tr('Done') : tr('Done · new batch')}</Key>
                    </>
                )}
            </header>

            <div className="bc-runbar">
                <RunBar counts={counts} total={rows.length} note={note} />
            </div>

            {state.error && <p className="bc-alert" role="alert"><AlertTriangle size={14} aria-hidden="true" /> {state.error}</p>}
            {!state.running && failed + skipped > 0 && (
                <p className="bc-alert bc-alert--warn" role="status">
                    {trf('{n} rows were not created. They stay in the batch with their reason: fix them and create them again.', { n: failed + skipped })}
                </p>
            )}
            {!state.running && photoProblems.length > 0 && (
                <p className="bc-alert bc-alert--warn" role="status">
                    {trf('{n} rows were created without some photos (listed below). Add them in Edit Entry.', { n: photoProblems.length })}
                </p>
            )}
            {!state.running && created > 0 && !willRun && (
                <p className="bc-alert bc-alert--info" role="status">
                    {aiEnabled ? tr('No AI process was picked. Open the items in the Catalog Hub to run some later.') : tr('AI processes are off; the items were created without AI content.')}
                </p>
            )}

            <ItemList label={tr('Import results')} columns={RESULT_COLUMNS} className="bc-list bc-list--results"
                header={[tr('Item'), tr('Photo'), tr('Description'), tr('MXN'), tr('State'), tr('Detail')]}>
                {rows.map(r => {
                    const view = STATE_VIEW[r.state];
                    const tag = r.row ?? r.tag;
                    return (
                        <ItemRow key={r.key} label={`${r.itemId} ${r.name}`} className="bc-row--static">
                            <ItemTag item={tag} workbook={BOOK} />
                            {r.preview ? <Thumb src={r.preview} alt={r.name} /> : <span className="bc-faint">—</span>}
                            <span className="ui-row__main">
                                <span className="ui-row__title">{r.name || <em className="bc-faint">{tr('No description')}</em>}</span>
                                <span className="ui-row__sub">{[r.itemId, r.sheetRow ? trf('Sheet row {n}', { n: r.sheetRow }) : ''].filter(Boolean).join(' · ')}</span>
                            </span>
                            <span className="bc-cell bc-cell--num ui-tnum">{money(r.price) || '—'}</span>
                            <span title={r.reason || undefined}><StatusPill state={view.state} label={tr(view.label)} /></span>
                            <span className="bc-cell bc-detail">{detail(r)}</span>
                        </ItemRow>
                    );
                })}
            </ItemList>
        </div>
    );
}
