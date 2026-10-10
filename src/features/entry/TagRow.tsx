import React from 'react';
import type { SizeSuggestion } from '../../lib/attributeSuggestions';
import { tr } from '../../lib/i18n';
import './tagRow.css';

/** A mouse press on a tag keeps the focus where it was, in the field's input. */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/** Escape in a tag row gives the focus back to the field's input (the last input of a dimensions group). */
const backToInput = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    const inputs = e.currentTarget.closest('.ui-field, .entry-dims')?.querySelectorAll('input');
    inputs?.[inputs.length - 1]?.focus();
};

/**
 * The values a field suggests, as chips: one click fills the field. renderLead, when given, draws a node before each
 * chip's text (aria-hidden: the chip's text is its label).
 */
export const TagRow: React.FC<{
    label: string; tags: readonly string[]; onPick: (tag: string) => void; max?: number;
    renderLead?: (tag: string) => React.ReactNode;
}> = ({
    label, tags, onPick, max = 8, renderLead,
}) => (
    <div role="group" aria-label={label} className="entry-tags" onKeyDown={backToInput}>
        {tags.slice(0, max).map(tag => {
            const lead = renderLead?.(tag);
            return (
                <button key={tag} type="button" className={lead ? 'entry-tag entry-tag--lead' : 'entry-tag'} onMouseDown={keepFocus} onClick={() => onPick(tag)}>
                    {lead && <span className="entry-tag__lead" aria-hidden="true">{lead}</span>}
                    {tag}
                </button>
            );
        })}
    </div>
);

/** The sizes known for the chosen Shape and Type, most common first; the count says how many items have each. */
/** A row of clickable known-size chips (width, length, height). */
export const SizeRow: React.FC<{ sizes: readonly SizeSuggestion[]; onPick: (s: SizeSuggestion) => void }> = ({ sizes, onPick }) => (
    <div role="group" aria-label={tr('Known sizes')} className="entry-tags" onKeyDown={backToInput}>
        {sizes.map(s => (
            <button key={s.label} type="button" className="entry-tag" onMouseDown={keepFocus} onClick={() => onPick(s)}>
                {s.label}
                <span className="entry-tag__count">{s.count}</span>
            </button>
        ))}
    </div>
);
