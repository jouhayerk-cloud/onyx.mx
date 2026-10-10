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
import { MIRROR_VARIANTS, mirrorVariantOf, type MirrorVariant } from '../hairline/typeFigures/mirrors';
import { lampVariantOf, type LampVariant } from '../hairline/typeFigures/lamps';
import './typeBoard.css';

/**
 * Dev only: the Type review board. One card per canonical Type, showing the reference item's real photo and cutout,
 * the stored axonometric icon, the live axonometric icon and the current hairline figure, side by side, with the
 * issue flags. A Type with shape variants (mirror, table lamp, pendant) gets one block per variant inside its card.
 * Reads the inventory atom only; nothing is fetched beyond the image URLs.
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

/** A shape variant of a Type: the reference, median and icon geometry of the rows whose Shape falls into it. */
type VariantKey = MirrorVariant | LampVariant;

interface VariantGroup {
    key: VariantKey;
    count: number;
    shapes: Array<[string, number]>;
    median: Dims;
    ref: Item;
    geo: GeometryClass;
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
    /** One block per shape variant that has rows, in VARIANT_ORDER. Empty for a Type without variants. */
    variants: VariantGroup[];
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

const LAMP_VARIANTS: readonly LampVariant[] = ['cylinder', 'squared'];

/** Canonical Type ids whose rows split by shape variant, in the order their variant blocks are drawn. */
const VARIANT_ORDER: Partial<Record<string, readonly VariantKey[]>> = {
    'mirror': MIRROR_VARIANTS,
    'table-lamp': LAMP_VARIANTS,
    'pendant': LAMP_VARIANTS,
};

const VARIANT_NAMES: Record<VariantKey, string> = {
    round: 'Round',
    squared: 'Squared',
    rectangular: 'Rectangular',
    cylinder: 'Cylinder',
};

const text = (v: unknown): string => (v == null ? '' : String(v).trim());
const num = (v: unknown): number => parseFloat(String(v ?? '')) || 0;
const httpUrl = (v: unknown): string | null => {
    const s = text(v);
    return s.startsWith('http') ? s : null;
};
const cm = (v: number): string => (v > 0 ? String(Math.round(v * 10) / 10) : '—');
const dimsText = (d: Dims): string => `${cm(d.w)} x ${cm(d.h)} x ${cm(d.d)}`;
const hasDims = (d: Dims): boolean => d.w > 0 || d.h > 0 || d.d > 0;

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

const geoOf = (item: Item): GeometryClass =>
    classifyGeometry(item.shape, text(item.data.shortDescription) || text(item.data.short_description) || text(item.data.description));

/** The variant a row falls into, by the same rule the hairline figure uses to pick its drawing from the Shape text. */
const variantOf = (typeId: string, shape: string): VariantKey =>
    typeId === 'mirror' ? mirrorVariantOf(shape) : lampVariantOf(shape);

function variantGroups(typeId: string, order: readonly VariantKey[], items: Item[]): VariantGroup[] {
    const out: VariantGroup[] = [];
    for (const key of order) {
        const list = items.filter(i => variantOf(typeId, i.shape) === key);
        if (!list.length) continue;
        const med: Dims = {
            w: median(list.map(i => i.dims.w)),
            h: median(list.map(i => i.dims.h)),
            d: median(list.map(i => i.dims.d)),
        };
        const [ref] = [...list].sort((a, b) => compareRefs(a, b, med));
        out.push({
            key,
            count: list.length,
            shapes: tally(list.map(i => i.shape || '—')),
            median: med,
            ref,
            geo: geoOf(ref),
        });
    }
    return out;
}

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
        const order = VARIANT_ORDER[key] ?? [];

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
            geo: geoOf(ref),
            motif: MOTIFS[ref.canon.id ?? ''] ?? null,
            variants: variantGroups(key, order, items),
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

/** The live axonometric icon of one row, generated from its geometry (null while it renders, '' if it failed). */
function useLiveIcon(data: Data): string | null {
    const [live, setLive] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setLive(null);
        getAxoIcon(describeAxoIcon(data))
            .then(url => { if (alive) setLive(url || ''); })
            .catch(() => { if (alive) setLive(''); });
        return () => { alive = false; };
    }, [data]);

    return live;
}

interface CellsProps {
    ref: Item;
    geo: GeometryClass;
    dims: Dims | null;
    motif: Motif | null;
    variant: VariantKey | null;
    dark: boolean;
}

/** The three figure cells: stored icon, live icon and hairline figure. */
function Cells({ ref, geo, dims, motif, variant, dark }: CellsProps) {
    const live = useLiveIcon(ref.data);

    return (
        <div className={`tb-cells ${dark ? 'is-dark' : 'is-light'}`}>
            <Shot src={ref.stored} caption={tr('Stored icon')} />
            <Shot src={live || null} caption={tr('Live icon')} empty={live === null ? tr('rendering') : tr('failed')} />
            <figure className="tb-shot tb-fig">
                <div className="tb-shot-img">
                    <ShapeFigure
                        family={geo.geom}
                        isMirror={geo.isMirror}
                        motif={motif}
                        typeId={ref.canon.id}
                        variant={variant}
                        dims={dims}
                        holes={ref.canon.holes}
                    />
                </div>
                <figcaption>{tr('Hairline figure')}</figcaption>
            </figure>
        </div>
    );
}

function GeoLine({ geo }: { geo: GeometryClass }) {
    return (
        <p className="tb-line">
            <span className="tb-label">{tr('Icon class')}</span>{' '}
            {tr(GEOMETRY_LABELS[geo.geom])}{geo.isMirror ? ` (${tr('mirror')})` : ''}
        </p>
    );
}

/** One shape variant of a Type inside its card: its own reference, live icon, geometry class and hairline figure. */
function VariantBlock({ motif, block, dark }: { motif: Motif | null; block: VariantGroup; dark: boolean }) {
    const { ref, median: med, geo } = block;

    return (
        <section className="tb-variant">
            <header className="tb-variant-head">
                <h3 className="tb-variant-title">{tr(VARIANT_NAMES[block.key])}</h3>
                <span className="tb-count">{block.count}</span>
            </header>

            <div className="tb-variant-top">
                <div className="tb-variant-photo">
                    <Shot
                        src={ref.cleaned ?? ref.media}
                        caption={ref.cleaned ? tr('Cleaned photo') : ref.media ? tr('Original photo') : tr('No photo')}
                    />
                </div>
                <div className="tb-variant-info">
                    <p className="tb-line">
                        <span className="tb-label">{tr('Shapes')}</span>{' '}
                        {block.shapes.map(([s, n]) => `${s} (${n})`).join(' · ')}
                    </p>
                    <p className="tb-line">
                        <span className="tb-label">{tr('Median W x H x D (cm)')}</span>{' '}
                        {dimsText(med)}
                    </p>
                    <p className="tb-line">
                        <span className="tb-label">{tr('Reference item')}</span>{' '}
                        {`${ref.id || '—'} · ${ref.vendor || '—'} · ${ref.shape || '—'} · ${dimsText(ref.dims)}`}
                    </p>
                </div>
            </div>

            <Cells ref={ref} geo={geo} dims={hasDims(med) ? med : null} motif={motif} variant={block.key} dark={dark} />
            <GeoLine geo={geo} />
        </section>
    );
}

function TypeCard({ group, dark }: { group: Group; dark: boolean }) {
    const { ref, median: med, geo, variants } = group;
    const hasVariants = variants.length > 0;

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
            {!hasVariants && (
                <p className="tb-line">
                    <span className="tb-label">{tr('Shapes')}</span>{' '}
                    {group.shapes.slice(0, 6).map(([s, n]) => `${s || '—'} (${n})`).join(' · ')}
                </p>
            )}

            <dl className="tb-stats">
                <div><dt>{tr('Real cleaned photo')}</dt><dd>{group.cleanCount} / {group.count}</dd></div>
                <div><dt>{tr('Stored icon')}</dt><dd>{group.storedCount} / {group.count}</dd></div>
                <div><dt>{tr('Median W x H x D (cm)')}</dt><dd>{dimsText(med)}</dd></div>
            </dl>

            {hasVariants ? (
                <div className="tb-variants">
                    {variants.map(v => <VariantBlock key={v.key} motif={group.motif} block={v} dark={dark} />)}
                </div>
            ) : (
                <>
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

                    <Cells ref={ref} geo={geo} dims={med} motif={group.motif} variant={null} dark={dark} />
                    <GeoLine geo={geo} />
                </>
            )}

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
