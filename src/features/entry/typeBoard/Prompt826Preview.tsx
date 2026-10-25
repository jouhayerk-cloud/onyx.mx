import React, { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { inventoryAtom } from '../../../lib/atoms';
import { tr, trf } from '../../../lib/i18n';
import {
    isBook826,
    buildInvoiceTitle826,
    buildContentPrompt826,
    validate826Output,
} from '../../../lib/ai/typePrompts';
import {
    getOnyx826Entry,
    getApprovedShopifyColors826,
    needsTopFlag,
    resolve826TypeId,
} from '../../../lib/taxonomy/onyx826';
import type {
    Prompt826Output,
    Validation826Result,
} from '../../../lib/ai/typePromptSpec';
import { generateJson } from '../../../lib/ai/client';
import { detectTopFromPhoto, generateCharacterAi826, type CharacterAi826Result } from '../../../lib/ai/prompts';
import {
    layaCheck826,
    layaMaterialFlag,
    layaColourFlag,
    layaDimsFlag,
    type LayaFlag826,
} from '../../../lib/ai/providers/laya';
import {
    checkLocalModelsHealth,
    localTargetFor826,
    type LocalHealth826,
} from '../../../lib/ai/routing';
import './prompt826Preview.css';

export interface Prompt826PreviewProps {
    onClose?: () => void;
}

interface PreviewItem {
    id: string;
    tag: string;
    vendor: string;
    type: string;
    shape: string;
    material: string;
    color: string;
    vendorColor: string;
    top?: 'open' | 'closed' | string;
    widthCm: number;
    lengthCm: number;
    heightCm: number;
    weightKg: number;
    oldTitle: string;
    oldBody: string;
    process?: string;
    photoUrl?: string;
    /** The stored character_ai, used as a sibling descriptor. */
    characterAi?: string;
}

/** Worked reference examples from Section 11 of PROMPTS_826_DRAFT.md */
const REFERENCE_826_ITEMS: readonly PreviewItem[] = [
    {
        id: 'ref-EM-017',
        tag: '826-EM-017',
        vendor: 'EM',
        type: 'pendant',
        shape: 'Cylinder',
        material: 'Onyx',
        color: 'Tehuacan Ice',
        vendorColor: 'Tehuacan Ice',
        top: 'open',
        widthCm: 10,
        lengthCm: 10,
        heightCm: 40,
        weightKg: 9,
        oldTitle: 'Elegant Cylinder Pendant Lights, White Ice',
        oldBody: 'Illuminate your space with the cool, ethereal glow of our Mexican Onyx Cylinder Pendant Light. The contemporary cylindrical shape, measuring 15 cm wide and 40 cm tall... A truly unique piece to elevate your home decor.',
    },
    {
        id: 'ref-JM-033',
        tag: '826-JM-033',
        vendor: 'JM',
        type: 'floor-lamp',
        shape: 'Square',
        material: 'Onyx',
        color: 'Pearlescent',
        vendorColor: 'Pearlescent',
        top: 'closed',
        widthCm: 30,
        lengthCm: 30,
        heightCm: 200,
        weightKg: 0,
        oldTitle: 'Exquisite Pearlescent Onyx Squared Floor Standing Architectural Luminary',
        oldBody: 'Introducing this exquisite Luminary, a true testament to artisanal Mexican stone craftsmanship meticulously hand-carved from a single block... This monumental sculptural piece...',
    },
    {
        id: 'ref-JM-024',
        tag: '826-JM-024',
        vendor: 'JM',
        type: 'bowl',
        shape: 'Medium',
        material: 'Onyx',
        color: 'Pearlescent',
        vendorColor: 'Pearlescent',
        top: 'open',
        widthCm: 50,
        lengthCm: 48,
        heightCm: 36,
        weightKg: 6,
        oldTitle: 'Meticulously Hand-Carved Onyx Bowl',
        oldBody: 'Showcasing the unique beauty of Mexican Onyx, this substantial hand-crafted bowl measures an impressive 50 x 36 x 48 cm...',
    },
    {
        id: 'ref-JM-049',
        tag: '826-JM-049',
        vendor: 'JM',
        type: 'canoe',
        shape: 'Large',
        material: 'Onyx',
        color: 'Nacar',
        vendorColor: 'Nacar',
        top: 'open',
        widthCm: 23,
        lengthCm: 100,
        heightCm: 10,
        weightKg: 0,
        oldTitle: 'Large Onyx Nacar Canoe Decorative Tray Exquisite Stone Carving',
        oldBody: 'Discover this exquisite artisanal piece... Meticulously hand-carved from a singular block... captivating inner glow...',
    },
    {
        id: 'ref-RF-038',
        tag: '826-RF-038',
        vendor: 'RF',
        type: 'mirror',
        shape: 'Rectangular',
        material: 'Fluorite',
        color: 'Purple Green',
        vendorColor: 'Purple Green',
        top: '',
        widthCm: 80,
        lengthCm: 10,
        heightCm: 120,
        weightKg: 40,
        oldTitle: 'Elegant Rectangular Mirror Framed in Exquisite Purple Green Serpentine',
        oldBody: 'A rectangular mirror framed in purple green fluorite, 80 cm wide and 120 cm tall... A magnificent focal point...',
    },
    {
        id: 'ref-RF-049',
        tag: '826-RF-049',
        vendor: 'RF',
        type: 'fountain',
        shape: 'Fountain',
        material: 'Calcite',
        color: 'Blue',
        vendorColor: 'Blue',
        top: '',
        widthCm: 30,
        lengthCm: 30,
        heightCm: 140,
        weightKg: 357,
        oldTitle: 'Striking Blue Fountain Rock',
        oldBody: 'Discover the serene beauty of our Calcite Fountain Rock. Expertly shaped to create a captivating water feature... With a height of 140 cm...',
    },
];

interface ClassifyResult {
    canonicalTypeId: string;
    family: string;
    /** 'open' | 'closed' | 'unknown' from the photo, or the record's value, or 'unset' / 'not needed'. */
    top: string;
    /** Whether Laya checked the copy: 'ran' when it was up, 'offline' when not. */
    laya: 'ran' | 'offline';
}

interface GeneratedEntry {
    output: Prompt826Output;
    validation: Validation826Result;
    classify?: ClassifyResult;
    character?: CharacterAi826Result;
    flags: LayaFlag826[];
    error?: string;
}

const normaliseKey = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Items that may share a character_ai sibling descriptor: same canonical type, material and colour. */
const siblingGroupKey = (it: { type: string; shape: string; material: string; color: string }) =>
    [resolve826TypeId(it.type, it.shape), normaliseKey(it.material), normaliseKey(it.color)].join('|');

/**
 * A photo as a data: URL for the model call. Null when there is no photo or the browser cannot
 * fetch it (the call then runs on the record alone and the card says so).
 */
async function photoDataUrl(url?: string): Promise<string | undefined> {
    if (!url) return undefined;
    if (url.startsWith('data:')) return url;
    if (!/^https?:\/\//.test(url)) return undefined;
    try {
        const res = await fetch(url);
        if (!res.ok) return undefined;
        const blob = await res.blob();
        return await new Promise<string | undefined>(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
            reader.onerror = () => resolve(undefined);
            reader.readAsDataURL(blob);
        });
    } catch {
        return undefined;
    }
}

export const Prompt826Preview: React.FC<Prompt826PreviewProps> = ({ onClose }) => {
    const liveRows = useAtomValue(inventoryAtom);

    // Merge live book 826 rows with reference items
    const items = useMemo<PreviewItem[]>(() => {
        const live826: PreviewItem[] = ((liveRows || []) as any[])
            .filter((r: any) => isBook826(r.data?.workbook || r.workbook))
            .map((r: any) => {
                const d = r.data || {};
                const tag = r.itemId || r.vendor_id || r.id;
                return {
                    id: String(r.id || tag),
                    tag: String(tag),
                    vendor: String(d.vendorId || d.vendor || r.vendor || '826'),
                    type: String(d.type || d.short_description || r.type || ''),
                    shape: String(d.shape || r.shape || ''),
                    material: String(d.material || r.material || 'Onyx'),
                    color: String(d.color || r.color || ''),
                    vendorColor: String(d.color || r.color || ''),
                    top: r.top_type ?? d.top_type ?? d.top ?? r.top,
                    widthCm: Number(d.width_cm ?? d.widthCm ?? 0),
                    lengthCm: Number(d.length_cm ?? d.lengthCm ?? 0),
                    heightCm: Number(d.height_cm ?? d.heightCm ?? 0),
                    weightKg: Number(d.weight_kg ?? d.weightKg ?? 0),
                    oldTitle: String(d.shopifyTitle || d.title || r.title || 'Untitled'),
                    oldBody: String(d.bodyHtml || d.body || r.body || 'No description recorded.'),
                    process: d.process,
                    photoUrl: r.photoUrl || (r.media_urls && r.media_urls[0]),
                    characterAi: d.character_ai ?? r.character_ai ?? undefined,
                };
            });

        // Combine live items and reference items (avoid duplicate IDs)
        const liveIds = new Set(live826.map(i => i.tag));
        const refs = REFERENCE_826_ITEMS.filter(ref => !liveIds.has(ref.tag));
        return [...live826, ...refs];
    }, [liveRows]);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(['ref-EM-017', 'ref-JM-033']));
    const [generating, setGenerating] = useState(false);
    const [results, setResults] = useState<Record<string, GeneratedEntry>>({});
    const [localHealth, setLocalHealth] = useState<LocalHealth826 | null>(null);

    useEffect(() => {
        let alive = true;
        checkLocalModelsHealth().then(h => { if (alive) setLocalHealth(h); });
        return () => { alive = false; };
    }, []);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(items.map(i => i.id)));
    };

    const clearAll = () => {
        setSelectedIds(new Set());
    };

    const runGeneration = async () => {
        if (selectedIds.size === 0 || generating) return;
        setGenerating(true);

        const toProcess = items.filter(i => selectedIds.has(i.id));
        const health = await checkLocalModelsHealth();
        setLocalHealth(health);
        const useLaya = localTargetFor826('classify_check', health) === 'laya';
        // Characters made earlier in this run are siblings for the items after them.
        const runCharacters: { group: string; character: string }[] = [];

        for (const item of toProcess) {
            try {
                const photo = await photoDataUrl(item.photoUrl);
                const group = siblingGroupKey(item);
                const siblingDescriptors = [
                    ...items
                        .filter(i => i.id !== item.id && i.characterAi && siblingGroupKey(i) === group)
                        .map(i => i.characterAi as string),
                    ...runCharacters.filter(r => r.group === group).map(r => r.character),
                ];

                // classify: taxonomy type, and the open/closed top from the photo when the type needs one
                const entry = getOnyx826Entry(item.type, item.shape);
                const topNeeded = needsTopFlag(item.type, item.shape);
                let top = item.top ? String(item.top) : (topNeeded ? 'unset' : 'not needed');
                if (topNeeded && !item.top && photo) top = await detectTopFromPhoto(photo);
                const classify: ClassifyResult = {
                    canonicalTypeId: resolve826TypeId(item.type, item.shape),
                    family: entry?.family ?? '',
                    top,
                    laya: useLaya ? 'ran' : 'offline',
                };

                // copy_826 (informed by photo)
                const built = buildContentPrompt826(item as any);
                const aiRes = await generateJson<{
                    shopifyTitle: string;
                    invoiceTitle?: string;
                    body: string;
                    dominantColors: string[];
                }>({
                    job: 'content',
                    prompt: built.prompt,
                    schema: built.schema,
                    images: photo ? [photo] : undefined,
                });

                const fallbackInvoice = buildInvoiceTitle826(item as any);
                const rawInvoice = aiRes?.invoiceTitle || fallbackInvoice;
                const invoiceTitle = rawInvoice.replace(/\[top:\s*confirm\]/gi, '').trim();
                const approvedColors = getApprovedShopifyColors826(item.vendorColor || item.color);
                const finalColors = aiRes?.dominantColors?.length ? aiRes.dominantColors : approvedColors;

                const output: Prompt826Output = {
                    invoiceTitle,
                    shopifyTitle: aiRes?.shopifyTitle || '',
                    body: aiRes?.body || '',
                    shopifyCategory: entry?.shopifyCategory || '',
                    shopifyProductType: entry?.shopifyProductType || '',
                    colourPattern: finalColors,
                    tags: [entry?.id, item.shape, item.material, item.vendorColor].filter(Boolean) as string[],
                    copyStatus: 'draft',
                };

                const validation = validate826Output(item as any, output);

                // Laya reads the copy and checks it against the record. It never sets the canonical type.
                const laya = useLaya
                    ? await layaCheck826({
                        title: item.type,
                        shape: item.shape,
                        description: output.body,
                        width_cm: item.widthCm || null,
                        height_cm: item.heightCm || null,
                        length_cm: item.lengthCm || null,
                    })
                    : null;
                const flags = [
                    layaMaterialFlag(item.material, laya),
                    layaColourFlag(output.colourPattern, laya),
                    layaDimsFlag(laya),
                ].filter((f): f is LayaFlag826 => f !== null);

                // character_ai, with one retry on a sibling collision
                const character = await generateCharacterAi826(item as any, { photo, siblingDescriptors });
                if (character.character) runCharacters.push({ group, character: character.character });

                setResults(prev => ({
                    ...prev,
                    [item.id]: {
                        output,
                        validation,
                        classify,
                        character,
                        flags,
                    },
                }));
            } catch (err: any) {
                console.error('[Prompt826Preview] Error generating item:', item.tag, err);
                setResults(prev => ({
                    ...prev,
                    [item.id]: {
                        output: {
                            invoiceTitle: buildInvoiceTitle826(item as any),
                            shopifyTitle: '',
                            body: '',
                            shopifyCategory: '',
                            shopifyProductType: '',
                            colourPattern: [],
                            tags: [],
                            copyStatus: 'draft',
                        },
                        validation: {
                            valid: false,
                            issues: [{
                                field: 'body',
                                rule: 'generation-failed',
                                message: err?.message || 'AI generation failed',
                                severity: 'error',
                            }],
                        },
                        error: err?.message || 'Generation failed',
                        flags: [],
                    },
                }));
            }
        }

        setGenerating(false);
    };

    return (
        <div className="p826-container">
            <header className="p826-header">
                <div className="p826-title-group">
                    <h2>{tr('826 Prompt & Output Preview')}</h2>
                    <p className="p826-subtitle">
                        {tr('Preview only. Runs classify, copy and character_ai for the selected items and shows validator flags. Nothing is saved.')}
                    </p>
                    <div className="p826-chips-row">
                        <span className={localHealth?.laya ? 'p826-badge p826-badge--ok' : 'p826-badge'}>
                            {trf('Laya: {s}', { s: localHealth ? (localHealth.laya ? tr('online') : tr('offline')) : tr('checking') })}
                        </span>
                        <span className={localHealth?.colibri ? 'p826-badge p826-badge--ok' : 'p826-badge'}>
                            {trf('Colibri: {s}', { s: localHealth ? (localHealth.colibri ? tr('online') : tr('offline')) : tr('checking') })}
                        </span>
                    </div>
                </div>
                <div className="p826-actions">
                    <button
                        type="button"
                        className="p826-btn"
                        onClick={selectAll}
                        disabled={generating}
                    >
                        {tr('Select All')}
                    </button>
                    <button
                        type="button"
                        className="p826-btn"
                        onClick={clearAll}
                        disabled={generating}
                    >
                        {tr('Clear')}
                    </button>
                    <button
                        type="button"
                        className="p826-btn p826-btn--primary"
                        onClick={runGeneration}
                        disabled={selectedIds.size === 0 || generating}
                    >
                        {generating
                            ? tr('Generating...')
                            : trf('Generate Selected ({n})', { n: selectedIds.size })}
                    </button>
                    {onClose && (
                        <button
                            type="button"
                            className="p826-btn"
                            onClick={onClose}
                        >
                            {tr('Close')}
                        </button>
                    )}
                </div>
            </header>

            {/* Selection Table */}
            <table className="p826-items-table">
                <thead>
                    <tr>
                        <th style={{ width: 36 }}></th>
                        <th>{tr('Tag / ID')}</th>
                        <th>{tr('Type')}</th>
                        <th>{tr('Shape')}</th>
                        <th>{tr('Top')}</th>
                        <th>{tr('Dimensions')}</th>
                        <th>{tr('Vendor Colour')}</th>
                        <th>{tr('character_ai')}</th>
                        <th>{tr('Status')}</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(item => {
                        const isSelected = selectedIds.has(item.id);
                        const res = results[item.id];
                        const dims = `${item.widthCm} x ${item.lengthCm} x ${item.heightCm} cm`;
                        return (
                            <tr key={item.id} onClick={() => toggleSelect(item.id)} style={{ cursor: 'pointer' }}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelect(item.id)}
                                        onClick={e => e.stopPropagation()}
                                    />
                                </td>
                                <td><strong>{item.tag}</strong></td>
                                <td>{item.type}</td>
                                <td>{item.shape || '—'}</td>
                                <td>{item.top || (needsTopFlag(item.type, item.shape) ? '[confirm]' : '—')}</td>
                                <td>{dims}</td>
                                <td>{item.vendorColor}</td>
                                <td>{res?.character?.character || '—'}</td>
                                <td>
                                    {res ? (
                                        res.validation.valid ? (
                                            <span className="p826-badge p826-badge--ok">{tr('Valid (Passed)')}</span>
                                        ) : (
                                            <span className="p826-badge p826-badge--err">
                                                {trf('{n} Flags', { n: res.validation.issues.length })}
                                            </span>
                                        )
                                    ) : (
                                        <span className="p826-badge">{tr('Not generated')}</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* Generated & Comparison Cards */}
            <div>
                {items
                    .filter(item => results[item.id] || selectedIds.has(item.id))
                    .map(item => {
                        const res = results[item.id];
                        const dims = `${item.widthCm} x ${item.lengthCm} x ${item.heightCm} cm`;
                        const invoiceTitle = res ? res.output.invoiceTitle : buildInvoiceTitle826(item as any);

                        return (
                            <article key={`card-${item.id}`} className="p826-item-card">
                                <div className="p826-card-header">
                                    <h3>{item.tag} &bull; {item.type} ({item.shape || 'Standard'})</h3>
                                    <div>
                                        {res && (
                                            res.validation.valid ? (
                                                <span className="p826-badge p826-badge--ok">{tr('Valid (Passed)')}</span>
                                            ) : (
                                                <span className="p826-badge p826-badge--err">
                                                    {trf('{n} Validation Issues', { n: res.validation.issues.length })}
                                                </span>
                                            )
                                        )}
                                    </div>
                                </div>

                                <div className="p826-card-body">
                                    {/* Left Column: Old Copy / Raw Record Facts */}
                                    <div className="p826-col-old">
                                        <div className="p826-section-title">{tr('Old Copy / Record Facts')}</div>
                                        <div className="p826-field">
                                            <div className="p826-field-label"><span>{tr('Old Title')}</span></div>
                                            <div className="p826-field-value">{item.oldTitle}</div>
                                        </div>
                                        <div className="p826-field">
                                            <div className="p826-field-label"><span>{tr('Old Body / Description')}</span></div>
                                            <div className="p826-field-value">{item.oldBody}</div>
                                        </div>
                                        <div className="p826-field">
                                            <div className="p826-field-label"><span>{tr('Record Measures & Facts')}</span></div>
                                            <div className="p826-field-value">
                                                Dimensions: {dims}<br />
                                                Weight: {item.weightKg > 0 ? `${item.weightKg} kg` : 'None'}<br />
                                                Top: {item.top || 'Not specified'}<br />
                                                Material: {item.material} | Colour: {item.vendorColor}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Book 826 Generated Copy */}
                                    <div>
                                        <div className="p826-section-title">{tr('Book 826 Output (Strict Rules)')}</div>

                                        <div className="p826-field">
                                            <div className="p826-field-label">
                                                <span>{tr('1. Identification Title (Deterministic)')}</span>
                                            </div>
                                            <div className="p826-field-value" style={{ fontWeight: 600 }}>
                                                {invoiceTitle}
                                            </div>
                                        </div>

                                        <div className="p826-field">
                                            <div className="p826-field-label">
                                                <span>{tr('2. Shopify Title (Grant format: 60-70 chars, Title Case, no articles)')}</span>
                                                {res && (
                                                    <span className={res.output.shopifyTitle.length >= 60 && res.output.shopifyTitle.length <= 70 ? 'p826-badge p826-badge--ok' : 'p826-badge p826-badge--err'}>
                                                        {res.output.shopifyTitle.length} chars
                                                    </span>
                                                )}
                                            </div>
                                            <div className="p826-field-value">
                                                {res?.output.shopifyTitle || <em>{tr('Click "Generate Selected" to produce copy')}</em>}
                                            </div>
                                        </div>

                                        <div className="p826-field">
                                            <div className="p826-field-label">
                                                <span>{tr('3. Body (600-750 chars plain text, no HTML)')}</span>
                                                {res && (
                                                    <span className={res.output.body.length >= 600 && res.output.body.length <= 750 ? 'p826-badge p826-badge--ok' : 'p826-badge p826-badge--err'}>
                                                        {res.output.body.length} chars
                                                    </span>
                                                )}
                                            </div>
                                            <div className="p826-field-value" style={{ whiteSpace: 'pre-wrap' }}>
                                                {res?.output.body || <em>{tr('Awaiting generation...')}</em>}
                                            </div>
                                        </div>

                                        {res && (
                                            <>
                                                <div className="p826-field">
                                                    <div className="p826-field-label">
                                                        <span>{tr('Classify & Local Checks')}</span>
                                                    </div>
                                                    <div className="p826-field-value">
                                                        <div><strong>Canonical type:</strong> {res.classify?.canonicalTypeId || '—'}</div>
                                                        <div><strong>Top:</strong> {res.classify?.top || '—'}</div>
                                                        <div><strong>Laya:</strong> {res.classify?.laya === 'ran' ? tr('checked the copy') : tr('not running (optional)')}</div>
                                                        {res.flags.length > 0 && (
                                                            <ul className="p826-issues-list">
                                                                {res.flags.map((f, idx) => (
                                                                    <li key={`flag-${idx}`} className="p826-issue-item p826-issue-item--warning">
                                                                        <strong>[{f.rule}]</strong>: {f.message}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="p826-field">
                                                    <div className="p826-field-label">
                                                        <span>{tr('4. character_ai (2 to 5 words, unique among siblings)')}</span>
                                                        {res.character && (
                                                            <span className={res.character.issues.length === 0 ? 'p826-badge p826-badge--ok' : 'p826-badge p826-badge--err'}>
                                                                {trf('{n} words', { n: res.character.character.split(/\s+/).filter(Boolean).length })}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="p826-field-value" style={{ fontWeight: 600 }}>
                                                        {res.character?.character || <em>{tr('No descriptor')}</em>}
                                                    </div>
                                                    {res.character && (
                                                        res.character.issues.length === 0 ? (
                                                            <div className="p826-badge p826-badge--ok" style={{ display: 'block', padding: 6 }}>
                                                                {trf('Passed. Model calls: {n}', { n: res.character.attempts })}
                                                            </div>
                                                        ) : (
                                                            <ul className="p826-issues-list">
                                                                {res.character.issues.map((iss, idx) => (
                                                                    <li key={`char-iss-${idx}`} className="p826-issue-item">
                                                                        <strong>[{iss.field} &bull; {iss.rule}]</strong>: {iss.message}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )
                                                    )}
                                                </div>
                                            </>
                                        )}
                                        {res && (
                                            <>
                                                <div className="p826-field">
                                                    <div className="p826-field-label">
                                                        <span>{tr('Shopify Taxonomy & Colours')}</span>
                                                    </div>
                                                    <div className="p826-field-value">
                                                        <div><strong>Category:</strong> {res.output.shopifyCategory}</div>
                                                        <div><strong>Product Type:</strong> {res.output.shopifyProductType}</div>
                                                        <div className="p826-chips-row">
                                                            <strong>Colours:</strong>
                                                            {res.output.colourPattern.map(c => (
                                                                <span key={c} className="p826-badge p826-badge--ok">{c}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Validation flags */}
                                                <div className="p826-field">
                                                    <div className="p826-field-label">
                                                        <span>{tr('Validator Checks')}</span>
                                                    </div>
                                                    {res.validation.issues.length === 0 ? (
                                                        <div className="p826-badge p826-badge--ok" style={{ display: 'block', padding: 6 }}>
                                                            {tr('All Book 826 rules passed: correct length, no banned words, proper casing, valid taxonomy.')}
                                                        </div>
                                                    ) : (
                                                        <ul className="p826-issues-list">
                                                            {res.validation.issues.map((iss, idx) => (
                                                                <li
                                                                    key={`iss-${idx}`}
                                                                    className={iss.severity === 'warning' ? 'p826-issue-item p826-issue-item--warning' : 'p826-issue-item'}
                                                                >
                                                                    <strong>[{iss.field} &bull; {iss.rule}]</strong>: {iss.message}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </article>
                        );
                    })}
            </div>
        </div>
    );
};
