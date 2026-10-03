import React, { useId, useMemo, useState } from 'react';
import { Eye, Pencil, X } from 'lucide-react';
import { tr, trf } from '../../lib/i18n';
import { sanitizeHtml } from '../../lib/ai/finalize';
import { ALLOWED_SHOPIFY_COLORS, SHOPIFY_PRODUCT_TYPES, TITLE_MAX_CHARS, TITLE_MIN_CHARS } from '../../lib/ai/vocabulary';
import { COLOR_PALETTE } from '../../lib/colorExtractor';
import { Field, Input, Select, Textarea } from './Field';
import { Key } from './Key';
import { cx } from './types';

/** The four generated fields, in the shape finalizeContent returns them. */
export interface GeneratedValue {
    /** AI title (stored in detailed_description). */
    title: string;
    /** Marketing HTML (generated_description). */
    html: string;
    /** Allowed Shopify colour names (generated_color). */
    colors: string[];
    /** Shopify product type (generated_type). */
    genType: string;
}

export type GeneratedField = 'title' | 'colors' | 'type' | 'html';

export interface GeneratedContentProps {
    value: GeneratedValue;
    onChange?: (next: GeneratedValue) => void;
    /** Which fields to show, in this order. All four by default. */
    fields?: readonly GeneratedField[];
    readOnly?: boolean;
    /** At most this many colours (finalizeColors keeps 3). */
    maxColors?: number;
    /** validateCopy findings to show under the fields. */
    issues?: readonly { message: string }[];
    /** Placeholder for fields that were not generated. Already translated. */
    emptyLabel?: string;
    className?: string;
}

const SWATCH = new Map<string, string>(COLOR_PALETTE.map(c => [c.name, `rgb(${c.rgb.join(' ')})`]));
// Names the matcher has no reference value for.
SWATCH.set('Clear', 'transparent');
SWATCH.set('Rainbow', 'conic-gradient(red, orange, yellow, green, blue, purple, red)');

const textLength = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().length;

/**
 * Review and edit what the model wrote: the title with a live 60-70
 * counter, the colours as removable chips from the allowed list, the type
 * from SHOPIFY_PRODUCT_TYPES, and the HTML as a sanitised preview with an
 * edit toggle. The preview always goes through sanitizeHtml, and leaving
 * edit mode stores the sanitised text, so what is reviewed is what is saved.
 */
export function GeneratedContent({
    value,
    onChange,
    fields = ['title', 'colors', 'type', 'html'],
    readOnly = false,
    maxColors = 3,
    issues,
    emptyLabel,
    className,
}: GeneratedContentProps) {
    const [editingHtml, setEditingHtml] = useState(false);
    const htmlId = useId();
    const locked = readOnly || !onChange;
    const set = (patch: Partial<GeneratedValue>) => onChange?.({ ...value, ...patch });
    const notYet = emptyLabel ?? tr('Not generated yet');

    const len = value.title.length;
    const titleTone = !len ? undefined : len >= TITLE_MIN_CHARS && len <= TITLE_MAX_CHARS ? 'ok' : len > TITLE_MAX_CHARS ? 'bad' : 'warn';
    const preview = useMemo(() => sanitizeHtml(value.html), [value.html]);
    const bodyChars = useMemo(() => textLength(preview), [preview]);
    const remaining = ALLOWED_SHOPIFY_COLORS.filter(c => !value.colors.includes(c));
    const typeKnown = !value.genType || (SHOPIFY_PRODUCT_TYPES as readonly string[]).includes(value.genType);

    const blocks: Record<GeneratedField, React.ReactNode> = {
        title: (
            <Field
                key="title"
                label={tr('Title')}
                aside={`${len} / ${TITLE_MAX_CHARS}`}
                asideTone={titleTone}
                hint={len && titleTone !== 'ok' ? trf('Aim for {min}-{max} characters.', { min: TITLE_MIN_CHARS, max: TITLE_MAX_CHARS }) : undefined}
            >
                <Input value={value.title} placeholder={notYet} readOnly={locked}
                    onChange={(e) => set({ title: e.target.value })} />
            </Field>
        ),
        colors: (
            <Field key="colors" group label={tr('Colours')}
                aside={value.colors.length ? `${value.colors.length} / ${maxColors}` : undefined}>
                <div className="ui-colors">
                    {value.colors.length === 0 && <span className="ui-desc__empty">{notYet}</span>}
                    {value.colors.map(c => (
                        <span key={c} className="ui-color">
                            <i className="ui-color__sw" style={{ background: SWATCH.get(c) ?? 'transparent' }} aria-hidden="true" />
                            <span>{c}</span>
                            {!locked && (
                                <button type="button" className="ui-color__x" aria-label={trf('Remove {color}', { color: c })}
                                    onClick={() => set({ colors: value.colors.filter(x => x !== c) })}>
                                    <X size={11} strokeWidth={3} />
                                </button>
                            )}
                        </span>
                    ))}
                    {!locked && value.colors.length < maxColors && (
                        <Select
                            className="ui-colors__add"
                            aria-label={tr('Add a colour')}
                            value=""
                            placeholder={`+ ${tr('Colour')}`}
                            options={remaining as readonly string[]}
                            onChange={(e) => { if (e.target.value) set({ colors: [...value.colors, e.target.value] }); }}
                        />
                    )}
                </div>
            </Field>
        ),
        type: (
            <Field key="type" label={tr('Type')}
                error={typeKnown ? undefined : tr('Not a type the store accepts.')}>
                <Select value={value.genType} disabled={locked} placeholder={notYet}
                    onChange={(e) => set({ genType: e.target.value })}>
                    {!typeKnown && <option value={value.genType}>{value.genType}</option>}
                    {SHOPIFY_PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
            </Field>
        ),
        html: (
            <Field key="html" id={htmlId} group={!editingHtml} label={tr('Description')}
                aside={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {bodyChars > 0 && <span>{trf('{n} chars', { n: bodyChars.toLocaleString() })}</span>}
                        {!locked && (
                            <Key size="sm" variant="quiet" pressed={editingHtml}
                                icon={editingHtml ? <Eye size={12} /> : <Pencil size={12} />}
                                onClick={() => {
                                    // Leaving the editor stores the sanitised text, so the
                                    // saved HTML is exactly the previewed HTML.
                                    if (editingHtml) set({ html: sanitizeHtml(value.html) });
                                    setEditingHtml(!editingHtml);
                                }}>
                                {/* One label with aria-pressed: "Edit HTML, pressed" reads
                                    true in both states, where a swapped label did not. */}
                                {tr('Edit HTML')}
                            </Key>
                        )}
                    </span>
                }>
                {editingHtml && !locked
                    ? <Textarea mono rows={10} value={value.html} onChange={(e) => set({ html: e.target.value })} />
                    : preview
                        ? <div className="ui-desc" dangerouslySetInnerHTML={{ __html: preview }} />
                        : <div className="ui-desc"><span className="ui-desc__empty">{notYet}</span></div>}
            </Field>
        ),
    };

    return (
        <div className={cx('ui-gen', className)}>
            {fields.map(f => blocks[f])}
            {issues && issues.length > 0 && (
                <ul className="ui-log" aria-label={tr('Copy checks')} style={{ listStyle: 'none' }}>
                    {issues.map((i, k) => <li key={k}><span className="ui-log__warn">[WARN]</span> {i.message}</li>)}
                </ul>
            )}
        </div>
    );
}
