import React, { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { inventoryAtom } from '../../../lib/atoms';
import { getCleanImageUrl } from '../../../lib/utils';
import { describeAxoIcon, getAxoIcon } from '../../../lib/axoIconCache';
import { classifyGeometry, GEOMETRY_LABELS, type GeometryClass } from '../../../lib/geometry';
import { canonicalType, typeKey, isPersonalType, type CanonicalResult } from '../../../lib/canonicalType';
import { tr, trf } from '../../../lib/i18n';
import { ShapeFigure } from '../hairline/ShapeFigure';
import type { Dims, Motif } from '../hairline/types';
import './typeBoard.css';

/**
 * Dev only: the Type review board. One card per canonical Type, showing the reference item's real photo and cutout,
 * the stored axonometric icon, the live axonometric icon and the current hairline figure, side by side, with the
 * issue flags. Reads the inventory atom only; nothing is fetched beyond the image URLs.
 */

type Data = Record<string, any>;

/** One inventory row, read once, with its cleaned photo, cutout and original photo resolved for display. */
interface Item {
    id: string;
    vendor: string;
    type: string;
    shape: string;
    data: Data;
    dims: Dims;
    complete: boolean;
    shapeIsType: boolean;
    canon: CanonicalResult;
    cleaned: string | null;
    cutout: string | null;
    media: string | null;
    stored: string | null;
    /** 0 cleaned + cutout, 1 cleaned, 2 original photo only, 3 no photo. Lower is better as a reference. */
    tier: number;
}

interface Group {
    key: string;
    label: string;
    count: number;
    spellings: Array<[string, number]>;
    shapes: Array<[string, number]>;
    median: Dims;
    holes: number[];
    shapeHoldsType: number;
    cleanCount: number;
    storedCount: number;
    storedNoPhoto: number;
    ref: Item;
    alternates: Item[];
    geo: GeometryClass;
    motif: Motif | null;
}

interface Totals {
    items: number;
    rawTypes: number;
    canonical: number;
    cleaned: number;
    stored: number;
}

/** Canonical Type ids that have a hairline motif. Everything else is drawn from its family silhouette alone. */
const MOTIFS: Partial<Record<string, Motif>> = {
    'pendant': 'pendant',
    'table-lamp': 'table-lamp',
    'floor-lamp': 'floor-lamp',
    'tower-lamp': 'tower-lamp',
    'wall-panel': 'wall-panel',
    'painted-wall-panel': 'wall-panel',
    'wine-rack': 'wine-rack',
    'table': 'table',
    'canoe': 'canoe',
    'fountain': 'fountain',
};

const text = (v: unknown): string => (v == null ? '' : String(v).trim());
const num = (v: unknown): number => parseFloat(String(v ?? '')) || 0;
const httpUrl = (v: unknown): string | null => {
    const s = text(v);
    return s.startsWith('http') ? s : null;
};
const cm = (v: number): string => (v > 0 ? String(Math.round(v * 10) / 10) : '—');
const dimsText = (d: Dims): string => `${cm(d.w)} x ${cm(d.h)} x ${cm(d.d)}`;

const rowData = (r: unknown): Data => {
    const nested = (r as { data?: unknown } | null)?.data;
    return (nested && typeof nested === 'object' ? nested : r || {}) as Data;
};

/**
 * processed_media_urls is a JSON map. Keys starting with "_" are metadata (colour, type, pixel map, bitmap);
 * every other key is a source photo mapped to its cleaned photo. Only http values count as photos.
 */
function cleanedUrls(d: Data): string[] {
    const raw = d.processed_media_urls ?? d.processedMediaUrls;
    let map: Data = {};
    if (raw && typeof raw === 'object') {
        map = raw;
    } else if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try { map = JSON.parse(raw) ?? {}; } catch { map = {}; }
    }
    const out: string[] = [];
    for (const [key, value] of Object.entries(map)) {
        const url = httpUrl(value);
        if (url && !key.startsWith('_')) out.push(getCleanImageUrl(url) ?? url);
    }
    return out;
}

function toItem(data: Data): Item | null {
    const type = text(data.short_description) || text(data.shortDescription);
    if (!type || isPersonalType(type)) return null;

    const shape = text(data.shape);
    const width = num(data.width_cm) || num(data.widthCm);
    const height = num(data.height_cm) || num(data.heightCm);
    const depth = num(data.length_cm) || num(data.lengthCm) || num(data.depth_cm) || num(data.depthCm);

    const cleaned = cleanedUrls(data)[0] ?? null;
    const cutout = getCleanImageUrl(httpUrl(data.generated_png_url) ?? httpUrl(data.generatedPngUrl));
    const media = getCleanImageUrl(
        text(data.media_urls || data.mediaUrls).split(',').map(s => s.trim()).find(s => s.startsWith('http')) ?? null,
    );
    const stored = getCleanImageUrl(httpUrl(data.axo_icon_url) ?? httpUrl(data.axoIconUrl));

    return {
        id: text(data.item_id ?? data.itemId),
        vendor: text(data.vendorId ?? data.vendor_id),
        type,
        shape,
        data,
        dims: { w: width, h: height, d: depth },
        complete: width > 0 && height > 0 && depth > 0,
        shapeIsType: canonicalType(shape).id !== null,
        canon: canonicalType(type, shape),
        cleaned,
        cutout,
        media,
        stored,
        tier: cleaned && cutout ? 0 : cleaned ? 1 : media ? 2 : 3,
    };
}

const median = (values: number[]): number => {
    const v = values.filter(x => x > 0).sort((a, b) => a - b);
    if (!v.length) return 0;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

const gap = (x: number, m: number): number => (x > 0 && m > 0 ? Math.abs(x - m) / m : 0);

/** Reference order: best photo tier first, then complete dimensions, then the item closest to the group median. */
function compareRefs(a: Item, b: Item, med: Dims): number {
    const dist = (i: Item) => (i.complete ? gap(i.dims.w, med.w) + gap(i.dims.h, med.h) + gap(i.dims.d, med.d) : 0);
    return a.tier - b.tier
        || Number(b.complete) - Number(a.complete)
        || dist(a) - dist(b)
        || a.id.localeCompare(b.id);
}

const tally = (values: string[]): Array<[string, number]> => {
    const m = new Map<string, number>();
    for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

function buildBoard(rows: readonly unknown[]): { groups: Group[]; totals: Totals } {
    const byKey = new Map<string, Item[]>();
    const counted: Item[] = [];
    for (const r of rows) {
        const item = toItem(rowData(r));
        if (!item) continue;
        counted.push(item);
        const key = typeKey(item.type, item.shape);
        const list = byKey.get(key);
        if (list) list.push(item); else byKey.set(key, [item]);
    }

    const groups: Group[] = [];
    for (const [key, items] of byKey) {
        const med: Dims = {
            w: median(items.map(i => i.dims.w)),
            h: median(items.map(i => i.dims.h)),
            d: median(items.map(i => i.dims.d)),
        };
        const [ref, ...rest] = [...items].sort((a, b) => compareRefs(a, b, med));
        const alternates = rest.filter(i => i.cleaned || i.media).slice(0, 2);
        const holes = [...new Set(items.map(i => i.canon.holes).filter((h): h is number => h !== undefined))]
            .sort((a, b) => a - b);

        groups.push({
            key,
            label: ref.canon.label,
            count: items.length,
            spellings: tally(items.map(i => i.type)),
            shapes: tally(items.map(i => i.shape)),
            median: med,
            holes,
            shapeHoldsType: items.filter(i => i.shapeIsType).length,
            cleanCount: items.filter(i => i.cleaned).length,
            storedCount: items.filter(i => i.stored).length,
            storedNoPhoto: items.filter(i => i.stored && i.tier === 3).length,
            ref,
            alternates,
            geo: classifyGeometry(ref.shape, text(ref.data.shortDescription) || text(ref.data.short_description) || text(ref.data.description)),
            motif: MOTIFS[ref.canon.id ?? ''] ?? null,
        });
    }

    groups.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const totals: Totals = {
        items: counted.length,
        rawTypes: new Set(counted.map(i => i.type)).size,
        canonical: groups.length,
        cleaned: counted.filter(i => i.cleaned).length,
        stored: counted.filter(i => i.stored).length,
    };
    return { groups, totals };
}

function Shot({ src, caption, empty }: { src: string | null; caption: string; empty?: string }) {
    return (
        <figure className="tb-shot">
            <div className="tb-shot-img">
                {src
                    ? <img src={src} alt={caption} loading="lazy" decoding="async" />
                    : <span className="tb-empty">{empty ?? tr('none')}</span>}
            </div>
            <figcaption>{caption}</figcaption>
        </figure>
    );
}

function TypeCard({ group, dark }: { group: Group; dark: boolean }) {
    const { ref, median: med, geo } = group;
    const [live, setLive] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setLive(null);
        getAxoIcon(describeAxoIcon(ref.data))
            .then(url => { if (alive) setLive(url || ''); })
            .catch(() => { if (alive) setLive(''); });
        return () => { alive = false; };
    }, [ref]);

    return (
        <article className="tb-card">
            <header className="tb-card-head">
                <h2 className="tb-card-title">{group.label}</h2>
                <span className="tb-count">{group.count}</span>
            </header>

            <p className="tb-line">
                <span className="tb-label">{tr('Raw spellings')}</span>{' '}
                {group.spellings.map(([s, n]) => `${s} (${n})`).join(' · ')}
            </p>
            <p className="tb-line">
                <span className="tb-label">{tr('Shapes')}</span>{' '}
                {group.shapes.slice(0, 6).map(([s, n]) => `${s || '—'} (${n})`).join(' · ')}
            </p>

            <dl className="tb-stats">
                <div><dt>{tr('Real cleaned photo')}</dt><dd>{group.cleanCount} / {group.count}</dd></div>
                <div><dt>{tr('Stored icon')}</dt><dd>{group.storedCount} / {group.count}</dd></div>
                <div><dt>{tr('Median W x H x D (cm)')}</dt><dd>{dimsText(med)}</dd></div>
            </dl>

            <section className="tb-ref">
                <h3 className="tb-label">{tr('Reference item')}</h3>
                <p className="tb-line">{`${ref.id || '—'} · ${ref.vendor || '—'} · ${ref.shape || '—'} · ${dimsText(ref.dims)}`}</p>
                <div className="tb-shots">
                    <Shot
                        src={ref.cleaned ?? ref.media}
                        caption={ref.cleaned ? tr('Cleaned photo') : ref.media ? tr('Original photo') : tr('No photo')}
                    />
                    <Shot src={ref.cutout} caption={tr('Cutout PNG')} />
                </div>
                {group.alternates.length > 0 && (
                    <div className="tb-alts">
                        <span className="tb-label">{tr('Alternates')}</span>
                        <div className="tb-alt-row">
                            {group.alternates.map((a, i) => {
                                const src = a.cleaned ?? a.media;
                                return src ? (
                                    <figure className="tb-alt" key={`${a.id}-${i}`}>
                                        <img src={src} alt={a.id} loading="lazy" decoding="async" />
                                        <figcaption>{a.id || '—'}</figcaption>
                                    </figure>
                                ) : null;
                            })}
                        </div>
                    </div>
                )}
            </section>

            <div className={`tb-cells ${dark ? 'is-dark' : 'is-light'}`}>
                <Shot src={ref.stored} caption={tr('Stored icon')} />
                <Shot src={live || null} caption={tr('Live icon')} empty={live === null ? tr('rendering') : tr('failed')} />
                <figure className="tb-shot tb-fig">
                    <div className="tb-shot-img">
                        <ShapeFigure
                            family={geo.geom}
                            isMirror={geo.isMirror}
                            motif={group.motif}
                            typeId={ref.canon.id}
                            dims={med}
                            holes={ref.canon.holes}
                        />
                    </div>
                    <figcaption>{tr('Hairline figure')}</figcaption>
                </figure>
            </div>
            <p className="tb-line">
                <span className="tb-label">{tr('Icon class')}</span>{' '}
                {tr(GEOMETRY_LABELS[geo.geom])}{geo.isMirror ? ` (${tr('mirror')})` : ''}
            </p>

            <ul className="tb-flags">
                {group.cleanCount === 0 && <li>{tr('no cleaned photo')}</li>}
                {geo.geom === 'box' && !geo.isMirror && <li>{tr('icon is a plain box')}</li>}
                {group.storedNoPhoto > 0 && <li>{`${tr('stored icon without a photo')} (${group.storedNoPhoto})`}</li>}
                {group.holes.length > 0 && <li>{trf('Type holds a count ({n} holes)', { n: group.holes.join(', ') })}</li>}
                {group.shapeHoldsType > 0 && <li>{tr('Shape holds the Type')}</li>}
            </ul>
        </article>
    );
}

export const TypeAuditBoard: React.FC = () => {
    const rows = useAtomValue(inventoryAtom);
    const { groups, totals } = useMemo(() => buildBoard(rows), [rows]);
    const [dark, setDark] = useState(true);

    return (
        <div className="tb-board">
            <div className="tb-banner" role="note">{tr('Dev only: Type review board')}</div>

            <header className="tb-head">
                <h1 className="tb-title">{tr('Type review board')}</h1>
                <dl className="tb-totals">
                    <div><dt>{tr('Items')}</dt><dd>{totals.items}</dd></div>
                    <div><dt>{tr('Raw Types')}</dt><dd>{totals.rawTypes}</dd></div>
                    <div><dt>{tr('Canonical Types')}</dt><dd>{totals.canonical}</dd></div>
                    <div><dt>{tr('Rows with a real cleaned photo')}</dt><dd>{totals.cleaned}</dd></div>
                    <div><dt>{tr('Rows with a stored icon')}</dt><dd>{totals.stored}</dd></div>
                </dl>
                <button
                    type="button"
                    className="tb-toggle"
                    aria-pressed={dark}
                    onClick={() => setDark(v => !v)}
                >
                    {tr('Dark figure backgrounds')}
                </button>
            </header>

            <div className="tb-grid">
                {groups.map(g => <TypeCard key={g.key} group={g} dark={dark} />)}
            </div>
        </div>
    );
};
