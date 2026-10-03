/**
 * Generate, for the one item being entered or edited: the same process chips,
 * steps, media viewer and generated-content form as the Catalog Hub, on the
 * same run engine (lib/ai/run), so a title written here is written the way a
 * title is written there.
 *
 * Single-item Add Entry had no AI at all; its "Onyx Intelligence Engine" key
 * only reshuffled placeholder suggestions. Nothing here calls the AI until
 * Generate is pressed. The result is reviewed in place and saved WITH the
 * entry: on a new entry the generated columns go into the same insert, on an
 * edit through the engine's save by uuid. Edit Entry also shows what is
 * stored, so a bad AI title can be fixed without a trip to the hub.
 */
import { useId, useState } from 'react';
import { KeyRound, Play, RotateCcw, Sparkles, Square, X } from 'lucide-react';
import { tr, trf } from '../../lib/i18n';
import { getCleanImageUrl } from '../../lib/utils';
import { validateCopy } from '../../lib/copyValidation';
import { hasGeminiKey, setGeminiKey } from '../../lib/ai/keys';
import type { RunItem, RunPhoto, ProcessId, UseAiRun } from '../../lib/ai/run';
import {
    Field, GeneratedContent, Input, Key, MediaViewer, ProcessChips, StatusPill, StepsStrip, PROCESS_META,
    type GeneratedValue, type MediaAngle, type MediaView,
} from '../../components/ui';
import type { EntryPhoto } from './entryModel';

/** The processes Add Entry offers, in chip order (the donor pass is implied by a photo-less item). */
export const ENTRY_PROCESSES: readonly ProcessId[] = [
    'title_desc', 'marketing_desc', 'dominant_colors', 'product_type',
    'img_clean', 'image_segmentation', 'hex_map', 'video_proc',
];

const NEEDS_STILL: readonly ProcessId[] = ['img_clean', 'image_segmentation', 'hex_map'];

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
}

export function GeneratePanel({
    run, item, processes, onProcessesChange, photos, onGenerate, preparing, prepLabel,
    aiEnabled, onEnableAi, blockedReason, keyMissing, onKeySaved, mode,
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
    const generatedAny = !!item && item.ops.length > 0;

    if (!aiEnabled) {
        return (
            <section className="entry-gen" aria-labelledby={headId}>
                <div className="entry-gen__head">
                    <h3 id={headId} className="entry-h">{tr('Generate')}</h3>
                </div>
                <p className="entry-note">{tr('AI processes are switched off for Add Entry (AI PROCESSES in the header). The entry saves without generated content.')}</p>
                <div><Key size="sm" icon={<Sparkles size={13} />} onClick={onEnableAi}>{tr('Switch AI processes on')}</Key></div>
            </section>
        );
    }

    // ── viewer ──
    const stills = (item?.photos || []).filter(p => !p.isVideo);
    const outs = stills.map(outputsOf);
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
        // Nothing uploaded yet: the picked photos, so the card is never blank.
        : photos.filter(p => !p.isVideo).map(p => ({ photo: p.preview }));
    const views: MediaView[] = ['photo', 'png', ...(outs.some(o => o.cutout) ? ['cutout' as const] : []), 'mask', 'svg'];

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

    const failed = item && (item.status === 'failed' || item.status === 'partial');
    const pillState = item ? (item.dirty && item.status !== 'running' ? (item.status === 'queued' ? 'review' : item.status) : item.status) : 'queued';

    return (
        <section className="entry-gen" aria-labelledby={headId}>
            <div className="entry-gen__head">
                <h3 id={headId} className="entry-h">{tr('Generate')}</h3>
                {generatedAny && <StatusPill state={pillState} />}
                <span className="ui-grow" />
                {running
                    ? <Key size="sm" variant="stop" icon={<Square size={12} />} onClick={run.stop}>{tr('Stop')}</Key>
                    : <Key size="sm" variant="go" icon={<Play size={13} />} busy={preparing}
                        disabled={!!blockedReason || !runnable.length}
                        title={blockedReason || (runnable.length ? tr('Run the ticked processes on this entry') : tr('Tick at least one process.'))}
                        onClick={onGenerate}>
                        {tr('Generate')}
                    </Key>}
            </div>

            <ProcessChips value={processes} onChange={onProcessesChange} include={ENTRY_PROCESSES}
                unavailable={unavailable} disabled={busy} label={tr('Processes for this entry')} />

            {!hasStill && runnable.length > 0 && (
                <p className="entry-note">{tr('No photo yet: the text is written by varying the most similar item in the catalogue. Add a photo for a cleaned image and a mask.')}</p>
            )}

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

            {(generatedAny || mode === 'edit' || steps.length > 0) && (
                <div className="entry-result">
                    <div className="entry-result__media">
                        {angles.length > 0
                            ? <MediaViewer
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
                            : <div className="entry-result__empty">{tr('No photo')}</div>}
                    </div>
                    <div className="entry-result__body">
                        {steps.length > 0 && <StepsStrip steps={steps} label={tr('Process steps')} />}
                        {(preparing || item?.stage) && (
                            <p className="entry-note ui-tnum" aria-live="polite">
                                {preparing ? (prepLabel || tr('Preparing…')) : `${item?.stage} · ${Math.round(item?.progress || 0)}%`}
                            </p>
                        )}
                        <GeneratedContent
                            value={text}
                            onChange={busy || !item ? undefined : onTextChange}
                            fields={['title', 'colors', 'type']}
                            emptyLabel={mode === 'edit' ? tr('Not generated') : tr('Not generated yet')}
                        />
                    </div>
                </div>
            )}

            {(generatedAny || mode === 'edit') && (
                <GeneratedContent
                    value={text}
                    onChange={busy || !item ? undefined : onTextChange}
                    fields={['html']}
                    issues={issues}
                    emptyLabel={mode === 'edit' ? tr('Not generated') : tr('Not generated yet')}
                />
            )}

            {errors.length > 0 && (
                <ul className="ui-log" aria-label={tr('Errors')} style={{ listStyle: 'none' }}>
                    {errors.map(([p, m]) => (
                        <li key={p}><span className="ui-log__bad">[FAIL]</span> {tr(PROCESS_META[p]?.label || p)}: {m}</li>
                    ))}
                </ul>
            )}

            {item && !running && (failed || item.dirty) && (
                <div className="entry-gen__acts">
                    {failed && (
                        <Key size="sm" icon={<RotateCcw size={12} />} disabled={!!blockedReason}
                            onClick={() => { void run.retry([item.id]); }}>
                            {tr('Retry failed')}
                        </Key>
                    )}
                    {item.dirty && (
                        <Key size="sm" variant="quiet" icon={<X size={12} />}
                            title={tr('Drop what was generated and typed here; the entry fields are kept')}
                            onClick={() => run.reset(item.id)}>
                            {tr('Discard generated')}
                        </Key>
                    )}
                </div>
            )}

            <p className="entry-note entry-note--faint">
                {mode === 'create'
                    ? tr('Nothing is sent to the AI until you press Generate. What you see here is saved with the entry, in the same write.')
                    : tr('Nothing is sent to the AI until you press Generate. Changes here are saved with the entry.')}
            </p>
        </section>
    );
}
