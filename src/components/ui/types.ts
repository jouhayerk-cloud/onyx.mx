/**
 * Shared vocabulary for the UI kit: the run states every part draws, their
 * English labels, and the per-process metadata (short letter, label, group)
 * that the process chips and the steps strip both read, so the two can never
 * name a process differently.
 */
import type { CatalogProcess } from '../../lib/catalogHubProcesses';
import { tr } from '../../lib/i18n';

export type ProcessId = CatalogProcess['id'];

/** One process on one item. Same set the run engine (lib/ai/run.ts) reports. */
export type ProcessState = 'queued' | 'running' | 'done' | 'partial' | 'failed' | 'skipped';

/**
 * One item. The process states plus the two review states the hub adds on
 * top: `review` (generated, not yet accepted) and `saved` (written).
 */
export type ItemState = ProcessState | 'review' | 'saved';

export const ITEM_STATES: readonly ItemState[] =
    ['queued', 'running', 'done', 'partial', 'failed', 'skipped', 'review', 'saved'];

/** English source strings; render through tr() at the call site. */
export const ITEM_STATE_LABEL: Record<ItemState, string> = {
    queued: 'Queued',
    running: 'Running',
    done: 'Done',
    partial: 'Partial',
    failed: 'Failed',
    skipped: 'Skipped',
    review: 'To review',
    saved: 'Saved',
};

export const itemStateLabel = (state: ItemState): string => tr(ITEM_STATE_LABEL[state]);

export type ProcessGroup = 'text' | 'image';

export interface ProcessMeta {
    /** One or two letters for the steps strip square. */
    short: string;
    /** Chip and tooltip label (English source string). */
    label: string;
    group: ProcessGroup;
}

/**
 * Grouped by what the process PRODUCES, not by what it reads: colours need a
 * photo but come back as text, so they sit with Title / Description / Type.
 * img_clean is labelled by its visible output (the clean PNG); the SVG and
 * axo it also writes appear as viewer tabs, not as separate chips, because
 * they are not separate processes.
 */
export const PROCESS_META: Record<ProcessId, ProcessMeta> = {
    title_desc:         { short: 'T',  label: 'Title',       group: 'text' },
    marketing_desc:     { short: 'D',  label: 'Description', group: 'text' },
    dominant_colors:    { short: 'C',  label: 'Colours',     group: 'text' },
    product_type:       { short: 'Ty', label: 'Type',        group: 'text' },
    variation_donor:    { short: 'Dn', label: 'From similar', group: 'text' },
    img_clean:          { short: 'P',  label: 'Clean PNG',   group: 'image' },
    image_segmentation: { short: 'M',  label: 'Mask',        group: 'image' },
    hex_map:            { short: 'H',  label: 'Hex map',     group: 'image' },
    video_proc:         { short: 'V',  label: 'Video',       group: 'image' },
};

export const PROCESS_GROUP_LABEL: Record<ProcessGroup, string> = {
    text: 'Text',
    image: 'Image',
};

/** Join class names, skipping falsy ones. */
export const cx = (...parts: Array<string | false | null | undefined>): string =>
    parts.filter(Boolean).join(' ');
