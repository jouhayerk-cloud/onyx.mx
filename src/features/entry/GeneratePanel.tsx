/**
 * Generate, for the one item being entered or edited: compact toggle chips,
 * progress-driven progressive disclosure, skeletons while writing, and live
 * editable values when ready.
 *
 * Generated content expands only when a run is active or a result exists.
 * Fields not requested by the user are never shown.
 */
import { useId, useState } from 'react';
import { KeyRound, Play, RotateCcw, Sparkles, Square, X } from 'lucide-react';
import { tr, trf } from '../../lib/i18n';
import { getCleanImageUrl } from '../../lib/utils';
import { validateCopy } from '../../lib/copyValidation';
import { hasGeminiKey, setGeminiKey } from '../../lib/ai/keys';
import type { RunItem, RunPhoto, ProcessId, UseAiRun } from '../../lib/ai/run';
import {
    Field, Input, Key, MediaViewer, StatusPill, StepsStrip, PROCESS_META,
    type GeneratedValue, type MediaAngle, type MediaView, cx,
} from '../../components/ui';
import type { EntryPhoto } from './entryModel';
import './generatePanel.css';

/** The processes Add Entry offers, in chip order (the donor pass is implied by a photo-less item). */
export const ENTRY_PROCESSES: readonly ProcessId[] = [
    'title_desc', 'marketing_desc', 'dominant_colors', 'product_type',
    'img_clean', 'image_segmentation', 'hex_map', 'video_proc',
];

const NEEDS_STILL: readonly ProcessId[] = ['img_clean', 'image_segmentation', 'hex_map'];

interface ChipDef {
    id: ProcessId;
    labelKey: string;
}

const CHIP_DEFS: readonly ChipDef[] = [
    { id: 'title_desc', labelKey: 'Title' },
    { id: 'marketing_desc', labelKey: 'Description' },
    { id: 'dominant_colors', labelKey: 'Colours' },
    { id: 'product_type', labelKey: 'Type' },
    { id: 'img_clean', labelKey: 'Clean PNG' },
    { id: 'hex_map', labelKey: 'Hex map' },
    { id: 'image_segmentation', labelKey: 'Mask' },
    { id: 'video_proc', labelKey: 'Video' },
];

/** A URL an <img> can show: Drive links cleaned, data: URLs and markup passed through. */
const disp = (u?: string | null): string | undefined => {
    if (!u) return undefined;
    if (u.startsWith('data:') || u.startsWith('blob:') || u.trim().startsWith('<')) return u;
    return getCleanImageUrl(u) || u;
};

/** What one photo has to show: this run's output first, then what is stored. */
function outputsOf(p: RunPhoto) {
    const png = disp(p.cleanedUrl ?? p.stored.cleanedUrl);
    const cutout = disp(p.cutoutUrl ?? p.stored.cutoutUrl);
    const mask = disp(p.matteUrl ?? p.stored.matteUrl) ?? cutout;
    const svg = p.svgUrl ?? p.stored.svgUrl;
    return { photo: disp(p.sourceUrl) || '', png, cutout: cutout && cutout !== png ? cutout : undefined, mask, svg, opaque: !!png && png !== cutout };
}

/** Generated or edited this session, else what is stored (edit), else empty. */
export function shownText(it: RunItem | undefined): GeneratedValue {
    const ex = it?.item.existing;
    return {
        title: it?.text.title ?? ex?.title ?? '',
        html: it?.text.html ?? ex?.html ?? '',
        colors: it?.text.colors ?? ex?.colors ?? [],
        genType: it?.text.genType ?? ex?.genType ?? '',
    };
}

export interface GeneratePanelProps {
    run: UseAiRun;
    /** The run item of this entry. */
    item: RunItem | undefined;
    processes: ReadonlySet<ProcessId>;
    onProcessesChange: (next: Set<ProcessId>) => void;
    /** The entry's photos (picked or stored), for the viewer before anything is uploaded. */
    photos: readonly EntryPhoto[];
    onGenerate: () => void;
    /** Uploading photos or waiting for the run to start. */
    preparing: boolean;
    /** "Uploading photo 1 of 2", while preparing. */
    prepLabel?: string;
    /** The header's AI PROCESSES switch. */
    aiEnabled: boolean;
    onEnableAi: () => void;
    /** Why Generate cannot be pressed (demo mode, saving...). Already translated. */
    blockedReason?: string;
    /** The run asked for a key; the panel offers to store one. */
    keyMissing: boolean;
    onKeySaved: () => void;
    mode: 'create' | 'edit';
    /** Optional explicit content presence flag from parent layout. */
    hasContent?: boolean;
    className?: string;
}

/** Add Entry panel that runs the chosen AI processes and reveals results progressively. */
export function GeneratePanel({
    run, item, processes, onProcessesChange, photos, onGenerate, preparing, prepLabel,
    aiEnabled, onEnableAi, blockedReason, keyMissing, onKeySaved, mode,
    hasContent: hasContentProp, className,
}: GeneratePanelProps) {
    const [angle, setAngle] = useState(0);
    const [view, setView] = useState<MediaView>('photo');
    const [keyDraft, setKeyDraft] = useState('');
    const headId = useId();

    const hasStill = photos.some(p => !p.isVideo);
    const hasVideo = photos.some(p => p.isVideo);
    const unavailable: Partial<Record<ProcessId, string>> = {};
    if (!hasStill) NEEDS_STILL.forEach(p => { unavailable[p] = 'Needs a photo'; });
    if (!hasVideo) unavailable.video_proc = 'Needs a video';
    const runnable = Array.from(processes).filter(p => !unavailable[p]);

    const running = !!item && (item.status === 'running' || item.saving);
    const busy = running || preparing;
    const text = shownText(item);

    const toggleProcess = (id: ProcessId) => {
        if (busy || unavailable[id]) return;
        const next = new Set(processes);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onProcessesChange(next);
    };

    if (!aiEnabled) {
        return (
            <section className={cx('entry-gen', className)} aria-labelledby={headId}>
                <div className="entry-gen__head">
                    <h3 id={headId} className="entry-h">{tr('Generate')}</h3>
                </div>
                <p className="entry-note">{tr('AI processes are switched off for Add Entry (AI PROCESSES in the header). The entry saves without generated content.')}</p>
                <div><Key size="sm" icon={<Sparkles size={13} />} onClick={onEnableAi}>{tr('Switch AI processes on')}</Key></div>
            </section>
        );
    }

    // ── Field requirement checks ──
    const asked = (p: ProcessId): boolean => processes.has(p) || (item?.planned.includes(p) ?? false);
    const askTitle = asked('title_desc');
    const askDesc = asked('marketing_desc');
    const askColors = asked('dominant_colors');
    const askType = asked('product_type');
    const askImages = hasStill && (asked('img_clean') || asked('image_segmentation') || asked('hex_map') || asked('video_proc'));

    const titleReady = !!text.title || (item?.processStatus.title_desc === 'done');
    const descReady = !!text.html || (item?.processStatus.marketing_desc === 'done');
    const colorsReady = (text.colors.length > 0) || (item?.processStatus.dominant_colors === 'done');
    const typeReady = !!text.genType || (item?.processStatus.product_type === 'done');

    // ── Media viewer angles ──
    const stills = (item?.photos || []).filter(p => !p.isVideo);
    const outs = stills.map(outputsOf);
    const hasImageResult = outs.some(o => !!o.png || !!o.cutout || !!o.mask || !!o.svg);
    const imageReady = hasImageResult || ((item?.processStatus.img_clean === 'done' || item?.processStatus.image_segmentation === 'done') && stills.length > 0);

    const angles: MediaAngle[] = stills.length
        ? stills.map((p, i) => ({
            photo: outs[i].photo,
            png: outs[i].png || null,
            cutout: outs[i].cutout || null,
            mask: outs[i].mask || null,
            svg: outs[i].svg || null,
            meta: {
                png: { opaque: outs[i].opaque, source: p.cleanedUrl ? tr('this run') : outs[i].png ? tr('stored') : undefined },
                mask: { width: p.width, height: p.height, note: p.layerCount ? trf('{n} layers', { n: p.layerCount }) : undefined },
            },
        }))
        : photos.filter(p => !p.isVideo).map(p => ({ photo: p.preview }));
    const views: MediaView[] = ['photo', 'png', ...(outs.some(o => o.cutout) ? ['cutout' as const] : []), 'mask', 'svg'];

    const hasAnyReadyField = (askTitle && titleReady) ||
        (askDesc && descReady) ||
        (askColors && colorsReady) ||
        (askType && typeReady) ||
        (askImages && imageReady);

    const failed = !!item && (item.status === 'failed' || item.status === 'partial');
    const isExpanded = hasContentProp !== undefined ? hasContentProp : (busy || hasAnyReadyField || failed);

    const steps = ENTRY_PROCESSES
        .filter(p => (item?.planned.includes(p)) || (processes.has(p) && !unavailable[p]))
        .map(p => ({
            id: p,
            state: item?.processStatus[p] ?? 'queued',
            detail: item?.processErrors[p],
        }));

    const errors = Object.entries(item?.processErrors || {}).filter(([, m]) => !!m) as [ProcessId, string][];

    const issues = text.title || text.html
        ? validateCopy(text.title, text.html, {
            color: item?.item.vendorColor, material: item?.item.material,
            widthCm: item?.item.widthCm, heightCm: item?.item.heightCm, lengthCm: item?.item.lengthCm,
            quantity: item?.item.quantity || 1,
        })
        : [];

    const onTextChange = (next: GeneratedValue) => {
        if (!item) return;
        const was = shownText(item);
        const patch: Parameters<UseAiRun['edit']>[1] = {};
        if (next.title !== was.title) patch.title = next.title;
        if (next.html !== was.html) patch.html = next.html;
        if (next.genType !== was.genType) patch.genType = next.genType;
        if (next.colors.join('|') !== was.colors.join('|')) patch.colors = next.colors;
        if (Object.keys(patch).length) run.edit(item.id, patch);
    };

    const pillState = item ? (item.dirty && item.status !== 'running' ? (item.status === 'queued' ? 'review' : item.status) : item.status) : 'queued';

    return (
        <section className={cx('entry-gen', className)} aria-labelledby={headId}>
            <h3 id={headId} className="sr-only">{tr('Generate')}</h3>

            {/* 1. COMPACT TOGGLES: one tight row with GENERATE button at end */}
            <div className="gen-bar">
                <div className="gen-toggles" role="group" aria-label={tr('Processes for this entry')}>
                    {CHIP_DEFS.map(def => {
                        const active = processes.has(def.id) && !unavailable[def.id];
                        const reason = unavailable[def.id];
                        return (
                            <button
                                key={def.id}
                                type="button"
                                role="checkbox"
                                aria-checked={active}
                                aria-label={tr(def.labelKey)}
                                title={reason ? tr(reason) : tr(def.labelKey)}
                                disabled={busy || !!reason}
                                className={cx('gen-chip', active && 'gen-chip--active', !!reason && 'gen-chip--unavailable')}
                                onClick={() => toggleProcess(def.id)}
                            >
                                {tr(def.labelKey)}
                            </button>
                        );
                    })}
                </div>

                <div className="gen-bar__act">
                    {item && item.ops.length > 0 && !busy && <StatusPill state={pillState} />}
                    {running ? (
                        <Key size="sm" variant="stop" icon={<Square size={12} />} onClick={run.stop}>
                            {tr('Stop')}
                        </Key>
                    ) : (
                        <Key
                            size="sm"
                            variant="go"
                            icon={<Play size={13} />}
                            busy={preparing}
                            disabled={!!blockedReason || !runnable.length}
                            title={blockedReason || (runnable.length ? tr('Run the ticked processes on this entry') : tr('Tick at least one process.'))}
                            onClick={onGenerate}
                        >
                            {tr('Generate')}
                        </Key>
                    )}
                </div>
            </div>

            {/* No-photo note shows only when it applies */}
            {!hasStill && runnable.length > 0 && (
                <p className="entry-note entry-note--faint">
                    {tr('No photo yet: the text is written by varying the most similar item in the catalogue. Add a photo for a cleaned image and a mask.')}
                </p>
            )}

            {/* Key box if device lacks a key */}
            {keyMissing && (
                <div className="entry-keybox">
                    <Field label={tr('Gemini API key')} hint={hasGeminiKey()
                        ? tr('A key is stored on this device. Enter a new one to replace it.')
                        : tr('Stored on this device only. Needed for the text and the cleaned image.')}>
                        <Input type="password" mono autoComplete="off" value={keyDraft} placeholder={tr('AIzaSy...')}
                            onChange={(e) => setKeyDraft(e.target.value)} />
                    </Field>
                    <Key size="sm" variant="go" icon={<KeyRound size={13} />} disabled={!keyDraft.trim()}
                        onClick={() => { setGeminiKey(keyDraft.trim()); setKeyDraft(''); onKeySaved(); }}>
                        {tr('Save key & generate')}
                    </Key>
                </div>
            )}

            {/* 2. PROGRESSIVE DISCLOSURE: Result only when run active or content ready */}
            <div className={cx('gen-expandable', isExpanded && 'gen-expandable--expanded')}>
                <div className="gen-expandable__inner">
                    {/* Slim progress row while run is active */}
                    {busy && (
                        <div className="gen-progress-row" aria-live="polite">
                            <div className="gen-progress-info">
                                <span className="gen-progress-dot" aria-hidden="true" />
                                <span className="gen-progress-stage">
                                    {preparing ? (prepLabel || tr('Preparing…')) : (item?.stage || tr('Generating…'))}
                                </span>
                                {item?.progress !== undefined && item.progress > 0 && (
                                    <span className="gen-progress-pct ui-tnum">
                                        {`${Math.round(item.progress)}%`}
                                    </span>
                                )}
                            </div>
                            <div className="gen-progress-actions">
                                {running && (
                                    <Key size="xs" variant="stop" icon={<Square size={11} />} onClick={run.stop}>
                                        {tr('Stop')}
                                    </Key>
                                )}
                            </div>
                        </div>
                    )}

                    {steps.length > 0 && busy && (
                        <StepsStrip steps={steps} label={tr('Process steps')} />
                    )}

                    {/* Result card with requested fields only */}
                    <div className={cx('gen-result-card', !askImages && 'gen-result-card--no-media')}
                        aria-busy={busy ? 'true' : undefined}>
                        {askImages && (
                            <div className="gen-result-card__media">
                                {imageReady ? (
                                    angles.length > 0 ? (
                                        <MediaViewer
                                            key={item?.id || 'local'}
                                            angles={angles}
                                            views={views}
                                            angle={Math.min(angle, Math.max(0, angles.length - 1))}
                                            onAngleChange={setAngle}
                                            view={view}
                                            onViewChange={setView}
                                            aspect="1 / 1"
                                            alt={item?.label || tr('Entry')}
                                        />
                                    ) : (
                                        <div className="entry-result__empty">{tr('No photo')}</div>
                                    )
                                ) : (
                                    <div className="gen-skeleton gen-skeleton--media" aria-hidden="true" />
                                )}
                            </div>
                        )}

                        <div className="gen-result-card__fields">
                            {/* Title field */}
                            {askTitle && (
                                <Field
                                    label={tr('Title')}
                                    aside={
                                        <span className={cx('ui-tnum gen-counter', (text.title?.length || 0) > 70 && 'gen-counter--over')}>
                                            {`${(text.title || '').length} / 70`}
                                        </span>
                                    }
                                >
                                    {titleReady ? (
                                        <Input
                                            value={text.title || ''}
                                            disabled={busy}
                                            onChange={e => onTextChange({ ...text, title: e.target.value })}
                                            aria-label={tr('Generated title')}
                                        />
                                    ) : (
                                        <div className="gen-skeleton gen-skeleton--line" aria-hidden="true" />
                                    )}
                                </Field>
                            )}

                            {/* Type field */}
                            {askType && (
                                <Field label={tr('Type')}>
                                    {typeReady ? (
                                        <Input
                                            value={text.genType || ''}
                                            disabled={busy}
                                            onChange={e => onTextChange({ ...text, genType: e.target.value })}
                                            aria-label={tr('Generated type')}
                                        />
                                    ) : (
                                        <div className="gen-skeleton gen-skeleton--line" aria-hidden="true" />
                                    )}
                                </Field>
                            )}

                            {/* Colours field */}
                            {askColors && (
                                <Field label={tr('Colours')}>
                                    {colorsReady ? (
                                        <div className="gen-colors">
                                            {(text.colors || []).map((c, i) => (
                                                <span key={i} className="gen-color-pill">
                                                    <span className="gen-color-swatch" style={{ backgroundColor: c }} />
                                                    <span className="ui-tnum">{c}</span>
                                                </span>
                                            ))}
                                            <Input
                                                value={(text.colors || []).join(', ')}
                                                disabled={busy}
                                                onChange={e => {
                                                    const cols = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                                    onTextChange({ ...text, colors: cols });
                                                }}
                                                placeholder={tr('#hex, #hex...')}
                                                aria-label={tr('Generated colours')}
                                            />
                                        </div>
                                    ) : (
                                        <div className="gen-skeleton gen-skeleton--line" aria-hidden="true" />
                                    )}
                                </Field>
                            )}

                            {/* Description field */}
                            {askDesc && (
                                <Field label={tr('Description')}>
                                    {descReady ? (
                                        <>
                                            <textarea
                                                className="ui-input gen-textarea"
                                                rows={4}
                                                value={text.html || ''}
                                                disabled={busy}
                                                onChange={e => onTextChange({ ...text, html: e.target.value })}
                                                aria-label={tr('Generated description')}
                                            />
                                            {issues.length > 0 && (
                                                <ul className="gen-issues" aria-label={tr('Copy validation')}>
                                                    {issues.map((iss, idx) => (
                                                        <li key={idx} className="gen-issue">
                                                            <span aria-hidden="true">⚠️</span> {iss}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </>
                                    ) : (
                                        <div className="gen-skeleton gen-skeleton--multiline" aria-hidden="true" />
                                    )}
                                </Field>
                            )}
                        </div>
                    </div>

                    {/* Clear failure banner with retry */}
                    {failed && (
                        <div className="gen-error-banner" role="alert">
                            <div className="gen-error-msg">
                                <span aria-hidden="true">⚠️</span>
                                <span>
                                    {item?.error || (errors.length > 0
                                        ? `${tr(PROCESS_META[errors[0][0]]?.label || errors[0][0])}: ${errors[0][1]}`
                                        : tr('Generation encountered errors.'))}
                                </span>
                            </div>
                            <Key size="sm" icon={<RotateCcw size={12} />} disabled={!!blockedReason}
                                onClick={() => { void run.retry([item!.id]); }}>
                                {tr('Retry')}
                            </Key>
                        </div>
                    )}

                    {/* Actions when dirty */}
                    {item && !running && item.dirty && (
                        <div className="entry-gen__acts">
                            <Key size="sm" variant="quiet" icon={<X size={12} />}
                                title={tr('Drop what was generated and typed here; the entry fields are kept')}
                                onClick={() => run.reset(item.id)}>
                                {tr('Discard generated')}
                            </Key>
                        </div>
                    )}

                    <p className="entry-note entry-note--faint">
                        {mode === 'create'
                            ? tr('Nothing is sent to the AI until you press Generate. What you see here is saved with the entry, in the same write.')
                            : tr('Nothing is sent to the AI until you press Generate. Changes here are saved with the entry.')}
                    </p>
                </div>
            </div>
        </section>
    );
}
