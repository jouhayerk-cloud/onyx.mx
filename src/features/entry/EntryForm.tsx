/**
 * The entry fields, organized into interactive collapsible sections:
 * Identity, Type, Details, Notes and photos.
 *
 * Each field provides one suggestion mechanism per device: desktop displays
 * TagRow buttons (chips), while mobile (coarse layout) presents an in-flow
 * SuggestionList. Datalist dropdowns have been removed. Sections auto-collapse
 * 400 ms after their required fields are filled and focus leaves them.
 */
import React, { useId, useMemo, useRef, useState } from 'react';
import { Link2, Lock, Star, Upload, X } from 'lucide-react';
import toast from '../onyxIsland/notify/toast';
import { getCleanImageUrl, isVideoFile } from '../../lib/utils';
import { tr, trf } from '../../lib/i18n';
import { el } from '../../lib/i18nEnums';
import { buildAttributeSuggestions, buildSizeSuggestions, type SizeSuggestion } from '../../lib/attributeSuggestions';
import { cleanSuggestions, type SuggestField } from '../../lib/entrySuggestions';
import { useTypeLibrary } from '../../lib/typeLibraryStore';
import { DEFAULT_ENTRY_STATUS, ENTRY_BOOKS, ENTRY_STATUSES, normalizeWorkbook } from '../../lib/inventoryCreate';
import { Field, Input, Key, Segmented, Select, VendorPicker, cx } from '../../components/ui';
import { VENDOR_CODES, photoKey, type EntryPhoto, type EntryState } from './entryModel';
import { readPickedFiles } from './entryMedia';
import { canonicalType } from '../../lib/canonicalType';
import { isLampOrVesselFamily } from '../../lib/taxonomy/onyx826';
import { detectTopFromPhoto } from '../../lib/ai/prompts';
import { ShapeLibraryField } from './ShapeLibraryField';
import { ShapeFigure } from './hairline/ShapeFigure';
import { SizeRow, TagRow } from './TagRow';
import { SuggestionList } from './SuggestionList';
import { EntrySection } from './EntrySection';
import { useCoarseLayout } from './hairline/useCoarseLayout';
import { CollapsingField } from './CollapsingField';
import './entrySections.css';
import './collapsingField.css';

export type EntryLocks = Partial<Record<'vendorId' | 'workbook' | 'itemNumber', string>>;

export interface EntryNumberState {
    checking: boolean;
    duplicate: boolean;
    /** The next free number, when known. */
    next?: number;
}

export interface EntryFormProps {
    value: EntryState;
    onChange: (patch: Partial<EntryState>) => void;
    photos: readonly EntryPhoto[];
    onPhotosChange: (next: EntryPhoto[]) => void;
    /** Fields that cannot change, each with the reason shown beside it. */
    locks?: EntryLocks;
    numberState?: EntryNumberState;
    /** Rows to learn the Shape / Type / Material / Colour suggestions from. */
    suggestionRows?: readonly any[];
    /** Normalised (lower-case) values never suggested, e.g. person names. Merged with the Type library's hidden values. */
    hiddenValues?: ReadonlySet<string>;
    /** Show the hairline Type selector above the Shape and Type inputs (Add Entry). */
    shapeLibrary?: boolean;
    /** A note under the photos, e.g. that reordering moves the stored cutouts. */
    photoNote?: string;
    disabled?: boolean;
}

/**
 * The manual columns only: what people typed for Shape, Type, Material, Colour
 * and the dimensions, and is_hidden for the Type library. The rows are reduced
 * to them before they are read, so the AI's category (generated_type) is never
 * offered as a value.
 */
function manualRows(rows: readonly any[] | undefined): any[] {
    return (rows || []).map(r => {
        const d = r?.data && typeof r.data === 'object' ? r.data : (r || {});
        return {
            shape: d.shape,
            material: d.material,
            color: d.color,
            short_description: d.short_description ?? d.shortDescription,
            width_cm: d.width_cm ?? d.widthCm,
            length_cm: d.length_cm ?? d.lengthCm,
            height_cm: d.height_cm ?? d.heightCm,
            is_hidden: d.is_hidden,
        };
    });
}

function useSuggestions(manual: any[], value: EntryState, hidden?: ReadonlySet<string>): Record<SuggestField, string[]> & { sizes: SizeSuggestion[] } {
    return useMemo(() => {
        const s = buildAttributeSuggestions(manual, {
            shape: value.shape, material: value.material, color: value.color, type: value.type,
        }, undefined, { hidden });
        return {
            shape: cleanSuggestions('shape', s.shape || []),
            type: cleanSuggestions('type', s.type || []),
            material: cleanSuggestions('material', s.material || []),
            color: cleanSuggestions('color', s.color || []),
            sizes: buildSizeSuggestions(manual, { shape: value.shape, type: value.type }),
        };
    }, [manual, hidden, value.shape, value.material, value.color, value.type]);
}

const BOOK_OPTIONS = ENTRY_BOOKS.map(b => ({ value: b, label: b.slice(1) }));

const TOP_OPTIONS = [
    { value: 'open' as const, label: tr('Open') },
    { value: 'closed' as const, label: tr('Closed') },
];

function dimsFor(value: EntryState): { w: number; h: number; d: number } | null {
    const w = parseFloat(value.widthCm);
    const h = parseFloat(value.heightCm);
    const d = parseFloat(value.lengthCm);
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0 && Number.isFinite(d) && d > 0) {
        return { w, h, d };
    }
    return null;
}

function formatPriceDisplay(price: string): string {
    const trimmed = price.trim();
    if (!trimmed) return '';
    const num = parseFloat(trimmed);
    if (Number.isFinite(num)) {
        return `$${num.toLocaleString('en-US')} MXN`;
    }
    return `$${trimmed} MXN`;
}

export function EntryForm({
    value, onChange, photos, onPhotosChange, locks = {}, numberState,
    suggestionRows, hiddenValues, shapeLibrary = false, photoNote, disabled = false,
}: EntryFormProps) {
    const uid = useId();
    const isMobile = useCoarseLayout();
    const manual = useMemo(() => manualRows(suggestionRows), [suggestionRows]);

    // shapeLibrary is fixed for a mounted form (Add Entry or Edit Entry), so the hook keeps its place in every render.
    // Edit Entry passes shapeLibrary false: the hook then makes no request for the Type library.
    const typeLib = useTypeLibrary(manual, shapeLibrary);
    const typeHidden = shapeLibrary ? typeLib.hidden : undefined;
    const hidden = useMemo(() => (
        typeHidden ? new Set([...(hiddenValues ?? []), ...typeHidden]) : hiddenValues
    ), [hiddenValues, typeHidden]);
    const suggestions = useSuggestions(manual, value, hidden);

    const fieldCounts = useMemo(() => {
        const counts: Record<SuggestField, Map<string, number>> = {
            shape: new Map(),
            type: new Map(),
            material: new Map(),
            color: new Map(),
        };
        for (const r of manual) {
            const s = (r.shape || '').trim().toLowerCase();
            if (s) counts.shape.set(s, (counts.shape.get(s) ?? 0) + 1);
            const t = (r.short_description || '').trim().toLowerCase();
            if (t) counts.type.set(t, (counts.type.get(t) ?? 0) + 1);
            const m = (r.material || '').trim().toLowerCase();
            if (m) counts.material.set(m, (counts.material.get(m) ?? 0) + 1);
            const c = (r.color || '').trim().toLowerCase();
            if (c) counts.color.set(c, (counts.color.get(c) ?? 0) + 1);
        }
        return counts;
    }, [manual]);

    // Section collapse state: Editing an existing entry (shapeLibrary false) starts with every section OPEN and does not auto-collapse.
    const [identityOpen, setIdentityOpen] = useState(true);
    const [detailsOpen, setDetailsOpen] = useState(true);
    const [notesOpen, setNotesOpen] = useState(true);

    const autoCollapse = shapeLibrary;

    const identityFilled = Boolean(
        value.vendorId.trim() &&
        normalizeWorkbook(value.workbook) &&
        value.itemNumber.trim() &&
        value.quantity.trim() &&
        Number(value.itemNumber) > 0 &&
        Number(value.quantity) > 0
    );

    const detailsFilled = Boolean(
        (value.shape.trim() || value.type.trim()) &&
        value.widthCm.trim() &&
        value.heightCm.trim() &&
        value.lengthCm.trim() &&
        Number(value.widthCm) > 0 &&
        Number(value.heightCm) > 0 &&
        Number(value.lengthCm) > 0
    );

    /** The field whose tags show: a suggested field, or the dimensions. */
    const [activeField, setActiveField] = useState<SuggestField | 'dims' | null>(null);
    const set = <K extends keyof EntryState>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        onChange({ [k]: e.target.value } as Partial<EntryState>);

    const is826 = String(value.workbook || '').replace(/\D/g, '') === '826';
    const showTopField = is826 && isLampOrVesselFamily(value.type, value.shape);

    const attemptedPhotoKeyRef = useRef<string | null>(null);

    React.useEffect(() => {
        if (!showTopField) return;
        if (value.top) return;
        const heroPhoto = photos.find(p => !p.isVideo && (p.preview || p.url));
        if (!heroPhoto) return;
        const pKey = heroPhoto.key || heroPhoto.url || heroPhoto.preview;
        if (!pKey || attemptedPhotoKeyRef.current === pKey) return;
        attemptedPhotoKeyRef.current = pKey;

        let cancelled = false;
        detectTopFromPhoto(heroPhoto.preview || heroPhoto.url!).then(res => {
            if (cancelled) return;
            if (res === 'open' || res === 'closed') {
                onChange({ top: res, topSuggested: true });
            }
        }).catch(err => {
            console.warn('detectTopFromPhoto failed', err);
        });

        return () => { cancelled = true; };
    }, [showTopField, value.top, photos, onChange]);

    /** Focus left a field (or the dimensions): its tags go, unless focus went into the same field's tags or list. */
    const leaveField = (e: React.FocusEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const next = e.relatedTarget as HTMLElement | null;
        const box = target.closest('.entry-dims') ?? target.closest('.ui-field');
        if (!box?.contains(next) && !next?.closest('.entry-tags-row') && !next?.closest('.entry-suggestions-mobile')) {
            setActiveField(null);
        }
    };

    const pickSize = (s: SizeSuggestion) => onChange({
        widthCm: s.widthCm === null ? '' : String(s.widthCm),
        lengthCm: s.lengthCm === null ? '' : String(s.lengthCm),
        heightCm: s.heightCm === null ? '' : String(s.heightCm),
    });

    // A stored vendor that is no longer in the list stays choosable.
    const vendorCodes = useMemo(() => (
        VENDOR_CODES.includes(value.vendorId) || !value.vendorId ? VENDOR_CODES : [value.vendorId, ...VENDOR_CODES]
    ), [value.vendorId]);

    const statusOptions = useMemo(() => {
        const list: string[] = [...ENTRY_STATUSES];
        if (value.status && !list.includes(value.status)) list.unshift(value.status);
        return list.map(s => ({ value: s, label: String(el(s)) }));
    }, [value.status]);

    const statusDisplay = statusOptions.find(o => o.value === value.status)?.label || (value.status ? String(el(value.status)) : '');

    const dimsFilled = Boolean(
        value.widthCm.trim() &&
        value.heightCm.trim() &&
        value.lengthCm.trim()
    );
    const dimsValue = dimsFilled ? `${value.widthCm}×${value.heightCm}×${value.lengthCm}` : '';
    const dimsDisplay = dimsFilled ? `${value.widthCm} × ${value.heightCm} × ${value.lengthCm} cm` : '';

    const lockAside = (reason?: string) => reason
        ? <span title={reason} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={10} aria-hidden="true" />{tr('fixed')}</span>
        : undefined;

    const numberAside = locks.itemNumber
        ? lockAside(locks.itemNumber)
        : numberState?.checking ? tr('checking…')
            : numberState?.next && String(numberState.next) !== value.itemNumber ? trf('next {n}', { n: numberState.next })
                : undefined;

    const textField = (f: SuggestField, label: string, span = '') => (
        <Field label={label} className={span}>
            <Input
                value={value[f]}
                onChange={set(f)}
                onFocus={() => setActiveField(f)}
                autoComplete="off"
                disabled={disabled}
                data-field={f}
            />
        </Field>
    );

    /** Escape in a field's tag row or suggestion list gives focus back to the field's input. */
    const backToField = (e: React.KeyboardEvent<HTMLDivElement>, f: SuggestField) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.closest('.entry-field-cell, .entry-grid, .entry-details-flow, .entry-collapsing-field')?.querySelector<HTMLInputElement>(`input[data-field="${f}"]`)?.focus();
    };

    /** Mirrors, table lamps and pendants come in shapes (Round, Squared, Rectangular; Cylinder, Squared): their Shape tags show the drawing of each. */
    const variantTypeId = canonicalType(value.type).id;
    const shapeLead = variantTypeId === 'mirror' || variantTypeId === 'table-lamp' || variantTypeId === 'pendant'
        ? (tag: string) => <ShapeFigure family={variantTypeId === 'mirror' ? 'box' : 'cylinder'} isMirror={variantTypeId === 'mirror'}
            typeId={variantTypeId} variant={tag} dims={null} className="tag-fig" />
        : undefined;

    /** A text field and its suggestions in ONE cell: the tags or list render UNDER their own input, never at the start of the line. */
    const suggestField = (f: SuggestField, label: string, tagsLabel: string, span = '') => (
        <div className={cx('entry-field-cell', span)}>
            {textField(f, label)}
            {suggestionRow(f, tagsLabel)}
        </div>
    );

    /**
     * Single suggestion mechanism per device:
     * Mobile shows SuggestionList (44px rows with count). Desktop shows TagRow (chips). Never both.
     */
    const suggestionRow = (f: SuggestField, label: string) => {
        if (activeField !== f || suggestions[f].length === 0) return null;
        if (isMobile) {
            return (
                <div className="entry-suggestions-mobile entry-field-suggestions" onKeyDownCapture={e => backToField(e, f)}>
                    <SuggestionList
                        label={label}
                        suggestions={suggestions[f]}
                        max={12}
                        getCount={val => fieldCounts[f].get(val.trim().toLowerCase())}
                        onPick={tag => {
                            onChange({ [f]: tag } as Partial<EntryState>);
                            setActiveField(null);
                        }}
                        onClose={() => setActiveField(null)}
                        renderLead={f === 'shape' ? shapeLead : undefined}
                    />
                </div>
            );
        }
        return (
            <div className="entry-tags-row entry-field-suggestions" onKeyDownCapture={e => backToField(e, f)}>
                <TagRow
                    label={label}
                    tags={suggestions[f]}
                    max={10}
                    onPick={tag => onChange({ [f]: tag } as Partial<EntryState>)}
                    renderLead={f === 'shape' ? shapeLead : undefined}
                />
            </div>
        );
    };

    const numField = (f: keyof EntryState, label: string, span = '', opts: { step?: string; min?: string; onFocus?: () => void } = {}) => (
        <Field label={label} className={span}>
            <Input type="number" inputMode="decimal" min={opts.min ?? '0'} step={opts.step ?? 'any'} className="ui-tnum"
                value={value[f] as string | number} onChange={set(f)} onFocus={opts.onFocus} disabled={disabled} data-field={String(f)} />
        </Field>
    );

    const focusDims = () => setActiveField('dims');

    const identitySummary = useMemo(() => [
        value.vendorId,
        value.workbook ? normalizeWorkbook(value.workbook).slice(1) : '',
        value.itemNumber ? `#${value.itemNumber}` : '',
        value.quantity ? `${value.quantity} ${tr('Qty')}` : '',
    ].filter(Boolean), [value.vendorId, value.workbook, value.itemNumber, value.quantity]);

    const detailsSummary = useMemo(() => {
        const list: string[] = [];
        if (value.shape) list.push(value.shape);
        if (value.type && value.type !== value.shape) list.push(value.type);
        if (value.top) list.push(`${value.top} top`);
        if (value.material) list.push(value.material);
        if (value.color) list.push(value.color);
        if (value.status && value.status !== DEFAULT_ENTRY_STATUS) list.push(String(el(value.status)));
        const dims = [value.widthCm, value.heightCm, value.lengthCm].filter(Boolean).join('×');
        if (dims) list.push(`${dims} cm`);
        if (value.weightKg) list.push(`${value.weightKg} kg`);
        if (value.price) list.push(`$${value.price} MXN`);
        return list;
    }, [value.shape, value.type, value.top, value.material, value.color, value.status, value.widthCm, value.heightCm, value.lengthCm, value.weightKg, value.price]);

    const notesSummary = useMemo(() => {
        const list: string[] = [];
        if (value.description.trim()) {
            const desc = value.description.trim();
            list.push(desc.length > 24 ? `${desc.slice(0, 24)}…` : desc);
        }
        if (photos.length > 0) {
            list.push(trf('{n} photos', { n: photos.length }));
        }
        return list;
    }, [value.description, photos.length]);

    return (
        <div className="entry-form" onBlur={leaveField}>
            {/* Identity Section: vendor, book, number, quantity */}
            <EntrySection
                id={`${uid}-identity`}
                title={tr('Identity')}
                open={identityOpen}
                onToggle={() => setIdentityOpen(prev => !prev)}
                onOpen={() => setIdentityOpen(true)}
                onCollapse={() => setIdentityOpen(false)}
                summary={identitySummary}
                isFilled={identityFilled}
                autoCollapse={autoCollapse}
            >
                <div className="entry-grid">
                    <Field label={tr('Vendor')} className="s6" group>
                        <VendorPicker codes={vendorCodes} value={value.vendorId}
                            onChange={(code) => onChange({ vendorId: code })}
                            book={String(value.workbook || '').replace(/v/gi, '')}
                            disabled={disabled} lockedReason={locks.vendorId} />
                    </Field>

                    <Field label={tr('Book')} className="s2" group={!locks.workbook} aside={lockAside(locks.workbook)}>
                        {locks.workbook
                            ? <Input readOnly value={normalizeWorkbook(value.workbook).slice(1)} title={locks.workbook} className="ui-tnum" />
                            : <Segmented label={tr('Book')} value={normalizeWorkbook(value.workbook) as typeof ENTRY_BOOKS[number]}
                                options={BOOK_OPTIONS} disabled={disabled}
                                onChange={(wb) => onChange({ workbook: wb })} />}
                    </Field>

                    <Field label="#" aside={numberAside}
                        error={numberState?.duplicate ? trf('{id} is taken in this book', {
                            id: `${value.vendorId}-${String(value.itemNumber).padStart(3, '0')}`,
                        }) : undefined}>
                        <Input type="number" inputMode="numeric" min="1" step="1" className="ui-tnum" value={value.itemNumber}
                            onChange={set('itemNumber')} readOnly={!!locks.itemNumber} title={locks.itemNumber}
                            disabled={disabled} />
                    </Field>

                    {numField('quantity', tr('Qty'), '', { min: '1', step: '1' })}
                </div>
            </EntrySection>

            {/* Type Section: Hairline Type picker (not collapsible, no header) */}
            {shapeLibrary && (
                <EntrySection
                    id={`${uid}-type`}
                    title={tr('Type')}
                    open={true}
                    onToggle={() => {}}
                    collapsible={false}
                >
                    <Field label={tr('Types')} className="s6" group hint={tr('Pick a Type, or type below. Both stay in step.')}>
                        <ShapeLibraryField
                            value={{ type: value.type, shape: value.shape }}
                            onChange={patch => onChange(patch)}
                            dims={dimsFor(value)}
                            library={typeLib.library}
                            loading={typeLib.loading}
                            onSave={typeLib.save}
                            disabled={disabled}
                        />
                    </Field>
                </EntrySection>
            )}

            {/* Details Section: shape, type, material, color, status, dims, weight, price */}
            <EntrySection
                id={`${uid}-details`}
                title={tr('Details')}
                open={detailsOpen}
                onToggle={() => setDetailsOpen(prev => !prev)}
                onOpen={() => setDetailsOpen(true)}
                onCollapse={() => setDetailsOpen(false)}
                summary={detailsSummary}
                isFilled={detailsFilled}
                autoCollapse={autoCollapse}
            >
                {shapeLibrary ? (
                    <div className="entry-details-flow">
                        <CollapsingField label={tr('Shape')} value={value.shape}>
                            {suggestField('shape', tr('Shape'), tr('Shape tags'))}
                        </CollapsingField>

                        <CollapsingField label={tr('Type')} value={value.type}>
                            {suggestField('type', tr('Type'), tr('Type tags'))}
                        </CollapsingField>

                        {showTopField && (
                            <CollapsingField label={tr('Top')} value={value.top || ''} display={value.top ? String(value.top) : ''}>
                                <Field
                                    label={tr('Top')}
                                    aside={value.topSuggested ? <span className="entry-suggested-badge" style={{ fontSize: 11, color: 'var(--amber-11, #d97706)' }}>{tr('suggested - confirm')}</span> : undefined}
                                >
                                    <Segmented
                                        size="sm"
                                        label={tr('Top')}
                                        value={value.top || ''}
                                        options={TOP_OPTIONS}
                                        disabled={disabled}
                                        onChange={(top) => onChange({ top: top as 'open' | 'closed', topSuggested: false })}
                                    />
                                </Field>
                            </CollapsingField>
                        )}

                        <CollapsingField label={tr('Material')} value={value.material}>
                            {suggestField('material', tr('Material'), tr('Material tags'))}
                        </CollapsingField>

                        <CollapsingField label={tr('Vendor colour')} value={value.color}>
                            {suggestField('color', tr('Vendor colour'), tr('Colour tags'))}
                        </CollapsingField>

                        <CollapsingField label={tr('Status')} value={value.status} display={statusDisplay}>
                            <Field label={tr('Status')}>
                                <Select value={value.status} onChange={set('status')} options={statusOptions} disabled={disabled} />
                            </Field>
                        </CollapsingField>

                        <CollapsingField
                            label={tr('Dimensions')}
                            value={dimsValue}
                            display={dimsDisplay}
                            className="entry-collapsing-field--dims"
                        >
                            <div className="entry-dims-group">
                                <div className="entry-dims entry-dims-inputs">
                                    {numField('widthCm', tr('W cm'), '', { onFocus: focusDims })}
                                    {numField('heightCm', tr('H cm'), '', { onFocus: focusDims })}
                                    {numField('lengthCm', tr('D cm'), '', { onFocus: focusDims })}
                                </div>
                                {activeField === 'dims' && suggestions.sizes.length > 0 && (
                                    <div className="entry-field-suggestions">
                                        <SizeRow sizes={suggestions.sizes} onPick={pickSize} />
                                    </div>
                                )}
                            </div>
                        </CollapsingField>

                        <CollapsingField label={tr('Kg')} value={value.weightKg} display={value.weightKg.trim() ? `${value.weightKg} kg` : ''}>
                            {numField('weightKg', tr('Kg'))}
                        </CollapsingField>

                        <CollapsingField label={tr('Price MXN')} value={value.price} display={formatPriceDisplay(value.price)}>
                            {numField('price', tr('Price MXN'))}
                        </CollapsingField>
                    </div>
                ) : (
                    <div className="entry-grid">
                        {suggestField('shape', tr('Shape'), tr('Shape tags'), 's2')}
                        {suggestField('type', tr('Type'), tr('Type tags'), 's2')}
                        {showTopField && (
                            <Field
                                label={tr('Top')}
                                className="s2"
                                aside={value.topSuggested ? <span className="entry-suggested-badge" style={{ fontSize: 11, color: 'var(--amber-11, #d97706)' }}>{tr('suggested - confirm')}</span> : undefined}
                            >
                                <Segmented
                                    size="sm"
                                    label={tr('Top')}
                                    value={value.top || ''}
                                    options={TOP_OPTIONS}
                                    disabled={disabled}
                                    onChange={(top) => onChange({ top: top as 'open' | 'closed', topSuggested: false })}
                                />
                            </Field>
                        )}
                        {suggestField('material', tr('Material'), tr('Material tags'), 's2')}
                        {suggestField('color', tr('Vendor colour'), tr('Colour tags'), 's3')}

                        <Field label={tr('Status')} className="s3">
                            <Select value={value.status} onChange={set('status')} options={statusOptions} disabled={disabled} />
                        </Field>

                        <div className="entry-dims">
                            {numField('widthCm', tr('W cm'), '', { onFocus: focusDims })}
                            {numField('heightCm', tr('H cm'), '', { onFocus: focusDims })}
                            {numField('lengthCm', tr('D cm'), '', { onFocus: focusDims })}
                            {activeField === 'dims' && suggestions.sizes.length > 0 && (
                                <div className="s6">
                                    <SizeRow sizes={suggestions.sizes} onPick={pickSize} />
                                </div>
                            )}
                        </div>
                        {numField('weightKg', tr('Kg'))}
                        {numField('price', tr('Price MXN'), 's2')}
                    </div>
                )}
            </EntrySection>

            {/* Notes and photos Section: vendor note, photos */}
            <EntrySection
                id={`${uid}-notes`}
                title={tr('Notes and photos')}
                open={notesOpen}
                onToggle={() => setNotesOpen(prev => !prev)}
                onOpen={() => setNotesOpen(true)}
                onCollapse={() => setNotesOpen(false)}
                summary={notesSummary}
            >
                <div className="entry-grid">
                    <Field label={tr('Vendor note')} className="s6" hint={tr('The vendor’s own word for it. The AI never writes here.')}>
                        <Input value={value.description} onChange={set('description')} disabled={disabled} />
                    </Field>
                </div>
                <PhotosField photos={photos} onChange={onPhotosChange} note={photoNote} disabled={disabled} />
            </EntrySection>
        </div>
    );
}

function PhotosField({ photos, onChange, note, disabled }: {
    photos: readonly EntryPhoto[];
    onChange: (next: EntryPhoto[]) => void;
    note?: string;
    disabled?: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [over, setOver] = useState(false);
    // Media already hosted (a Drive link, another item's photo) is attached
    // by its URL, without downloading and uploading it again.
    const [urlOpen, setUrlOpen] = useState(false);
    const [urlText, setUrlText] = useState('');

    const addUrl = () => {
        const urls = urlText.split(/[\s,]+/).map(u => u.trim()).filter(Boolean);
        if (!urls.length) return;
        const bad = urls.filter(u => !/^https?:\/\/\S+$/i.test(u));
        if (bad.length) { toast.error(trf('Not a web address: {url}', { url: bad[0] })); return; }
        const have = new Set(photos.map(p => p.url).filter(Boolean));
        const added: EntryPhoto[] = urls.filter(u => !have.has(u)).map(u => ({
            key: photoKey(),
            url: u,
            preview: getCleanImageUrl(u) || u,
            isVideo: isVideoFile(u),
        }));
        if (added.length) onChange([...photos, ...added]);
        setUrlText('');
        setUrlOpen(false);
    };

    const add = async (files: File[]) => {
        if (!files.length) return;
        const picked = await readPickedFiles(files);
        if (picked.length) onChange([...photos, ...picked]);
    };

    const boxRef = useRef<HTMLDivElement>(null);
    /** The star leaves the new first photo and a removed photo's keys go: keep focus on a key that stays. */
    const keepFocus = (selector: string) => requestAnimationFrame(() => {
        const a = document.activeElement as HTMLButtonElement | null;
        if (a && a !== document.body && a.isConnected && !a.disabled) return;
        boxRef.current?.querySelector<HTMLElement>(selector)?.focus();
    });

    const makeHero = (i: number) => {
        if (i <= 0) return;
        const next = photos.slice();
        const [p] = next.splice(i, 1);
        next.unshift(p);
        onChange(next);
        keepFocus(`[data-photo="${p.key}"] [data-act="remove"]`);
    };

    const remove = (i: number) => {
        const p = photos[i];
        if (p?.file && p.preview.startsWith('blob:')) URL.revokeObjectURL(p.preview);
        const after = photos[i + 1] ?? photos[i - 1];
        onChange(photos.filter((_, k) => k !== i));
        keepFocus(after ? `[data-photo="${after.key}"] [data-act="remove"]` : '.entry-drop');
    };

    const stills = photos.filter(p => !p.isVideo).length;
    const aside = photos.length
        ? [trf('{n} photos', { n: stills }), photos.length > stills ? trf('{n} videos', { n: photos.length - stills }) : '']
            .filter(Boolean).join(' · ')
        : undefined;

    return (
        <Field group label={tr('Photos')} aside={aside} hint={note}>
            <div className="entry-photos" ref={boxRef}>
                {photos.map((p, i) => (
                    <div key={p.key} data-photo={p.key} className={cx('entry-photo', i === 0 && 'entry-photo--hero')}>
                        <span className="ui-thumb ui-thumb--xl">
                            <img src={p.preview} alt={i === 0 ? tr('First photo') : trf('Photo {n}', { n: i + 1 })} loading="lazy" draggable={false} />
                            {(p.isVideo || !p.url) && (
                                <span className="ui-thumb__badge" aria-hidden="true">{p.isVideo ? tr('VIDEO') : tr('NEW')}</span>
                            )}
                        </span>
                        <div className="entry-photo__acts">
                            {i > 0 && !p.isVideo && (
                                <Key size="sm" variant="quiet" iconOnly icon={<Star size={12} />} disabled={disabled}
                                    label={tr('Make this the first photo')} onClick={() => makeHero(i)} />
                            )}
                            <Key size="sm" variant="quiet" iconOnly icon={<X size={12} />} disabled={disabled}
                                label={tr('Remove photo')} data-act="remove" onClick={() => remove(i)} />
                        </div>
                    </div>
                ))}
                <button
                    type="button"
                    className={cx('entry-drop', over && 'entry-drop--over')}
                    disabled={disabled}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                    onDragLeave={() => setOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setOver(false);
                        if (!disabled) void add(Array.from(e.dataTransfer.files || []));
                    }}
                >
                    <Upload size={14} aria-hidden="true" />
                    <span>{photos.length ? tr('Add photos') : tr('Drop photos or videos here, or click to pick')}</span>
                </button>
                <input ref={inputRef} type="file" hidden multiple accept="image/*,video/*"
                    onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; void add(files); }} />
            </div>
            <div className="entry-inline">
                {urlOpen ? (
                    <>
                        <Input autoFocus type="url" inputMode="url" value={urlText} disabled={disabled}
                            placeholder={tr('https://… (one or more, separated by spaces)')}
                            aria-label={tr('Photo or video URL')}
                            onChange={(e) => setUrlText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); addUrl(); }
                                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setUrlOpen(false); setUrlText(''); }
                            }} />
                        <Key size="sm" variant="go" disabled={disabled || !urlText.trim()} onClick={addUrl}>{tr('Add')}</Key>
                        <Key size="sm" variant="quiet" onClick={() => { setUrlOpen(false); setUrlText(''); }}>{tr('Cancel')}</Key>
                    </>
                ) : (
                    <Key size="sm" variant="quiet" icon={<Link2 size={12} />} disabled={disabled} onClick={() => setUrlOpen(true)}>
                        {tr('Add by URL')}
                    </Key>
                )}
            </div>
        </Field>
    );
}
