/**
 * The run engine: one RUN ITEM per inventory item, and the useAiRun hook.
 *
 * The Catalog Hub queued one op per PHOTO and let each screen invent the
 * rest: an item with three photos was three cards with three statuses, the
 * hero's text was copied onto its siblings through setQueue, a cancelled op
 * showed as failed, a finished run had no idea which processes had actually
 * worked, and "stop" only stopped the workers from picking up the next card
 * while the in-flight requests carried on billing. Batch Create and the
 * variation pass each had their own loop, concurrency and abort flag.
 *
 * Here the unit is the item. Inside it, one BatchOp per photo goes to the
 * existing per-photo workers (processSingleItem / processVariationItem stay
 * exactly what they are): the hero photo runs the text processes and the
 * image processes, the other photos run the image processes only, and an
 * item with no photograph goes to the donor (variation) path. The engine
 * folds the ops back into one status per item and one status per process,
 * with the per-photo outputs (clean PNG, cutout, matte, outline) laid out for
 * a media viewer, and saves through lib/ai/persist only what was ticked and
 * worked, plus what a person typed.
 *
 * Gemini concurrency is NOT decided here. Every request already takes a slot
 * of the shared limiter inside lib/ai/client and bgReplace, whichever screen
 * made it; wrapping a whole op in a limiter slot as well would hold a slot
 * while the op's own request waits for one, and four text-heavy ops would
 * deadlock the text class. The engine only caps how many photo ops run at
 * once (RUN_CONCURRENCY), which bounds the local work -- imgly on the GPU,
 * canvas tracing, uploads -- that the limiter knows nothing about.
 *
 * The state is a pure reducer (runReducer) behind a tiny store, so the logic
 * can be exercised without React; useAiRun adds the worker pool, abort
 * plumbing and save calls on top.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useWorkGuard } from '../useWorkGuard';
import { tr, trf } from '../i18n';
import {
    processSingleItem,
    processVariationItem,
    buildDonorPool,
    type BatchOp,
    type PipelineContext,
    type ProcessingMode,
} from '../catalogHubPipeline';
import type { BgQuality } from '../bgReplace';
import type { DonorCandidate } from '../variationMatch';
import { collectAllImages, getCleanImageUrl, normalizeInventoryData } from '../utils';
import { supabase } from '../supabase';
import { hasGeminiKey } from './keys';
import { AiCancelledError, AiKeyMissingError, AiTimeoutError, aiErrorMessage, type AiErrorCode } from './errors';
import { toPipelineItem, type PipelineItem } from './item';
import {
    aiResultFromOps,
    buildAiPatch,
    isEmptyPatch,
    saveAiPatch,
    type AiItemResult,
    type AiPatch,
    type InventoryRow,
    type ProcessId,
} from './persist';

export type { ProcessId } from './persist';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * queued   waiting for a run (never run, or put back by Stop)
 * running  at least one of its photo ops is queued or in flight
 * review   the run finished and every selected process worked: a person looks next
 * partial  the run finished, some processes worked and some did not (also to review)
 * failed   nothing that was asked for worked
 * skipped  nothing to do: no applicable process, no donor, cancelled, or rejected
 * done     accepted by a person; what save('reviewed') writes
 * saved    written to the database
 */
export type RunItemStatus = 'queued' | 'running' | 'done' | 'partial' | 'failed' | 'skipped' | 'review' | 'saved';

/** One process of one item. 'partial': it worked on some photos and failed on others. */
export type RunProcessStatus = 'queued' | 'running' | 'done' | 'partial' | 'failed' | 'skipped';

/** idle: built, never launched. queued: waiting for a worker. settled: the worker returned. */
export type RunOpState = 'idle' | 'queued' | 'running' | 'settled';

export type RunInterrupt = 'stop' | 'cancel';

export interface RunMedia {
    /** Position among the item's still photos (spatial_masks.angle_N); videos follow the stills. */
    index: number;
    url: string;
    isVideo: boolean;
}

/** What the database already holds for one photo, so a viewer can show it before (or without) a run. */
export interface StoredPhotoMedia {
    cleanedUrl?: string;
    cutoutUrl?: string;
    matteUrl?: string;
    svgUrl?: string;
}

export interface RunOp {
    id: string;
    kind: 'photo' | 'donor';
    /** RunMedia.index; 0 for the donor op. */
    index: number;
    state: RunOpState;
    /** Every process asked of this op since its item was last launched fresh. */
    planned: ProcessId[];
    /** The processes of the latest launch (a retry asks only for what failed). */
    current: ProcessId[];
    /** The pipeline's view: result, progress, stepLabel, logs are not kept here. */
    op: BatchOp;
    /** Terminal per-process outcome, merged across launches. */
    status: Partial<Record<ProcessId, RunProcessStatus>>;
    errors: Partial<Record<ProcessId, string>>;
    /** The last "[ FAIL ]" line, the only reason some failures give. */
    lastFail?: string;
    /** The last "[ WAIT ]" line, the most useful stage label the pipeline gives. */
    lastWait?: string;
    error?: string;
    interrupted?: RunInterrupt;
    startedAt?: number;
    settledAt?: number;
}

/** One photo, ready for a MediaViewer: Photo / Clean PNG / Mask / SVG / Axo. */
export interface RunPhoto {
    index: number;
    sourceUrl: string;
    isVideo: boolean;
    isHero: boolean;
    opId?: string;
    status: RunProcessStatus;
    progress: number;
    stepLabel?: string;
    /** Background-replaced photo (bgreplace), or the transparent cutout (cut-out modes). */
    cleanedUrl?: string;
    /** Transparent PNG of the piece alone. */
    cutoutUrl?: string;
    /** Black-and-white matte of the piece. */
    matteUrl?: string;
    /** For a Mask tab: the matte, or the cutout when no matte was produced. */
    maskUrl?: string;
    /** Outline as SVG markup. */
    outlineSvg?: string;
    /** The outline as an <img>-able URL: the uploaded file, or a data: URL of outlineSvg. */
    svgUrl?: string;
    width?: number;
    height?: number;
    /** Semantic layers found by cloud/hybrid segmentation (mirror glass etc.). */
    layerCount?: number;
    /** True when this run produced anything for this photo. */
    generated: boolean;
    /** What is stored for this photo already. */
    stored: StoredPhotoMedia;
}

export interface RunText {
    title?: string;
    html?: string;
    colors?: string[];
    genType?: string;
}

/** A person's edit. null clears that edit (back to the generated value). */
export interface RunEditPatch {
    title?: string | null;
    html?: string | null;
    colors?: string[] | null;
    genType?: string | null;
}

export interface RunHexMap {
    hexString: string;
    bitmapUrl?: string;
    cols: number;
    rows: number;
}

export interface RunItem {
    /** The inventory uuid when there is one; save() needs it. */
    id: string;
    rowId?: string;
    /** The row the engine reads: as handed in (raw or normalized), then the stored row after a save. */
    row: any;
    /** The row last handed in through `items`, which a sync compares against. */
    source: any;
    item: PipelineItem;
    /** VENDOR-NNN, or the vendor text, for logs and toasts. */
    label: string;
    media: RunMedia[];
    stored: {
        photos: StoredPhotoMedia[];
        hexMap?: RunHexMap;
        axoIconUrl?: string;
    };
    status: RunItemStatus;
    /** The selection the item last ran with. */
    selected: ProcessId[];
    /** The selected processes that apply to this item (photos, videos, donor). */
    planned: ProcessId[];
    path: 'photo' | 'donor' | 'none';
    ops: RunOp[];
    /** Derived: per process, across photos. Selected-but-not-applicable shows 'skipped'. */
    processStatus: Partial<Record<ProcessId, RunProcessStatus>>;
    processErrors: Partial<Record<ProcessId, string>>;
    progress: number;
    stage?: string;
    logs: string[];
    photos: RunPhoto[];
    /** What the run generated (only processes that worked). */
    generated: RunText;
    /** generated with the person's edits on top: what save() writes. */
    text: RunText;
    edits: RunText;
    /** The edits as they were at the last successful save. */
    savedEdits: RunText;
    hexMap?: RunHexMap;
    axoIconUrl?: string;
    /**
     * Derived: a planned process worked (done or partial) and is not in
     * savedProcesses, i.e. generated results that have not been saved yet.
     */
    unsavedRun: boolean;
    /**
     * Processes whose current results were written by the last successful
     * save. A launch that re-runs a process takes it out again. save() sends
     * only the rest (plus changed edits), so a second save after an edit does
     * not rewrite, and re-upload, every image column.
     */
    savedProcesses: ProcessId[];
    /** Derived: unsavedRun, or edits made since the last save. */
    dirty: boolean;
    saving: boolean;
    rejected: boolean;
    interrupted?: RunInterrupt;
    warnings: string[];
    /** Item-level failure (no photo could be read, save failed...). */
    error?: string;
    startedAt?: number;
    finishedAt?: number;
    savedAt?: number;
}

export interface RunError {
    code: AiErrorCode;
    message: string;
}

export interface RunState {
    items: Record<string, RunItem>;
    order: string[];
    /** opId -> item id, for routing the pipeline's callbacks. */
    opIndex: Record<string, string>;
    /** The items of the run in progress (or the last one), for overall progress. */
    runIds: string[];
    /** Finished-op timings, for the ETA. */
    timing: { count: number; totalMs: number };
    runError: RunError | null;
    saving: boolean;
}

export interface RunCounts extends Record<RunItemStatus, number> {
    total: number;
    /** review + partial: the "Needs review" filter. */
    needsReview: number;
    unsaved: number;
}

export interface LaunchSpec {
    opId: string;
    itemId: string;
    kind: 'photo' | 'donor';
    op: BatchOp;
}

export type SaveOutcomeKind = 'saved' | 'incomplete' | 'empty' | 'failed' | 'skipped';

export interface SaveOutcome {
    itemId: string;
    label: string;
    /**
     * saved       written, nothing missing
     * incomplete  written, but some uploads failed and their columns were
     *             left out: that work is NOT saved and the item stays unsaved
     * empty       nothing to write
     * failed      the write failed (error says why)
     * skipped     running, unknown, or no row id
     */
    outcome: SaveOutcomeKind;
    warnings: string[];
    error?: string;
    columns?: string[];
}

export type RunAction =
    | { type: 'sync'; rows: readonly any[] }
    | { type: 'launch'; items: RunItem[]; specs: LaunchSpec[]; fresh: boolean; at: number }
    | { type: 'skip'; itemId: string; reason: string; selected: ProcessId[] }
    | { type: 'op-start'; opId: string; at: number }
    | { type: 'op-update'; opId: string; updates: Partial<BatchOp> | ((prev: BatchOp) => Partial<BatchOp>) }
    | { type: 'op-log'; opId: string; text: string }
    | { type: 'op-settled'; opId: string; at: number; error?: string; interrupted?: RunInterrupt }
    | { type: 'accept'; itemId: string }
    | { type: 'reject'; itemId: string }
    | { type: 'edit'; itemId: string; patch: RunEditPatch }
    | { type: 'log'; itemId: string; text: string }
    | { type: 'manual-cutout'; itemId: string; index: number; dataUrl: string; at: number }
    | { type: 'reset'; itemId: string; row?: any }
    | { type: 'save-start'; itemId: string }
    | { type: 'save-done'; itemId: string; outcome: SaveOutcome; savedRow?: InventoryRow | null; patch?: AiPatch; processes?: ProcessId[] }
    | { type: 'saving'; value: boolean }
    | { type: 'run-error'; error: RunError | null };

// ─────────────────────────────────────────────────────────────────────────────
// Process groups
// ─────────────────────────────────────────────────────────────────────────────

export const TEXT_PROCESSES: readonly ProcessId[] = ['title_desc', 'marketing_desc', 'dominant_colors', 'product_type'];
/** Run on every still photo. */
export const IMAGE_PROCESSES: readonly ProcessId[] = ['img_clean', 'image_segmentation'];
/** Run once, on the hero photo: they belong to the item, not to a photo. */
export const HERO_PROCESSES: readonly ProcessId[] = [...TEXT_PROCESSES, 'hex_map'];

/**
 * The order processSingleItem works in. It reports a process only when it
 * finishes, so while an op runs, its first unfinished stage is shown as
 * running and the rest as queued: close enough for a steps strip.
 */
const STAGES: readonly (readonly ProcessId[])[] = [
    ['video_proc'],
    ['variation_donor', ...TEXT_PROCESSES],
    ['img_clean'],
    ['image_segmentation'],
    ['hex_map'],
];

const EDIT_PROCESS: Record<keyof RunText, ProcessId> = {
    title: 'title_desc',
    html: 'marketing_desc',
    colors: 'dominant_colors',
    genType: 'product_type',
};

/** The pipeline's own test (catalogHubPipeline isVideo), so the two never disagree. */
const VIDEO_RE = /\.(mp4|mov|avi|webm|mkv)(\?|$)/i;

const LOG_CAP = 400;
export const RUN_CONCURRENCY = 3;

const KEY_MISSING_MESSAGE = new AiKeyMissingError().message;
const CANCELLED_MESSAGE = new AiCancelledError().message;

/**
 * The pipeline hands back error MESSAGES (processErrors), not the typed
 * errors, so the class is recovered from the message each class writes.
 */
export function errorCodeOf(message: string | undefined | null): AiErrorCode | null {
    if (!message) return null;
    if (message === KEY_MISSING_MESSAGE) return 'key_missing';
    if (message === CANCELLED_MESSAGE) return 'cancelled';
    if (/quota or rate limit/i.test(message)) return 'quota';
    if (/did not answer within/i.test(message)) return 'timeout';
    return 'response';
}

/** Does this selection, in this mode, call Gemini at all? hex_map and local cut-outs do not. */
export function needsGeminiKey(processes: Iterable<ProcessId>, mode: ProcessingMode, donorPath = false): boolean {
    for (const p of processes) {
        if (TEXT_PROCESSES.includes(p) || p === 'variation_donor' || p === 'video_proc') return true;
        // bgreplace repaints with Gemini; AI mask and hybrid cut the piece out
        // with Gemini segmentation even when image_segmentation is not ticked.
        if (p === 'img_clean' && (mode === 'bgreplace' || mode === 'cloud' || mode === 'hybrid')) return true;
        if (p === 'image_segmentation' && (mode === 'cloud' || mode === 'hybrid')) return true;
        if (donorPath && p !== 'hex_map') return true;
    }
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Building items from rows
// ─────────────────────────────────────────────────────────────────────────────

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

const parseJsonObject = (raw: unknown): Record<string, any> => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try { return JSON.parse(raw); } catch { return {}; }
    }
    return {};
};

const parseMasks = (raw: unknown): Record<string, any> => {
    let v = raw;
    if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch { return {}; }
    }
    if (Array.isArray(v)) return v.length ? { angle_0: v } : {};
    return v && typeof v === 'object' ? (v as Record<string, any>) : {};
};

const urlOrUndef = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export const rowOf = (source: any): any =>
    source?.data && typeof source.data === 'object' ? source.data : (source || {});

/**
 * The key an item is tracked by: the inventory uuid, never item_id alone
 * (VENDOR-NNN repeats across workbooks).
 */
export function runItemKey(source: any): string {
    const raw = rowOf(source);
    const id = str(raw.id ?? source?.id);
    if (id) return id;
    const n = normalizeInventoryData(raw);
    return `${str(n.itemId) || str(raw.row ?? source?.row) || 'item'}@${str(n.workbook)}`;
}

/**
 * Stills first, videos after. The hero must be a still, because only the
 * hero runs the text call and processSingleItem never reads text off a video.
 * The processed map's generated clip (videoGen) is output, not a source.
 * A Drive video cleans to a URL with no extension, which the pipeline would
 * take for an image; it is left out rather than fed to resizeImage.
 */
export function mediaOf(normalized: any): RunMedia[] {
    const base = { ...normalized, videoGen: undefined };
    let stills: string[] = [];
    let all: string[] = [];
    try {
        stills = collectAllImages(base, { dropVideos: true });
        all = collectAllImages(base);
    } catch { /* a malformed media field leaves the item photo-less */ }
    const stillSet = new Set(stills);
    const videos = all.filter(u => !stillSet.has(u) && VIDEO_RE.test(u));
    return [
        ...stills.map((url, index) => ({ index, url, isVideo: false })),
        ...videos.map((url, i) => ({ index: stills.length + i, url, isVideo: true })),
    ];
}

function storedOf(raw: any, n: any, media: RunMedia[]): RunItem['stored'] {
    const map = parseJsonObject(raw.processed_media_urls ?? n.processedMediaUrls);
    const masks = parseMasks(raw.spatial_masks ?? n.spatialMasks);
    const photos = media.map(m => {
        if (m.isVideo) return {};
        const angle = Array.isArray(masks[`angle_${m.index}`]) ? masks[`angle_${m.index}`][0] : undefined;
        const out: StoredPhotoMedia = {
            cleanedUrl: urlOrUndef(map[getCleanImageUrl(m.url) || m.url]) ?? urlOrUndef(map[m.url]),
            cutoutUrl: urlOrUndef(angle?.mask),
            matteUrl: urlOrUndef(angle?.matte),
            svgUrl: urlOrUndef(angle?.svg),
        };
        if (m.index === 0) {
            out.cutoutUrl = out.cutoutUrl ?? urlOrUndef(n.generatedPngUrl);
            out.svgUrl = out.svgUrl ?? urlOrUndef(n.generatedSvgUrl);
        }
        return out;
    });

    let hexMap: RunHexMap | undefined;
    let points: any = raw.spatial_points ?? n.spatialPoints;
    if (typeof points === 'string') { try { points = JSON.parse(points); } catch { points = null; } }
    const pm = Array.isArray(points) ? points.find((p: any) => p?.type === 'pixel_map' || p?.hex_string) : null;
    if (pm?.hex_string) {
        hexMap = { hexString: String(pm.hex_string), bitmapUrl: urlOrUndef(pm.bitmap_url), cols: Number(pm.cols) || 20, rows: Number(pm.rows) || 20 };
    }
    return { photos, hexMap, axoIconUrl: urlOrUndef(raw.axo_icon_url ?? raw.axoIconUrl) };
}

/** A fresh, never-run item for a row. */
export function buildRunItem(source: any): RunItem {
    const raw = rowOf(source);
    const n = normalizeInventoryData(raw);
    const item = toPipelineItem(source);
    const media = mediaOf(n);
    const id = runItemKey(source);
    const base: RunItem = {
        id,
        rowId: item.id,
        row: source,
        source,
        item,
        label: item.itemId || item.vendorText || id,
        media,
        stored: storedOf(raw, n, media),
        status: 'queued',
        selected: [],
        planned: [],
        path: media.some(m => !m.isVideo) ? 'photo' : 'none',
        ops: [],
        processStatus: {},
        processErrors: {},
        progress: 0,
        logs: [],
        photos: [],
        generated: {},
        text: {},
        edits: {},
        savedEdits: {},
        unsavedRun: false,
        savedProcesses: [],
        dirty: false,
        saving: false,
        rejected: false,
        warnings: [],
    };
    return summarizeItem(base);
}

/** The image outputs of an op, which belong to its photo and to nothing else. */
const PHOTO_RESULT_KEYS = [
    'cleanedUrl', 'cleanedKey', 'cutoutUrl', 'maskUrl', 'matteUrl', 'outlineSvg', 'svgUrl',
    'localSegmentationMasks', 'cloudSegmentationMasks', 'segmentation', 'videoGen', 'processedMap',
] as const;
const PHOTO_PROCESSES: readonly ProcessId[] = [...IMAGE_PROCESSES, 'video_proc'];

/**
 * Re-pair settled photo ops with the photos after the list changed (a photo
 * removed, reordered or added since the run). Ops follow their photo by URL,
 * not by position, so outputs never land under another photo, angle_N follows
 * the photo and the hero cutout is the current first photo's.
 *
 * An op whose photo is gone loses its image outputs. If it also carried the
 * item's text (it was the hero), it is kept off the photo list (index -1,
 * no image url) so that text is not lost; otherwise it is dropped.
 */
function reconcileOps(ops: RunOp[], before: readonly RunMedia[], after: readonly RunMedia[]): RunOp[] {
    const sig = (m: readonly RunMedia[]) => m.map(x => x.url).join('\n');
    if (!ops.length || sig(before) === sig(after)) return ops;
    const byUrl = new Map<string, RunMedia>();
    for (const m of after) {
        byUrl.set(m.url, m);
        const clean = getCleanImageUrl(m.url);
        if (clean && !byUrl.has(clean)) byUrl.set(clean, m);
    }
    const out: RunOp[] = [];
    for (const o of ops) {
        if (o.kind === 'donor' || o.state !== 'settled') { out.push(o); continue; }
        const url = o.op.imageUrl || '';
        const m = url ? (byUrl.get(url) || byUrl.get(getCleanImageUrl(url) || '')) : undefined;
        if (m) {
            out.push(m.index === o.index ? o : { ...o, index: m.index, op: { ...o.op, imageIndex: m.index, imageUrl: m.url } });
            continue;
        }
        const planned = o.planned.filter(p => !PHOTO_PROCESSES.includes(p));
        if (!planned.length) continue;
        const result = { ...(o.op.result || {}) } as Record<string, unknown>;
        PHOTO_RESULT_KEYS.forEach(k => { delete result[k]; });
        const status = { ...o.status };
        const errors = { ...o.errors };
        PHOTO_PROCESSES.forEach(p => { delete status[p]; delete errors[p]; });
        out.push({
            ...o, index: -1, planned, current: o.current.filter(p => planned.includes(p)), status, errors,
            op: { ...o.op, imageIndex: -1, imageUrl: '', result: result as BatchOp['result'] },
        });
    }
    return out;
}

/** Re-read a row (after a sync or a save) without losing the run's ops. */
function refreshRow(prev: RunItem, row: any, fromSync: boolean): RunItem {
    const fresh = buildRunItem(row);
    return summarizeItem({
        ...prev,
        row,
        source: fromSync ? row : prev.source,
        rowId: fresh.rowId ?? prev.rowId,
        item: fresh.item,
        label: fresh.label,
        media: fresh.media,
        stored: fresh.stored,
        ops: reconcileOps(prev.ops, prev.media, fresh.media),
    });
}

/**
 * Same row, shallowly. Screens often rebuild their row array (and the
 * { id, data } wrappers) on every render; re-deriving every item each time
 * would re-render forever.
 */
function sameRow(a: any, b: any): boolean {
    if (a === b) return true;
    const ra = rowOf(a);
    const rb = rowOf(b);
    if (ra === rb) return true;
    const ka = Object.keys(ra);
    if (ka.length !== Object.keys(rb).length) return false;
    return ka.every(k => ra[k] === rb[k]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Planning a launch (pure)
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanOptions {
    processingMode: ProcessingMode;
    /** Distinguishes this launch's op ids from the last one's, so a late callback from a stopped op is ignored. */
    seq: number;
    /** Plan the first still only (plus videos); the other photos are left alone. */
    heroOnly?: boolean;
}

interface PlannedOp {
    kind: 'photo' | 'donor';
    index: number;
    imageUrl: string;
    processes: ProcessId[];
}

/**
 * Which op runs what, for a selection.
 *
 * Photo items: the hero runs the selected text processes, img_clean,
 * image_segmentation and hex_map; the other stills run img_clean and
 * image_segmentation; videos run video_proc. Photo-less items: one donor op
 * for the selected text processes (plus variation_donor when ticked, which is
 * what lets the writer also store the axonometric icon), and the videos.
 * variation_donor on an item that has photos does not apply.
 */
export function planOps(item: Pick<RunItem, 'media'>, selected: ReadonlySet<ProcessId>, opts: { heroOnly?: boolean } = {}): PlannedOp[] {
    const pick = (ids: readonly ProcessId[]) => ids.filter(p => selected.has(p));
    const stills = item.media.filter(m => !m.isVideo);
    // Hero-only is a deliberate economy (about half the images of a run),
    // never the default: the other stills are simply not planned.
    const planStills = opts.heroOnly ? stills.filter(m => m.index === 0) : stills;
    const videos = item.media.filter(m => m.isVideo);
    const out: PlannedOp[] = [];
    if (stills.length > 0) {
        planStills.forEach(m => {
            const processes = m.index === 0 ? pick([...HERO_PROCESSES, ...IMAGE_PROCESSES]) : pick(IMAGE_PROCESSES);
            if (processes.length) out.push({ kind: 'photo', index: m.index, imageUrl: m.url, processes });
        });
    } else {
        const processes = pick(['variation_donor', ...TEXT_PROCESSES]);
        if (processes.length) out.push({ kind: 'donor', index: 0, imageUrl: '', processes });
    }
    videos.forEach(m => {
        const processes = pick(['video_proc']);
        if (processes.length) out.push({ kind: 'photo', index: m.index, imageUrl: m.url, processes });
    });
    return out;
}

const opIdFor = (itemId: string, kind: 'photo' | 'donor', index: number, seq: number) =>
    `${itemId}#${kind === 'donor' ? 'd' : 'p'}${index}@${seq}`;

function makeBatchOp(item: RunItem, opId: string, p: { kind: 'photo' | 'donor'; index: number; imageUrl: string }, processes: ProcessId[], mode: ProcessingMode, base?: { result?: BatchOp['result']; status?: RunOp['status']; errors?: RunOp['errors'] }): BatchOp {
    // The pipeline starts from op.processStatus and reports only what it
    // marks on top, so the earlier outcomes of the processes NOT re-run are
    // passed in and the re-run ones are left out.
    const processStatus: BatchOp['processStatus'] = {};
    for (const [k, v] of Object.entries(base?.status || {})) {
        if (processes.includes(k as ProcessId)) continue;
        if (v === 'done' || v === 'failed' || v === 'skipped') processStatus[k as ProcessId] = v;
    }
    const processErrors: BatchOp['processErrors'] = {};
    for (const [k, v] of Object.entries(base?.errors || {})) {
        if (!processes.includes(k as ProcessId) && v) processErrors[k as ProcessId] = v;
    }
    return {
        id: opId,
        item: item.row,
        imageIndex: p.index,
        imageUrl: p.imageUrl,
        status: 'idle',
        progress: 0,
        logs: [],
        processingMode: mode,
        processes: new Set(processes),
        processStatus,
        processErrors,
        // Asked for again means done again: without this, bgreplace finds its
        // own cache key and only logs "Background already replaced".
        forceRecleanImage: processes.includes('img_clean'),
        needsVariation: p.kind === 'donor',
        result: { ...(base?.result || {}) },
    };
}

/** A fresh launch of the whole selection: earlier outputs are dropped. */
export function planFreshLaunch(item: RunItem, selected: ReadonlySet<ProcessId>, opts: PlanOptions): { item: RunItem; specs: LaunchSpec[] } {
    const plan = planOps(item, selected, { heroOnly: opts.heroOnly });
    const planned = Array.from(new Set(plan.flatMap(p => p.processes)));
    const ops: RunOp[] = plan.map(p => {
        const id = opIdFor(item.id, p.kind, p.index, opts.seq);
        return {
            id,
            kind: p.kind,
            index: p.index,
            state: 'queued',
            planned: p.processes,
            current: p.processes,
            op: makeBatchOp(item, id, p, p.processes, opts.processingMode),
            status: {},
            errors: {},
        };
    });
    const next: RunItem = {
        ...item,
        selected: Array.from(selected),
        planned,
        path: item.media.some(m => !m.isVideo) ? 'photo' : plan.some(p => p.kind === 'donor') ? 'donor' : 'none',
        ops,
        // The ops are new and hold no result yet: nothing of them is saved.
        savedProcesses: [],
        status: ops.length ? 'running' : 'skipped',
        rejected: false,
        interrupted: undefined,
        error: undefined,
        warnings: [],
        progress: 0,
    };
    return {
        item: summarizeItem(next),
        specs: ops.map(o => ({ opId: o.id, itemId: item.id, kind: o.kind, op: o.op })),
    };
}

/**
 * A retry: per op, the processes that failed, were left queued by Stop, or
 * were cancelled -- or, with `only`, those processes wherever they apply.
 *
 * With `only` this is a MERGE, never a restart: the requested processes are
 * added to the item's existing ops (hero processes on the first still, image
 * processes on every still, honouring heroOnly), photos that had no op get
 * one, and every other op, result and status is carried over. An item whose
 * last run lacked the process (a text-only gap fill, then Clean image) keeps
 * its unsaved results, and an item last run hero-only gets all its photos
 * re-cleaned when heroOnly is off.
 *
 * Returns null when there is nothing to (re)run; the caller decides what that
 * means, and must not fall back to a fresh launch for an item holding results.
 */
export function planRetryLaunch(item: RunItem, opts: PlanOptions & { only?: ReadonlySet<ProcessId> }): { item: RunItem; specs: LaunchSpec[] } | null {
    if (!item.ops.length) return null;
    const only = opts.only;
    const keyOf = (kind: 'photo' | 'donor', index: number) => `${kind}:${index}`;
    // What a launch of `only` asks of each photo of this item.
    const wanted = new Map<string, PlannedOp>();
    const want = (list: PlannedOp[]) => {
        for (const p of list) {
            const key = keyOf(p.kind, p.index);
            const had = wanted.get(key);
            wanted.set(key, had ? { ...had, processes: Array.from(new Set([...had.processes, ...p.processes])) } : p);
        }
    };
    if (only) want(planOps(item, only, { heroOnly: opts.heroOnly }));

    // Where a process can still run. The hero processes run on the first
    // still only (or on the donor op of a photo-less item): a photo added
    // after a donor pass replaces that pass, and an op whose photo moved off
    // the first place (or was removed) no longer writes the item's text.
    const hasStills = item.media.some(m => !m.isVideo);
    const fits = (o: RunOp, p: ProcessId) => o.kind === 'donor' ? !hasStills : (o.index === 0 || !HERO_PROCESSES.includes(p));
    const asked = (o: RunOp) => only
        ? o.planned.filter(p => only.has(p))
        : o.planned.filter(p => o.status[p] === 'failed' || o.status[p] === 'queued' || !o.status[p] || (o.status[p] === 'skipped' && !!o.errors[p]));
    const moved = new Set<ProcessId>();
    for (const o of item.ops) {
        // A donor op on an item that now has photos is replaced whole: its
        // text was written from another item, the photo's is the real one.
        const misfit = o.kind === 'donor' && hasStills ? o.planned : asked(o).filter(p => !fits(o, p));
        for (const p of misfit) {
            if (p === 'variation_donor') TEXT_PROCESSES.forEach(t => moved.add(t));
            else moved.add(p);
        }
    }
    if (moved.size) want(planOps(item, moved, { heroOnly: true }));

    const specs: LaunchSpec[] = [];
    const rerunAll = new Set<ProcessId>();
    const matched = new Set<string>();
    const kept = item.ops.filter(o => !(o.kind === 'donor' && hasStills));
    const ops = kept.flatMap((o0): RunOp[] => {
        // Processes moved to the hero leave this op, so its old outcome no
        // longer counts towards the item's status.
        const gone = asked(o0).filter(p => !fits(o0, p));
        let o = o0;
        if (gone.length) {
            const status = { ...o.status };
            const errors = { ...o.errors };
            gone.forEach(p => { delete status[p]; delete errors[p]; });
            o = { ...o, planned: o.planned.filter(p => !gone.includes(p)), current: o.current.filter(p => !gone.includes(p)), status, errors };
            if (!o.planned.length && o.index < 0) return [];
        }
        const key = keyOf(o.kind, o.index);
        matched.add(key);
        const rerun = Array.from(new Set([...asked(o).filter(p => fits(o, p)), ...(wanted.get(key)?.processes || [])]));
        if (!rerun.length) return [o];
        const id = opIdFor(item.id, o.kind, o.index, opts.seq);
        const media = item.media.find(m => m.index === o.index);
        const op = makeBatchOp(item, id, { kind: o.kind, index: o.index, imageUrl: o.kind === 'donor' ? '' : (media?.url || o.op.imageUrl || '') }, rerun, opts.processingMode, {
            result: o.op.result, status: o.status, errors: o.errors,
        });
        const status = { ...o.status };
        const errors = { ...o.errors };
        rerun.forEach(p => { delete status[p]; delete errors[p]; rerunAll.add(p); });
        specs.push({ opId: id, itemId: item.id, kind: o.kind, op });
        const next: RunOp = {
            ...o, id, state: 'queued', planned: Array.from(new Set([...o.planned, ...rerun])), current: rerun, op, status, errors,
            lastFail: undefined, error: undefined, interrupted: undefined, startedAt: undefined, settledAt: undefined,
        };
        return [next];
    });
    // Photos the earlier run never touched (hero-only, or a process it did not have).
    for (const [key, p] of wanted) {
        if (matched.has(key)) continue;
        const id = opIdFor(item.id, p.kind, p.index, opts.seq);
        const op = makeBatchOp(item, id, p, p.processes, opts.processingMode);
        p.processes.forEach(x => rerunAll.add(x));
        specs.push({ opId: id, itemId: item.id, kind: p.kind, op });
        ops.push({ id, kind: p.kind, index: p.index, state: 'queued', planned: p.processes, current: p.processes, op, status: {}, errors: {} });
    }
    if (!specs.length) return null;
    ops.sort((a, b) => a.index - b.index || (a.kind === b.kind ? 0 : a.kind === 'donor' ? -1 : 1));
    const added = Array.from(rerunAll);
    return {
        item: summarizeItem({
            ...item,
            ops,
            planned: Array.from(new Set([...item.planned, ...added])),
            selected: Array.from(new Set([...item.selected, ...added])),
            path: item.media.some(m => !m.isVideo) ? 'photo' : ops.some(o => o.kind === 'donor') ? 'donor' : item.path,
            savedProcesses: item.savedProcesses.filter(p => !rerunAll.has(p)),
            status: 'running', rejected: false, interrupted: undefined, error: undefined, progress: 0,
        }),
        specs,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Folding ops back into the item (pure)
// ─────────────────────────────────────────────────────────────────────────────

/** One process on one op, including the live running/queued guess. */
export function opProcessStatus(o: RunOp, p: ProcessId): RunProcessStatus | undefined {
    if (!o.planned.includes(p)) return undefined;
    const s = o.status[p];
    if (s) return s;
    if (o.state === 'running' && o.current.includes(p)) {
        const unfinished = o.current.filter(x => !o.status[x]);
        const stage = STAGES.find(g => g.some(x => unfinished.includes(x)));
        return stage?.includes(p) ? 'running' : 'queued';
    }
    return 'queued';
}

/** One process across photos. */
export function combineProcessStatus(list: readonly RunProcessStatus[], itemRunning: boolean): RunProcessStatus {
    if (!list.length) return 'skipped';
    if (list.includes('running')) return 'running';
    const done = list.filter(s => s === 'done').length;
    const bad = list.filter(s => s === 'failed' || s === 'partial').length;
    const queued = list.filter(s => s === 'queued').length;
    if (queued) {
        if (!done && !bad) return 'queued';
        if (itemRunning) return 'running';
        return done ? 'partial' : 'failed';
    }
    if (!bad) return done ? 'done' : 'skipped';
    return done || list.includes('partial') ? 'partial' : 'failed';
}

/** The item's status once every op has settled. */
export function finalItemStatus(statuses: readonly RunProcessStatus[], interrupted?: RunInterrupt): RunItemStatus {
    const anyDone = statuses.some(s => s === 'done' || s === 'partial');
    if (interrupted === 'stop') return anyDone ? 'partial' : 'queued';
    if (interrupted === 'cancel') return anyDone ? 'partial' : 'skipped';
    if (!statuses.length || statuses.every(s => s === 'skipped')) return 'skipped';
    if (statuses.some(s => s === 'failed' || s === 'partial' || s === 'queued')) return anyDone ? 'partial' : 'failed';
    return 'review';
}

/**
 * Small string-keyed memo. summarizeItem runs on every reducer action (each
 * progress tick, log line and keystroke); an outline SVG embeds its cutout
 * and runs to megabytes, so re-encoding it every time stalled the page.
 */
function memoByString<T>(fn: (s: string) => T, size = 48): (s: string) => T {
    const cache = new Map<string, T>();
    return (s: string) => {
        if (cache.has(s)) return cache.get(s)!;
        const v = fn(s);
        if (cache.size >= size) cache.delete(cache.keys().next().value as string);
        cache.set(s, v);
        return v;
    };
}

const svgDataUrl = memoByString((svg: string) => {
    try {
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    } catch {
        return undefined;
    }
});

const layerCountOf = memoByString((json: string): number | undefined => {
    try { return JSON.parse(json)?.layers?.length; } catch { return undefined; }
});

const sameText = (a: RunText, b: RunText) => {
    const norm = (t: RunText) => JSON.stringify([t.title ?? null, t.html ?? null, t.colors ?? null, t.genType ?? null]);
    return norm(a) === norm(b);
};

const stripTag = (line: string) => line.replace(/^\s*\[[^\]]*\]\s*/, '').trim();

/** Recompute every derived field of an item from its ops, edits and stored media. */
export function summarizeItem(item: RunItem): RunItem {
    const running = item.ops.some(o => o.state === 'queued' || o.state === 'running');
    const multi = item.ops.filter(o => o.kind === 'photo').length > 1;
    const photoTag = (o: RunOp) => (multi && o.kind === 'photo' ? `${trf('Photo {n}', { n: o.index + 1 })}: ` : '');

    // ── per process ──
    const processStatus: RunItem['processStatus'] = {};
    const processErrors: RunItem['processErrors'] = {};
    for (const p of item.planned) {
        const list = item.ops.map(o => opProcessStatus(o, p)).filter((s): s is RunProcessStatus => !!s);
        processStatus[p] = combineProcessStatus(list, running);
        const errs = Array.from(new Set(item.ops.filter(o => o.errors[p]).map(o => `${photoTag(o)}${o.errors[p]}`)));
        if (errs.length) processErrors[p] = errs.join(' · ');
    }
    for (const p of item.selected) {
        if (!(p in processStatus)) processStatus[p] = 'skipped';
    }

    // ── progress and stage ──
    // Only this launch's ops: the photos a retry left alone settled earlier.
    const launched = item.ops.filter(o => o.state === 'queued' || o.state === 'running'
        || (o.state === 'settled' && (!item.startedAt || (o.settledAt || 0) >= item.startedAt)));
    let progress = item.progress;
    if (running && launched.length) {
        progress = Math.round(launched.reduce((sum, o) => sum + (o.state === 'settled' ? 100 : o.state === 'running' ? Math.max(0, Math.min(100, o.op.progress || 0)) : 0), 0) / launched.length);
    } else if (!running) {
        progress = item.status === 'queued' || !item.ops.length ? 0 : 100;
    }
    let stage: string | undefined;
    if (running) {
        const live = item.ops.find(o => o.state === 'running');
        if (live) stage = `${photoTag(live)}${tr(live.op.stepLabel || (live.lastWait ? stripTag(live.lastWait) : 'Working...'))}`;
        else stage = tr('Waiting for a slot');
    }

    // ── text: the hero's (the donor op is the hero of a photo-less item) ──
    // The op that writes the text: the first still's when the item has
    // photos (a donor pass from before a photo was added counts only until
    // the photo's own text exists), else the donor op.
    const hasStills = item.media.some(m => !m.isVideo);
    const textOps = item.ops.filter(o => o.planned.some(p => HERO_PROCESSES.includes(p) || p === 'variation_donor'));
    const hero = (hasStills ? textOps.find(o => o.kind === 'photo' && o.index === 0) || textOps.find(o => o.kind === 'photo') : undefined)
        || textOps.find(o => o.kind === 'donor')
        || textOps[0]
        || item.ops.find(o => o.index === 0 && (o.kind === 'donor' || !item.media.find(m => m.index === 0)?.isVideo));
    const h = hero?.op.result || {};
    // Planned AND done: the donor path marks all four text processes done
    // whichever were ticked, and an unticked one is not shown as generated.
    const ok = (p: ProcessId) => !!hero && hero.planned.includes(p) && hero.status[p] === 'done';
    const generated: RunText = {};
    if (ok('title_desc') || ok('variation_donor')) generated.title = h.description || undefined;
    if (ok('marketing_desc') || ok('variation_donor')) generated.html = h.marketingDescription || undefined;
    if (ok('dominant_colors') || ok('variation_donor')) generated.colors = h.dominantColors?.length ? h.dominantColors : undefined;
    if (ok('product_type') || ok('variation_donor')) generated.genType = h.generatedType || undefined;
    const text: RunText = { ...generated };
    (Object.keys(item.edits) as (keyof RunText)[]).forEach(k => {
        if (item.edits[k] !== undefined) (text as any)[k] = item.edits[k];
    });

    const hexMap: RunHexMap | undefined = hero && hero.status.hex_map === 'done' && h.hexString
        ? { hexString: h.hexString, bitmapUrl: h.bitmapUrl, cols: h.cols || 20, rows: h.rows || 20 }
        : undefined;
    const axoIconUrl = item.ops.map(o => o.op.result?.axoIconUrl).filter(Boolean).pop() as string | undefined;

    // ── photos ──
    const photos: RunPhoto[] = item.media.map((m, i) => {
        const o = item.ops.find(x => x.kind === 'photo' && x.index === m.index);
        const r = o?.op.result || {};
        const stored = item.stored.photos[i] || {};
        let status: RunProcessStatus = 'skipped';
        if (o) {
            const list = o.planned.map(p => opProcessStatus(o, p)).filter((s): s is RunProcessStatus => !!s);
            status = combineProcessStatus(list, o.state === 'queued' || o.state === 'running');
        }
        const layerCount = r.cloudSegmentationMasks ? layerCountOf(r.cloudSegmentationMasks) : undefined;
        const matteUrl = r.matteUrl;
        const cutoutUrl = r.cutoutUrl || r.maskUrl;
        return {
            index: m.index,
            sourceUrl: m.url,
            isVideo: m.isVideo,
            isHero: !m.isVideo && m.index === 0,
            opId: o?.id,
            status,
            progress: o ? (o.state === 'settled' ? 100 : o.state === 'running' ? (o.op.progress || 0) : 0) : 0,
            stepLabel: o?.state === 'running' ? (o.op.stepLabel || (o.lastWait ? stripTag(o.lastWait) : undefined)) : undefined,
            cleanedUrl: r.cleanedUrl,
            cutoutUrl,
            matteUrl,
            maskUrl: matteUrl || cutoutUrl,
            outlineSvg: r.outlineSvg,
            svgUrl: r.svgUrl || (r.outlineSvg ? svgDataUrl(r.outlineSvg) : undefined),
            width: r.segmentation?.imageWidth,
            height: r.segmentation?.imageHeight,
            layerCount,
            generated: !!(r.cleanedUrl || cutoutUrl || matteUrl || r.outlineSvg || r.svgUrl),
            stored,
        };
    });

    // Unsaved generated work: a process that worked and was not written by
    // the last save. Derived, so dropping or replacing ops can never leave a
    // stale "unsaved" flag with nothing behind it.
    const saved = new Set(item.savedProcesses);
    const unsavedRun = item.planned.some(p => (processStatus[p] === 'done' || processStatus[p] === 'partial') && !saved.has(p));
    const dirty = unsavedRun || !sameText(item.edits, item.savedEdits);

    return { ...item, processStatus, processErrors, progress, stage, generated, text, hexMap, axoIconUrl, photos, unsavedRun, dirty };
}

/** Called when the last op of a launch settles. */
function finalizeItem(item: RunItem, at: number): RunItem {
    const s = summarizeItem(item);
    const statuses = s.planned.map(p => s.processStatus[p] || 'skipped');
    const status = finalItemStatus(statuses, s.interrupted);
    const fatal = s.ops.map(o => o.error).find(Boolean);
    const tail = status === 'review' ? '[  OK  ] Ready for review'
        : status === 'partial' ? (s.interrupted ? `[ STOP ] ${s.interrupted === 'stop' ? 'Stopped' : 'Cancelled'}; what finished is kept` : '[ WARN ] Finished with failures')
        : status === 'failed' ? `[ FAIL ] ${fatal || 'Nothing that was asked for worked'}`
        : status === 'queued' ? '[ STOP ] Stopped; back in the queue'
        : s.interrupted === 'cancel' ? '[ STOP ] Cancelled by user'
        : '[ SKIP ] Nothing to do';
    return summarizeItem({
        ...s,
        status,
        finishedAt: at,
        error: status === 'failed' ? fatal || s.error : undefined,
        logs: capLogs([...s.logs, tail]),
    });
}

const capLogs = (logs: string[]) => (logs.length > LOG_CAP ? logs.slice(logs.length - LOG_CAP) : logs);

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────

export function initRunState(): RunState {
    return { items: {}, order: [], opIndex: {}, runIds: [], timing: { count: 0, totalMs: 0 }, runError: null, saving: false };
}

const isBusy = (it: RunItem) => it.status === 'running' || it.ops.some(o => o.state === 'queued' || o.state === 'running');

function withItem(state: RunState, id: string, fn: (it: RunItem) => RunItem | null): RunState {
    const it = state.items[id];
    if (!it) return state;
    const next = fn(it);
    if (!next || next === it) return state;
    return { ...state, items: { ...state.items, [id]: next } };
}

function withOp(state: RunState, opId: string, fn: (o: RunOp, it: RunItem) => RunOp | null, after?: (it: RunItem) => RunItem): RunState {
    const itemId = state.opIndex[opId];
    if (!itemId) return state;
    return withItem(state, itemId, it => {
        const idx = it.ops.findIndex(o => o.id === opId);
        if (idx < 0) return null;
        const o = fn(it.ops[idx], it);
        if (!o) return null;
        const ops = it.ops.slice();
        ops[idx] = o;
        const next = { ...it, ops };
        return after ? after(next) : summarizeItem(next);
    });
}

export function runReducer(state: RunState, action: RunAction): RunState {
    switch (action.type) {
        case 'sync': {
            const items: Record<string, RunItem> = {};
            const order: string[] = [];
            let changed = false;
            for (const row of action.rows) {
                const id = runItemKey(row);
                if (items[id]) continue;
                const prev = state.items[id];
                if (!prev) { items[id] = buildRunItem(row); changed = true; }
                else if (!sameRow(prev.source, row) && !isBusy(prev) && !prev.saving) { items[id] = refreshRow(prev, row, true); changed = true; }
                else items[id] = prev;
                order.push(id);
            }
            // An item that left the selection is dropped, unless it is still
            // running or holds unsaved work: closing over those is the
            // screen's decision (hasUnsavedChanges), not a side effect.
            for (const id of state.order) {
                if (items[id]) continue;
                const prev = state.items[id];
                if (prev && (isBusy(prev) || prev.dirty || prev.saving)) { items[id] = prev; order.push(id); }
                else changed = true;
            }
            if (!changed && order.length === state.order.length && order.every((id, i) => id === state.order[i])) return state;
            const opIndex: Record<string, string> = {};
            for (const id of order) for (const o of items[id].ops) opIndex[o.id] = id;
            return { ...state, items, order, opIndex };
        }

        case 'launch': {
            const items = { ...state.items };
            const opIndex = { ...state.opIndex };
            for (const it of action.items) {
                const prev = items[it.id];
                if (prev) for (const o of prev.ops) delete opIndex[o.id];
                const verb = action.fresh ? 'Run' : 'Retry';
                const what = it.ops.filter(o => o.state === 'queued').flatMap(o => o.current);
                items[it.id] = summarizeItem({
                    ...it,
                    startedAt: action.at,
                    finishedAt: undefined,
                    logs: capLogs([...(prev?.logs || it.logs), `[ WAIT ] ${verb}: ${Array.from(new Set(what)).join(', ')}`]),
                });
                for (const o of it.ops) opIndex[o.id] = it.id;
            }
            const anyRunning = state.order.some(id => state.items[id] && isBusy(state.items[id]));
            const launchedIds = action.items.map(i => i.id);
            const runIds = anyRunning ? Array.from(new Set([...state.runIds, ...launchedIds])) : launchedIds;
            return { ...state, items, opIndex, runIds };
        }

        case 'skip':
            return withItem(state, action.itemId, it => {
                const line = `[ SKIP ] ${action.reason}`;
                // An item that holds a run's results or edits is left exactly
                // as it is: a selection that does not apply to it must not
                // erase what it already has.
                if (it.ops.length || it.dirty) return { ...it, logs: capLogs([...it.logs, line]) };
                return summarizeItem({
                    ...it, status: 'skipped', selected: action.selected, planned: [], ops: [], progress: 0,
                    logs: capLogs([...it.logs, line]),
                });
            });

        case 'op-start':
            return withOp(state, action.opId, o => ({ ...o, state: 'running', startedAt: action.at }));

        case 'op-update':
            return withOp(state, action.opId, o => {
                if (o.state === 'settled') return null;
                const patch = typeof action.updates === 'function' ? action.updates(o.op) : action.updates;
                const op: BatchOp = { ...o.op, ...patch };
                let status = o.status;
                if (patch.processStatus) {
                    status = { ...o.status };
                    for (const [k, v] of Object.entries(patch.processStatus)) if (v) status[k as ProcessId] = v;
                }
                const errors = patch.processErrors ? { ...patch.processErrors } as RunOp['errors'] : o.errors;
                return { ...o, op, status, errors };
            });

        case 'op-log':
            return withOp(state, action.opId, o => o, it => {
                const o = it.ops.find(x => x.id === action.opId)!;
                const multi = it.ops.filter(x => x.kind === 'photo').length > 1;
                const line = multi && o.kind === 'photo' ? action.text.replace(/^(\s*\[[^\]]*\])/, `$1 P${o.index + 1}`) : action.text;
                const ops = it.ops.map(x => x.id !== action.opId ? x : {
                    ...x,
                    lastFail: /\[ FAIL \]/.test(action.text) ? stripTag(action.text) : x.lastFail,
                    lastWait: /\[ WAIT \]/.test(action.text) ? action.text : x.lastWait,
                });
                return summarizeItem({ ...it, ops, logs: capLogs([...it.logs, line]) });
            });

        case 'op-settled': {
            const settled: { op?: RunOp } = {};
            const next = withOp(state, action.opId, o => {
                if (o.state === 'settled') return null;
                const status = { ...o.status };
                const errors = { ...o.errors };
                // What the pipeline never marked: put back (Stop), skipped
                // (Cancel, or the op skipped itself: a Google Photos link, no
                // donor), or failed with the op's own reason.
                const opFailed = o.op.status === 'failed';
                const reason = action.error || Object.values(o.errors).find(Boolean) || o.lastFail || 'Failed';
                for (const p of o.current) {
                    if (status[p]) continue;
                    if (action.interrupted === 'stop') status[p] = 'queued';
                    else if (action.interrupted === 'cancel') { status[p] = 'skipped'; errors[p] = CANCELLED_MESSAGE; }
                    else if (opFailed || action.error) { status[p] = 'failed'; errors[p] = errors[p] || reason; }
                    else status[p] = 'skipped';
                }
                settled.op = { ...o, state: 'settled', status, errors, settledAt: action.at, interrupted: action.interrupted, error: action.error };
                return settled.op;
            }, it => {
                const interrupted = action.interrupted ? (it.interrupted === 'cancel' ? 'cancel' : action.interrupted) : it.interrupted;
                const next = { ...it, interrupted, error: action.error || it.error };
                const pending = next.ops.some(o => o.state === 'queued' || o.state === 'running');
                return pending ? summarizeItem(next) : finalizeItem(next, action.at);
            });
            const o = settled.op;
            if (next === state || !o) return next;
            const timing = o.startedAt && !action.interrupted
                ? { count: state.timing.count + 1, totalMs: state.timing.totalMs + Math.max(0, action.at - o.startedAt) }
                : state.timing;
            return { ...next, timing };
        }

        case 'accept':
            return withItem(state, action.itemId, it => {
                if (isBusy(it) || it.saving) return null;
                if (!(it.status === 'review' || it.status === 'partial' || (it.dirty && it.status !== 'done'))) return null;
                return { ...it, status: 'done', logs: capLogs([...it.logs, '[  OK  ] Accepted']) };
            });

        case 'reject':
            return withItem(state, action.itemId, it => {
                if (isBusy(it) || it.saving) return null;
                if (!(it.status === 'review' || it.status === 'partial' || it.status === 'done' || it.status === 'failed')) return null;
                // The dropped ops' ids stay in opIndex; withOp finds no op for
                // them, so a late callback is ignored.
                return summarizeItem({
                    ...it, status: 'skipped', ops: [], selected: [], planned: [], edits: {}, savedEdits: {}, unsavedRun: false, savedProcesses: [],
                    rejected: true, progress: 0, warnings: [],
                    logs: capLogs([...it.logs, '[ SKIP ] Rejected; the generated results were discarded']),
                });
            });

        case 'edit':
            return withItem(state, action.itemId, it => {
                if (it.saving) return null;
                const edits: RunText = { ...it.edits };
                (Object.keys(action.patch) as (keyof RunEditPatch)[]).forEach(k => {
                    const v = action.patch[k];
                    if (v === undefined) return;
                    if (v === null) delete edits[k];
                    else (edits as any)[k] = k === 'colors' ? (v as string[]).map(c => String(c).trim()).filter(Boolean) : v;
                });
                const next = summarizeItem({ ...it, edits });
                // A person's edit is their approval of that field: an edited
                // item that was saved, never run, skipped or failed becomes
                // accepted (and unsaved).
                const idle = it.status === 'saved' || it.status === 'queued' || it.status === 'skipped' || it.status === 'failed';
                const status: RunItemStatus = !isBusy(it) && idle && next.dirty ? 'done' : it.status;
                return status === next.status ? next : { ...next, status };
            });

        case 'log':
            return withItem(state, action.itemId, it => ({ ...it, logs: capLogs([...it.logs, action.text]) }));

        case 'manual-cutout':
            return withItem(state, action.itemId, it => {
                if (isBusy(it) || it.saving) return null;
                const media = it.media.find(m => m.index === action.index && !m.isVideo);
                if (!media) return null;
                const p: ProcessId = 'image_segmentation';
                // A cutout made by hand (an upload, a 1:1 crop) IS the piece's
                // image for that angle: it replaces the generated cutout, and
                // the matte and outline traced from the old one no longer
                // match it, so they go.
                const cut = { maskUrl: action.dataUrl, cutoutUrl: action.dataUrl, matteUrl: undefined, outlineSvg: undefined, svgUrl: undefined, segmentation: undefined };
                let ops = it.ops;
                const idx = ops.findIndex(o => o.kind === 'photo' && o.index === action.index);
                if (idx >= 0) {
                    const o = ops[idx];
                    const errors = { ...o.errors };
                    delete errors[p];
                    ops = ops.slice();
                    ops[idx] = {
                        ...o,
                        planned: o.planned.includes(p) ? o.planned : [...o.planned, p],
                        status: { ...o.status, [p]: 'done' },
                        errors,
                        op: { ...o.op, result: { ...(o.op.result || {}), ...cut }, processStatus: { ...(o.op.processStatus || {}), [p]: 'done' } },
                    };
                } else {
                    // Never run: a settled op of its own, so the writer finds the
                    // cutout where it finds a generated one. The 'm' seq keeps
                    // its id out of every launch's id space.
                    const id = `${it.id}#p${action.index}@m${action.at}`;
                    const op = makeBatchOp(it, id, { kind: 'photo', index: action.index, imageUrl: media.url }, [p], 'local', { result: cut });
                    ops = [...ops, {
                        id, kind: 'photo', index: action.index, state: 'settled', planned: [p], current: [p],
                        op: { ...op, status: 'completed', forceRecleanImage: false, processStatus: { [p]: 'done' } },
                        status: { [p]: 'done' }, errors: {}, settledAt: action.at,
                    }];
                }
                const next = summarizeItem({
                    ...it,
                    ops,
                    planned: it.planned.includes(p) ? it.planned : [...it.planned, p],
                    selected: it.selected.includes(p) ? it.selected : [...it.selected, p],
                    savedProcesses: it.savedProcesses.filter(x => x !== p),
                    rejected: false,
                    logs: capLogs([...it.logs, `[  OK  ] Photo ${action.index + 1}: cutout set by hand`]),
                });
                // Made by a person, so it is accepted, like an edit -- but only
                // an idle item: one still in review holds AI copy nobody has
                // read, and Accept stays the person's call.
                const idle = it.status === 'saved' || it.status === 'queued' || it.status === 'skipped' || it.status === 'failed';
                return idle ? { ...next, status: 'done' } : next;
            });

        case 'reset':
            return withItem(state, action.itemId, it => {
                if (isBusy(it) || it.saving) return null;
                // Back to a never-run item on the given (or current) row: the
                // run's ops, edits and review state go. `source` stays what the
                // screen handed in, so the next sync does not put the old row back.
                const fresh = buildRunItem(action.row ?? it.row);
                return { ...fresh, id: it.id, source: it.source, logs: capLogs([...it.logs, '[ SKIP ] Reset']) };
            });

        case 'save-start':
            return withItem(state, action.itemId, it => ({ ...it, saving: true }));

        case 'save-done':
            return withItem(state, action.itemId, it => {
                const { outcome } = action;
                const lines = outcome.warnings.map(w => `[ WARN ] ${w}`);
                let next: RunItem = { ...it, saving: false, warnings: outcome.warnings };
                if (outcome.outcome === 'saved' || outcome.outcome === 'incomplete') {
                    next = absorbSaved(next, action.patch);
                    if (action.savedRow) next = refreshRow(next, action.savedRow, false);
                }
                if (outcome.outcome === 'saved') {
                    lines.push(`[  OK  ] Saved (${(outcome.columns || []).join(', ') || 'segmentation'})`);
                    next = {
                        ...next, status: 'saved', savedEdits: { ...next.edits }, savedAt: Date.now(), error: undefined,
                        savedProcesses: Array.from(new Set([...next.savedProcesses, ...(action.processes || [])])),
                    };
                } else if (outcome.outcome === 'incomplete') {
                    lines.push('[ FAIL ] Saved without the uploads that failed; save again to retry them');
                } else if (outcome.outcome === 'failed') {
                    lines.push(`[ FAIL ] ${outcome.error || 'Save failed'}`);
                    next = { ...next, error: outcome.error };
                } else if (outcome.outcome === 'empty') {
                    lines.push('[ SKIP ] Nothing to save');
                }
                return summarizeItem({ ...next, logs: capLogs([...next.logs, ...lines]) });
            });

        case 'saving':
            return state.saving === action.value ? state : { ...state, saving: action.value };

        case 'run-error':
            return state.runError === action.error ? state : { ...state, runError: action.error };

        default:
            return state;
    }
}

/**
 * Once a patch is written, the ops hold the uploaded URLs instead of the
 * data: URLs they were generated with, and the segmentation that went to
 * item_segmentation is dropped, so saving again does not upload the same
 * matte twice or add a second row (the hub's absorbSaved, per item).
 */
function absorbSaved(item: RunItem, patch?: AiPatch): RunItem {
    if (!patch) return item;
    const masks = (patch.columns.spatial_masks || {}) as Record<string, any[]>;
    const points = patch.columns.spatial_points as any[] | undefined;
    const bitmapUrl: string | undefined = points?.[0]?.bitmap_url || undefined;
    const map = parseJsonObject(patch.columns.processed_media_urls);
    const ops = item.ops.map(o => {
        if (!o.op.result) return o;
        const r = { ...o.op.result, segmentation: undefined };
        // Only an op whose own segmentation worked takes the saved angle: the
        // merged map also holds STORED angles, and a photo whose segmentation
        // failed in this run must not show (or re-save) the stored cutout as
        // this run's output.
        if (o.kind === 'photo' && o.status.image_segmentation === 'done') {
            const angle = masks[`angle_${o.index}`]?.[0];
            if (angle?.mask) { r.cutoutUrl = angle.mask; r.maskUrl = angle.mask; }
            if (angle?.matte) r.matteUrl = angle.matte;
            if (angle?.svg) r.svgUrl = angle.svg;
        }
        if (o.kind === 'photo') {
            const src = o.op.imageUrl ? (getCleanImageUrl(o.op.imageUrl) || o.op.imageUrl) : '';
            if (r.cleanedUrl?.startsWith('data:') && src && map[src]) r.cleanedUrl = map[src];
        }
        if (bitmapUrl && r.bitmapUrl?.startsWith('data:')) r.bitmapUrl = bitmapUrl;
        if (patch.columns.axo_icon_url && r.axoIconUrl?.startsWith('data:')) r.axoIconUrl = patch.columns.axo_icon_url;
        return { ...o, op: { ...o.op, result: r } };
    });
    return { ...item, ops };
}

// ─────────────────────────────────────────────────────────────────────────────
// Selectors (pure)
// ─────────────────────────────────────────────────────────────────────────────

export function countByStatus(items: Iterable<RunItem>): RunCounts {
    const c: RunCounts = { queued: 0, running: 0, done: 0, partial: 0, failed: 0, skipped: 0, review: 0, saved: 0, total: 0, needsReview: 0, unsaved: 0 };
    for (const it of items) {
        c[it.status] += 1;
        c.total += 1;
        if (it.status === 'review' || it.status === 'partial') c.needsReview += 1;
        if (it.dirty) c.unsaved += 1;
    }
    return c;
}

export const runItemsOf = (state: RunState): RunItem[] => state.order.map(id => state.items[id]).filter(Boolean);

/** 0-100 over the items of the current (or last) run. */
export function overallProgress(state: RunState): number {
    const ids = state.runIds.filter(id => state.items[id]);
    if (!ids.length) return 0;
    const sum = ids.reduce((acc, id) => {
        const it = state.items[id];
        return acc + (isBusy(it) ? it.progress : 100);
    }, 0);
    return Math.round(sum / ids.length);
}

/** Rough milliseconds left: ops still to go, at the average op time, `concurrency` at a time. */
export function estimateEtaMs(state: RunState, concurrency = RUN_CONCURRENCY): number | null {
    if (!state.timing.count) return null;
    const avg = state.timing.totalMs / state.timing.count;
    let remaining = 0;
    let elapsed = 0;
    const now = Date.now();
    for (const id of state.runIds) {
        const it = state.items[id];
        if (!it) continue;
        for (const o of it.ops) {
            if (o.state === 'queued') remaining += 1;
            else if (o.state === 'running') { remaining += 1; elapsed += o.startedAt ? Math.min(avg, now - o.startedAt) : 0; }
        }
    }
    if (!remaining) return null;
    return Math.max(0, Math.round((remaining * avg - elapsed) / Math.max(1, concurrency)));
}

/**
 * What save() would write for an item: the AiItemResult with the person's
 * edits on top, and the processes to write -- those selected that worked
 * (done, or partial: worked on some photos), plus every edited field.
 *
 * On the donor path variation_donor is passed only when it was ticked: the
 * writer treats it as "all four text columns", and an unticked text process
 * must not be written.
 */
export function saveSetOf(item: RunItem): { result: AiItemResult; processes: Set<ProcessId> } {
    const processes = new Set<ProcessId>();
    const saved = new Set(item.savedProcesses);
    for (const p of item.planned) {
        const s = item.processStatus[p];
        if ((s === 'done' || s === 'partial') && !saved.has(p)) processes.add(p);
    }
    // An edit is written when it is new since the last save, or when its
    // process is being written anyway (the edit is what goes in that column).
    (Object.keys(item.edits) as (keyof RunText)[]).forEach(k => {
        if (item.edits[k] === undefined) return;
        const changed = JSON.stringify(item.edits[k]) !== JSON.stringify(item.savedEdits[k]);
        if (changed || !saved.has(EDIT_PROCESS[k])) processes.add(EDIT_PROCESS[k]);
    });
    const base = aiResultFromOps(item.ops.map(o => o.op));
    const result: AiItemResult = {
        ...base,
        title: item.text.title,
        html: item.text.html,
        colors: item.text.colors,
        genType: item.text.genType,
        succeeded: processes,
    };
    return { result, processes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export interface RunStore {
    getState: () => RunState;
    dispatch: (action: RunAction) => void;
    subscribe: (listener: () => void) => () => void;
}

/** The reducer behind a subscribe/getState pair, so async workers always read the latest state. */
export function createRunStore(initial: RunState = initRunState()): RunStore {
    let state = initial;
    const listeners = new Set<() => void>();
    return {
        getState: () => state,
        dispatch: (action) => {
            const next = runReducer(state, action);
            if (next === state) return;
            state = next;
            listeners.forEach(l => l());
        },
        subscribe: (l) => {
            listeners.add(l);
            return () => { listeners.delete(l); };
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export type RunTarget = readonly string[] | 'failed';
export type SaveTarget = readonly string[] | 'reviewed';

export interface RunLaunchOptions {
    /** Overrides the hook's selection for this launch (retry: only these processes). */
    processes?: ReadonlySet<ProcessId> | readonly ProcessId[];
    processingMode?: ProcessingMode;
    /** Overrides the hook's heroOnly for this launch. */
    heroOnly?: boolean;
}

export interface RunStartResult {
    /** Items launched. */
    started: number;
    /** Set when the run could not start or was stopped for want of a Gemini key. */
    error?: RunError;
}

export interface UseAiRunOptions {
    /** Inventory rows, raw or normalized, or { id, data } wrappers. */
    items: readonly any[];
    /** The ticked processes (CATALOG_PROCESSES ids). */
    processes: ReadonlySet<ProcessId> | readonly ProcessId[];
    /** Defaults to 'bgreplace'. */
    processingMode?: ProcessingMode;
    /** Defaults to '2K'. */
    bgQuality?: BgQuality;
    user?: unknown;
    /** The whole catalogue, for the donor path (items without photos). Built into a pool once per run. */
    donorInventory?: readonly any[];
    /** Photo ops in flight at once. Defaults to RUN_CONCURRENCY. */
    concurrency?: number;
    /** Fresh launches plan the first still only. Read at launch time. */
    heroOnly?: boolean;
}

export interface UseAiRun {
    state: RunState;
    /** In input order. */
    items: RunItem[];
    get: (itemId: string) => RunItem | undefined;
    counts: RunCounts;
    /** 0-100 over the current (or last) run. */
    progress: number;
    etaMs: number | null;
    isRunning: boolean;
    isSaving: boolean;
    hasUnsavedChanges: boolean;
    /** Run-level error (a missing key): show once, offer the key dialog. */
    runError: RunError | null;
    clearRunError: () => void;
    /** Run the selection on these items (default: every queued item). Resolves when the engine is idle. */
    start: (itemIds?: readonly string[], opts?: RunLaunchOptions) => Promise<RunStartResult>;
    /** Abort everything in flight; nothing queued starts. Interrupted items go back to queued (or partial). */
    stop: () => void;
    /** Abort one item. It ends skipped (or partial when something finished). */
    cancel: (itemId: string) => void;
    /** Re-run what failed (or `opts.processes`) on these items, or on every failed/partial item. */
    retry: (target: RunTarget, opts?: RunLaunchOptions) => Promise<RunStartResult>;
    accept: (itemId: string) => void;
    reject: (itemId: string) => void;
    edit: (itemId: string, patch: RunEditPatch) => void;
    /** Write through lib/ai/persist, one item at a time. 'reviewed' = every accepted ('done') item. */
    save: (target: SaveTarget) => Promise<SaveOutcome[]>;
    /** A hand-made cutout (upload, crop) for one still photo; accepted and unsaved. */
    setCutout: (itemId: string, photoIndex: number, dataUrl: string) => void;
    /** Drop an idle item's run, edits and review state; optionally re-read it from `row`. */
    reset: (itemId: string, row?: any) => void;
}

const toSet = (p: ReadonlySet<ProcessId> | readonly ProcessId[] | undefined): Set<ProcessId> =>
    new Set(p ? Array.from(p as Iterable<ProcessId>) : []);

export function useAiRun(options: UseAiRunOptions): UseAiRun {
    const storeRef = useRef<RunStore | null>(null);
    if (!storeRef.current) storeRef.current = createRunStore();
    const store = storeRef.current;
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

    // The latest options, read when a launch or save happens rather than
    // captured by the callbacks.
    const optsRef = useRef(options);
    optsRef.current = options;

    const cancelTokens = useRef<Record<string, boolean>>({});
    const interruptRef = useRef<Map<string, RunInterrupt>>(new Map());
    const pendingRef = useRef<LaunchSpec[]>([]);
    const activeRef = useRef<Set<string>>(new Set());
    const idleWaiters = useRef<Array<() => void>>([]);
    const seqRef = useRef(0);
    const donorsRef = useRef<DonorCandidate[] | null>(null);
    const keyErrorRef = useRef<RunError | null>(null);
    const disposedRef = useRef(false);

    useEffect(() => {
        store.dispatch({ type: 'sync', rows: options.items || [] });
    }, [store, options.items]);

    // A run in flight or generated work not yet saved: tell the work guard,
    // so a stale-chunk reload (main.tsx) asks instead of reloading.
    const holdsWork = useMemo(
        () => state.saving || Object.values(state.items).some(i => i.dirty || isBusy(i)),
        [state.items, state.saving],
    );
    useWorkGuard(holdsWork);

    const settleIdle = useCallback(() => {
        if (activeRef.current.size || pendingRef.current.length) return;
        const waiters = idleWaiters.current;
        idleWaiters.current = [];
        donorsRef.current = null;
        waiters.forEach(w => w());
    }, []);

    const keyMissing = useCallback(() => {
        if (keyErrorRef.current) return;
        const err: RunError = { code: 'key_missing', message: KEY_MISSING_MESSAGE };
        keyErrorRef.current = err;
        store.dispatch({ type: 'run-error', error: err });
    }, [store]);

    const interrupt = useCallback((specs: LaunchSpec[], reason: RunInterrupt) => {
        const at = Date.now();
        for (const s of specs) {
            delete cancelTokens.current[s.opId];
            store.dispatch({ type: 'op-settled', opId: s.opId, at, interrupted: reason });
        }
    }, [store]);

    const stop = useCallback(() => {
        const queued = pendingRef.current;
        pendingRef.current = [];
        interrupt(queued, 'stop');
        // The pipeline polls these tokens and aborts its AbortSignal, which
        // cancels the in-flight Gemini request itself, not just the wait.
        for (const opId of activeRef.current) {
            if (!interruptRef.current.has(opId)) interruptRef.current.set(opId, 'stop');
            cancelTokens.current[opId] = true;
        }
        settleIdle();
    }, [interrupt, settleIdle]);

    const checkAbort = useCallback(<T,>(id: string, promise: Promise<T>, timeoutMs?: number): Promise<T> => {
        if (cancelTokens.current[id]) return Promise.reject(new AiCancelledError());
        let interval: ReturnType<typeof setInterval> | undefined;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const guard = new Promise<T>((_, reject) => {
            interval = setInterval(() => {
                if (cancelTokens.current[id]) reject(new AiCancelledError());
            }, 300);
            if (timeoutMs) timeout = setTimeout(() => reject(new AiTimeoutError(timeoutMs)), timeoutMs);
        });
        return Promise.race([promise, guard]).finally(() => {
            if (interval) clearInterval(interval);
            if (timeout) clearTimeout(timeout);
        });
    }, []);

    const runOp = useCallback(async (spec: LaunchSpec) => {
        const { opId } = spec;
        const o = optsRef.current;
        if (cancelTokens.current[opId]) {
            store.dispatch({ type: 'op-settled', opId, at: Date.now(), interrupted: interruptRef.current.get(opId) || 'cancel' });
            return;
        }
        const ctx: PipelineContext = {
            updateOp: (id, updates) => {
                if (typeof updates === 'object' && updates.processErrors
                    && Object.values(updates.processErrors).some(m => m === KEY_MISSING_MESSAGE)) {
                    // Every next item would fail on the same missing key.
                    keyMissing();
                    queueMicrotask(stop);
                }
                store.dispatch({ type: 'op-update', opId: id, updates });
            },
            logOp: (id, text) => store.dispatch({ type: 'op-log', opId: id, text }),
            checkAbort,
            user: o.user,
            bgQuality: o.bgQuality || '2K',
            cancelTokens,
            // Unsaved state is the reducer's `dirty`, per item.
            setHasUnsavedChanges: () => {},
            // No setQueue: the hero's text is the item's text here, nothing is copied.
        };
        store.dispatch({ type: 'op-start', opId, at: Date.now() });
        let error: string | undefined;
        try {
            if (spec.kind === 'donor') {
                if (!donorsRef.current) donorsRef.current = buildDonorPool((o.donorInventory || []) as any[]);
                if (!donorsRef.current.length) {
                    store.dispatch({ type: 'op-log', opId, text: '[ SKIP ] No items with generated content to vary from' });
                } else {
                    await processVariationItem(spec.op, donorsRef.current, ctx);
                }
            } else {
                await processSingleItem(spec.op, ctx);
            }
        } catch (err) {
            if (err instanceof AiKeyMissingError) { keyMissing(); queueMicrotask(stop); }
            if (!(err instanceof AiCancelledError)) error = aiErrorMessage(err);
        }
        const interrupted = cancelTokens.current[opId] ? (interruptRef.current.get(opId) || 'cancel') : undefined;
        store.dispatch({ type: 'op-settled', opId, at: Date.now(), error: interrupted ? undefined : error, interrupted });
        delete cancelTokens.current[opId];
        interruptRef.current.delete(opId);
    }, [store, checkAbort, keyMissing, stop]);

    const pump = useCallback(() => {
        const limit = Math.max(1, optsRef.current.concurrency || RUN_CONCURRENCY);
        while (!disposedRef.current && activeRef.current.size < limit && pendingRef.current.length) {
            const spec = pendingRef.current.shift()!;
            activeRef.current.add(spec.opId);
            runOp(spec).finally(() => {
                activeRef.current.delete(spec.opId);
                pump();
                settleIdle();
            });
        }
    }, [runOp, settleIdle]);

    const whenIdle = useCallback(() => new Promise<void>(resolve => {
        if (!activeRef.current.size && !pendingRef.current.length) resolve();
        else idleWaiters.current.push(resolve);
    }), []);

    /** Plan, check the key, dispatch, enqueue. */
    const launch = useCallback(async (ids: string[], mode: 'fresh' | 'retry', opts: RunLaunchOptions = {}): Promise<RunStartResult> => {
        const o = optsRef.current;
        const st = store.getState();
        const processingMode: ProcessingMode = opts.processingMode || o.processingMode || 'bgreplace';
        const heroOnly = opts.heroOnly ?? o.heroOnly ?? false;
        const selection = opts.processes ? toSet(opts.processes) : toSet(o.processes);
        const launched: RunItem[] = [];
        const specs: LaunchSpec[] = [];
        const skips: { itemId: string; reason: string }[] = [];

        for (const id of ids) {
            const it = st.items[id];
            if (!it || isBusy(it) || it.saving) continue;
            const seq = ++seqRef.current;
            // An item holding generated results nobody saved is never
            // relaunched from scratch: the requested processes are merged into
            // its ops and everything else it has is kept.
            const holdsResults = it.ops.length > 0 && it.unsavedRun;
            let planned: { item: RunItem; specs: LaunchSpec[] } | null = null;
            if (mode === 'retry' && opts.processes) {
                planned = planRetryLaunch(it, { processingMode, seq, heroOnly, only: selection });
                if (!planned && it.ops.length) {
                    skips.push({ itemId: id, reason: 'None of the selected processes apply to this item' });
                    continue;
                }
            } else if (mode === 'retry') {
                planned = planRetryLaunch(it, { processingMode, seq });
            } else if (holdsResults) {
                planned = planRetryLaunch(it, { processingMode, seq, heroOnly, only: selection });
                if (!planned) {
                    skips.push({ itemId: id, reason: selection.size ? 'None of the selected processes apply to this item' : 'No process selected' });
                    continue;
                }
            }
            if (!planned) {
                // A retry with nothing left to retry regenerates the item's
                // last selection (or the current one if it never ran).
                const sel = mode === 'retry' && !opts.processes && it.selected.length ? new Set(it.selected) : selection;
                planned = holdsResults
                    ? planRetryLaunch(it, { processingMode, seq, heroOnly, only: sel })
                    : planFreshLaunch(it, sel, { processingMode, seq, heroOnly });
                if (!planned || !planned.specs.length) {
                    skips.push({ itemId: id, reason: sel.size ? 'None of the selected processes apply to this item' : 'No process selected' });
                    continue;
                }
            }
            launched.push(planned.item);
            specs.push(...planned.specs);
        }

        for (const s of skips) {
            store.dispatch({ type: 'skip', itemId: s.itemId, reason: s.reason, selected: Array.from(selection) });
        }
        if (!specs.length) return { started: 0 };

        const keyNeeded = specs.some(s => needsGeminiKey(s.op.processes || [], processingMode, s.kind === 'donor'));
        if (keyNeeded && !hasGeminiKey()) {
            const error: RunError = { code: 'key_missing', message: KEY_MISSING_MESSAGE };
            store.dispatch({ type: 'run-error', error });
            return { started: 0, error };
        }
        keyErrorRef.current = null;
        if (st.runError?.code === 'key_missing') store.dispatch({ type: 'run-error', error: null });

        for (const s of specs) cancelTokens.current[s.opId] = false;
        store.dispatch({ type: 'launch', items: launched, specs, fresh: mode === 'fresh', at: Date.now() });
        pendingRef.current.push(...specs);
        pump();
        await whenIdle();
        return { started: launched.length, error: keyErrorRef.current || undefined };
    }, [store, pump, whenIdle]);

    const start = useCallback((itemIds?: readonly string[], opts?: RunLaunchOptions) => {
        const st = store.getState();
        const ids = itemIds ? Array.from(itemIds) : st.order.filter(id => st.items[id]?.status === 'queued');
        return launch(ids, 'fresh', opts);
    }, [store, launch]);

    const retry = useCallback((target: RunTarget, opts?: RunLaunchOptions) => {
        const st = store.getState();
        const ids = target === 'failed'
            ? st.order.filter(id => st.items[id]?.status === 'failed' || st.items[id]?.status === 'partial')
            : Array.from(target);
        return launch(ids, 'retry', opts);
    }, [store, launch]);

    const cancel = useCallback((itemId: string) => {
        const mine = pendingRef.current.filter(s => s.itemId === itemId);
        pendingRef.current = pendingRef.current.filter(s => s.itemId !== itemId);
        interrupt(mine, 'cancel');
        const st = store.getState();
        for (const opId of activeRef.current) {
            if (st.opIndex[opId] !== itemId) continue;
            interruptRef.current.set(opId, 'cancel');
            cancelTokens.current[opId] = true;
        }
        settleIdle();
    }, [store, interrupt, settleIdle]);

    const accept = useCallback((itemId: string) => store.dispatch({ type: 'accept', itemId }), [store]);
    const reject = useCallback((itemId: string) => store.dispatch({ type: 'reject', itemId }), [store]);
    const edit = useCallback((itemId: string, patch: RunEditPatch) => store.dispatch({ type: 'edit', itemId, patch }), [store]);
    const setCutout = useCallback((itemId: string, photoIndex: number, dataUrl: string) =>
        store.dispatch({ type: 'manual-cutout', itemId, index: photoIndex, dataUrl, at: Date.now() }), [store]);
    const reset = useCallback((itemId: string, row?: any) => store.dispatch({ type: 'reset', itemId, row }), [store]);
    const clearRunError = useCallback(() => {
        keyErrorRef.current = null;
        store.dispatch({ type: 'run-error', error: null });
    }, [store]);

    const saveOne = useCallback(async (it: RunItem): Promise<{ outcome: SaveOutcome; savedRow?: InventoryRow | null; patch?: AiPatch; processes?: ProcessId[] }> => {
        const base = { itemId: it.id, label: it.label, warnings: [] as string[] };
        const user = optsRef.current.user;
        if (!it.rowId) return { outcome: { ...base, outcome: 'skipped', error: 'This item has no database id' } };
        const { result, processes } = saveSetOf(it);
        if (!processes.size) return { outcome: { ...base, outcome: 'empty' } };
        try {
            // The stored row, not the snapshot the screen opened with: the
            // JSON columns are merged into what is there NOW.
            // A failed read is a failed save: merging into the screen's
            // snapshot would drop entries written since the hub opened.
            const { data: stored, error: readErr } = await supabase.from('inventory').select('*').eq('id', it.rowId).maybeSingle();
            if (readErr) throw new Error(`Could not read the stored row: ${readErr.message}`);
            if (!stored) throw new Error('The item is no longer in the database');
            const patch = await buildAiPatch(result, stored as any, processes, { user });
            if (isEmptyPatch(patch)) return { outcome: { ...base, outcome: 'empty', warnings: patch.warnings } };
            const savedRow = await saveAiPatch(it.rowId, patch, { user });
            const columns = Object.keys(patch.columns);
            return {
                outcome: { ...base, outcome: patch.failedUploads.length ? 'incomplete' : 'saved', warnings: patch.warnings, columns },
                savedRow,
                patch,
                processes: Array.from(processes),
            };
        } catch (err) {
            return { outcome: { ...base, outcome: 'failed', error: aiErrorMessage(err) } };
        }
    }, []);

    const save = useCallback(async (target: SaveTarget): Promise<SaveOutcome[]> => {
        const st = store.getState();
        const ids = target === 'reviewed'
            ? st.order.filter(id => st.items[id]?.status === 'done' && st.items[id]?.dirty)
            : Array.from(target);
        const outcomes: SaveOutcome[] = [];
        if (!ids.length) return outcomes;
        store.dispatch({ type: 'saving', value: true });
        try {
            for (const id of ids) {
                const it = store.getState().items[id];
                if (!it || isBusy(it) || it.saving) {
                    outcomes.push({ itemId: id, label: it?.label || id, outcome: 'skipped', warnings: [], error: it ? 'Still running' : 'Unknown item' });
                    continue;
                }
                if (!it.dirty) {
                    outcomes.push({ itemId: id, label: it.label, outcome: 'empty', warnings: [] });
                    continue;
                }
                store.dispatch({ type: 'save-start', itemId: id });
                const res = await saveOne(it);
                store.dispatch({ type: 'save-done', itemId: id, outcome: res.outcome, savedRow: res.savedRow, patch: res.patch, processes: res.processes });
                outcomes.push(res.outcome);
            }
        } finally {
            store.dispatch({ type: 'saving', value: false });
        }
        return outcomes;
    }, [store, saveOne]);

    // Leaving the screen aborts whatever is in flight: the requests would
    // otherwise keep running, and billing, with nobody to show them to.
    useEffect(() => {
        disposedRef.current = false;
        return () => {
            disposedRef.current = true;
            stop();
        };
    }, [stop]);

    const items = useMemo(() => runItemsOf(state), [state]);
    const counts = useMemo(() => countByStatus(items), [items]);
    const progress = useMemo(() => overallProgress(state), [state]);
    const etaMs = estimateEtaMs(state, options.concurrency || RUN_CONCURRENCY);
    const get = useCallback((itemId: string) => store.getState().items[itemId], [store]);

    return {
        state,
        items,
        get,
        counts,
        progress,
        etaMs,
        isRunning: counts.running > 0,
        isSaving: state.saving,
        hasUnsavedChanges: counts.unsaved > 0,
        runError: state.runError,
        clearRunError,
        start,
        stop,
        cancel,
        retry,
        accept,
        reject,
        edit,
        save,
        setCutout,
        reset,
    };
}
