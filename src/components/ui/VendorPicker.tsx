import React, { useRef, useState } from 'react';
import { vendors } from '../../lib/consts';
import { getTextColorForBg } from '../../lib/utils';
import { tr } from '../../lib/i18n';
import { cx } from './types';

type VendorInfo = { name: string; color: string };
const VENDORS = vendors as Record<string, VendorInfo>;

export interface VendorPickerProps {
    /** Vendor codes to offer, in order. */
    codes: readonly string[];
    value: string;
    onChange: (code: string) => void;
    /** The book shown on the chosen vendor's tag (826, 326...). */
    book?: string;
    disabled?: boolean;
    /** Why the vendor cannot be changed (a printed label, a vendor login); shown instead of the change hint. */
    lockedReason?: string;
    label?: string;
    className?: string;
}

const colorOf = (code: string) => VENDORS[code]?.color || '#555555';
const swatch = (code: string) => {
    const c = colorOf(code);
    return { '--vendor-color': c, '--vendor-ink': getTextColorForBg(c) } as React.CSSProperties;
};

/**
 * The colour-coded vendor picker. The vendor colour is how people tell
 * vendors apart on tags and labels, so it is the key's fill, not a dot next
 * to a name in a list. With nothing chosen it shows every vendor as a
 * coloured key; once one is chosen it folds into that vendor's large tag,
 * and clicking the tag opens the keys again.
 *
 * The keys are a radiogroup with one tab stop (arrows, Home, End), the same
 * keyboard model as Segmented.
 */
export function VendorPicker({ codes, value, onChange, book, disabled, lockedReason, label, className }: VendorPickerProps) {
    const [open, setOpen] = useState(!value);
    const keysRef = useRef<HTMLDivElement>(null);
    const locked = !!lockedReason;
    const showKeys = (open || !value) && !locked;

    const choose = (code: string) => {
        onChange(code);
        setOpen(false);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const keys = Array.from(keysRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        const at = keys.findIndex(k => k === document.activeElement);
        if (at < 0) return;
        let next = at;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (at + 1) % keys.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (at - 1 + keys.length) % keys.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = keys.length - 1;
        else if (e.key === 'Escape' && value) { e.preventDefault(); setOpen(false); return; }
        else return;
        e.preventDefault();
        keys[next]?.focus();
    };

    if (!showKeys && value) {
        return (
            <div className={cx('ui-vendor-chosen', className)}>
                <button
                    type="button"
                    className="ui-vendor-big"
                    style={swatch(value)}
                    onClick={() => setOpen(true)}
                    disabled={disabled || locked}
                    aria-label={locked ? `${value} · ${VENDORS[value]?.name ?? ''}` : `${tr('Change vendor')}: ${value}`}
                    title={locked ? lockedReason : tr('Change vendor')}
                >
                    {value}{book ? <span className="ui-vendor-big__book">{book}</span> : null}
                </button>
                <span className="ui-vendor-name">{VENDORS[value]?.name ?? value}</span>
                {locked
                    ? <span className="ui-vendor-hint">{lockedReason}</span>
                    : !disabled && <span className="ui-vendor-hint">{tr('Click the tag to change')}</span>}
            </div>
        );
    }

    const tabCode = codes.includes(value) ? value : codes[0];
    return (
        <div
            ref={keysRef}
            className={cx('ui-vendors', className)}
            role="radiogroup"
            aria-label={label || tr('Vendor')}
            onKeyDown={onKeyDown}
        >
            {codes.map(code => (
                <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={code === value}
                    tabIndex={code === tabCode ? 0 : -1}
                    className="ui-vendor-key"
                    style={swatch(code)}
                    title={VENDORS[code]?.name ?? code}
                    disabled={disabled}
                    onClick={() => choose(code)}
                >
                    {code}
                </button>
            ))}
        </div>
    );
}
