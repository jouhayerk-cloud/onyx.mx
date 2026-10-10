/**
 * The entry fields, one dense grid for Add Entry and Edit Entry alike:
 * vendor, book, number, quantity, shape, Type, material, vendor colour,
 * status, W/H/D, weight, price, the vendor's note, then the photos.
 *
 * It replaces three forms: Create Item's (no status, weight or note; W/L/H),
 * the wizard's (4-5xl ghost placeholders cycling random catalogue values,
 * suggestion popovers for prices and dimensions) and the dead UploadEntryForm.
 * Suggestions are a plain datalist per categorical field, cross-filtered by
 * the others. The focused field also shows its values as tags (TagRow), and
 * the dimensions show the known sizes (SizeRow).
 */
import React, { useId, useMemo, useRef, useState } from 'react';
import { Link2, Lock, Star, Upload, X } from 'lucide-react';
import toast from '../onyxIsland/notify/toast';
import { getCleanImageUrl, isVideoFile } from '../../lib/utils';
import { tr, trf } from '../../lib/i18n';
import { el } from '../../lib/i18nEnums';
import { buildAttributeSuggestions, buildSizeSuggestions, type SizeSuggestion } from '../../lib/attributeSuggestions';
import { useTypeLibrary } from '../../lib/typeLibraryStore';
import { ENTRY_BOOKS, ENTRY_STATUSES, normalizeWorkbook } from '../../lib/inventoryCreate';
import { Field, Input, Key, Segmented, Select, VendorPicker, cx } from '../../components/ui';
import { VENDOR_CODES, photoKey, type EntryPhoto, type EntryState } from './entryModel';
import { readPickedFiles } from './entryMedia';
import { canonicalType } from '../../lib/canonicalType';
import { ShapeLibraryField } from './ShapeLibraryField';
import { ShapeFigure } from './hairline/ShapeFigure';
import { SizeRow, TagRow } from './TagRow';

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

type SuggestField = 'shape' | 'type' | 'color' | 'material';

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
        const cap = (l?: string[]) => (l || []).slice(0, 40);
        return {
            shape: cap(s.shape), type: cap(s.type), color: cap(s.color), material: cap(s.material),
            sizes: buildSizeSuggestions(manual, { shape: value.shape, type: value.type }),
        };
    }, [manual, hidden, value.shape, value.material, value.color, value.type]);
}

const BOOK_OPTIONS = ENTRY_BOOKS.map(b => ({ value: b, label: b.slice(1) }));

export function EntryForm({
    value, onChange, photos, onPhotosChange, locks = {}, numberState,
    suggestionRows, hiddenValues, shapeLibrary = false, photoNote, disabled = false,
}: EntryFormProps) {
    const uid = useId();
    const manual = useMemo(() => manualRows(suggestionRows), [suggestionRows]);
    // shapeLibrary is fixed for a mounted form (Add Entry or Edit Entry), so the hook keeps its place in every render.
    // Edit Entry passes shapeLibrary false: the hook then makes no request for the Type library.
    const typeLib = useTypeLibrary(manual, shapeLibrary);
    const typeHidden = shapeLibrary ? typeLib.hidden : undefined;
    const hidden = useMemo(() => (
        typeHidden ? new Set([...(hiddenValues ?? []), ...typeHidden]) : hiddenValues
    ), [hiddenValues, typeHidden]);
    const suggestions = useSuggestions(manual, value, hidden);
    /** The field whose tags show: a suggested field, or the dimensions. */
    const [activeField, setActiveField] = useState<SuggestField | 'dims' | null>(null);
    const set = <K extends keyof EntryState>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        onChange({ [k]: e.target.value } as Partial<EntryState>);

    /** Focus left a field (or the dimensions): its tags go, unless focus went into the same field's tags. */
    const leaveField = (e: React.FocusEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const next = e.relatedTarget as HTMLElement | null;
        const box = target.closest('.entry-dims') ?? target.closest('.ui-field');
        // A tag row sits outside its field's box, so focus that moves into one stays in the field.
        if (!box?.contains(next) && !next?.closest('.entry-tags-row')) setActiveField(null);
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

    const lockAside = (reason?: string) => reason
        ? <span title={reason} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={10} aria-hidden="true" />{tr('fixed')}</span>
        : undefined;

    const numberAside = locks.itemNumber
        ? lockAside(locks.itemNumber)
        : numberState?.checking ? tr('checking…')
            : numberState?.next && String(numberState.next) !== value.itemNumber ? trf('next {n}', { n: numberState.next })
                : undefined;

    const listId = (f: SuggestField) => `${uid}-${f}`;
    const textField = (f: SuggestField, label: string, span: string) => (
        <Field label={label} className={span}>
            <Input value={value[f]} onChange={set(f)} onFocus={() => setActiveField(f)} list={listId(f)} autoComplete="off" disabled={disabled} />
            <datalist id={listId(f)}>
                {suggestions[f].map(s => <option key={s} value={s} />)}
            </datalist>
        </Field>
    );

    /** Escape in a field's tag row gives the focus back to the field's input. */
    const backToField = (e: React.KeyboardEvent<HTMLDivElement>, f: SuggestField) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.closest('.entry-grid')?.querySelector<HTMLInputElement>(`input[list="${listId(f)}"]`)?.focus();
    };

    /** Mirrors, table lamps and pendants come in shapes (Round, Squared, Rectangular; Cylinder, Squared): their Shape tags show the drawing of each. */
    const variantTypeId = canonicalType(value.type).id;
    const shapeLead = variantTypeId === 'mirror' || variantTypeId === 'table-lamp' || variantTypeId === 'pendant'
        ? (tag: string) => <ShapeFigure family={variantTypeId === 'mirror' ? 'box' : 'cylinder'} isMirror={variantTypeId === 'mirror'}
            typeId={variantTypeId} variant={tag} dims={null} className="tag-fig" />
        : undefined;

    /** The tags of a suggested field: a full width row, placed after the row of fields it belongs to, shown while it has focus. */
    const tagRow = (f: SuggestField, label: string) => activeField === f && suggestions[f].length > 0 && (
        <div className="s6 entry-tags-row" onKeyDownCapture={e => backToField(e, f)}>
            <TagRow label={label} tags={suggestions[f]} onPick={tag => onChange({ [f]: tag } as Partial<EntryState>)}
                renderLead={f === 'shape' ? shapeLead : undefined} />
        </div>
    );

    const numField = (f: keyof EntryState, label: string, span = '', opts: { step?: string; min?: string; onFocus?: () => void } = {}) => (
        <Field label={label} className={span}>
            <Input type="number" inputMode="decimal" min={opts.min ?? '0'} step={opts.step ?? 'any'} className="ui-tnum"
                value={value[f]} onChange={set(f)} onFocus={opts.onFocus} disabled={disabled} />
        </Field>
    );

    const focusDims = () => setActiveField('dims');

    return (
        <div className="entry-form">
            <div className="entry-grid" onBlur={leaveField}>
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

                {shapeLibrary && (
                    <Field label={tr('Types')} className="s6" group hint={tr('Pick a Type, or type below. Both stay in step.')}>
                        <ShapeLibraryField
                            value={{ type: value.type }}
                            onChange={patch => onChange({ type: patch.type })}
                            library={typeLib.library}
                            loading={typeLib.loading}
                            onSave={typeLib.save}
                            disabled={disabled}
                        />
                    </Field>
                )}

                {textField('shape', tr('Shape'), 's2')}
                {textField('type', tr('Type'), 's2')}
                {textField('material', tr('Material'), 's2')}
                {tagRow('shape', tr('Shape tags'))}
                {tagRow('type', tr('Type tags'))}
                {tagRow('material', tr('Material tags'))}
                {textField('color', tr('Vendor colour'), 's3')}

                <Field label={tr('Status')} className="s3">
                    <Select value={value.status} onChange={set('status')} options={statusOptions} disabled={disabled} />
                </Field>
                {tagRow('color', tr('Colour tags'))}

                <div className="entry-dims">
                    {numField('widthCm', tr('W cm'), '', { onFocus: focusDims })}
                    {numField('heightCm', tr('H cm'), '', { onFocus: focusDims })}
                    {numField('lengthCm', tr('D cm'), '', { onFocus: focusDims })}
                    {(activeField === 'shape' || activeField === 'type' || activeField === 'dims') && suggestions.sizes.length > 0 && (
                        <div className="s6">
                            <SizeRow sizes={suggestions.sizes} onPick={pickSize} />
                        </div>
                    )}
                </div>
                {numField('weightKg', tr('Kg'))}
                {numField('price', tr('Price MXN'), 's2')}

                <Field label={tr('Vendor note')} className="s6" hint={tr('The vendor’s own word for it. The AI never writes here.')}>
                    <Input value={value.description} onChange={set('description')} disabled={disabled} />
                </Field>
            </div>

            <PhotosField photos={photos} onChange={onPhotosChange} note={photoNote} disabled={disabled} />
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
