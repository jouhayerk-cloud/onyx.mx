import React, { useRef } from 'react';
import { cx } from './types';

export interface SegmentedOption<T extends string> {
    value: T;
    label: React.ReactNode;
    icon?: React.ReactNode;
    disabled?: boolean;
    title?: string;
}

export interface SegmentedProps<T extends string> {
    options: readonly SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    /** Accessible name of the radiogroup. */
    label: string;
    size?: 'sm' | 'md';
    disabled?: boolean;
    className?: string;
}

/**
 * One choice out of a few, as a radiogroup: one tab stop (the checked
 * option), arrow keys move and select, Home/End jump to the ends — the
 * keyboard model of native radio buttons.
 */
export function Segmented<T extends string>({ options, value, onChange, label, size = 'md', disabled = false, className }: SegmentedProps<T>) {
    const refs = useRef<Array<HTMLButtonElement | null>>([]);
    const enabled = options.map((o, i) => (!o.disabled && !disabled ? i : -1)).filter(i => i >= 0);
    const checkedIndex = Math.max(0, options.findIndex(o => o.value === value));
    // The tab stop is the checked option, or the first enabled one when the
    // checked one is disabled.
    const tabStop = enabled.includes(checkedIndex) ? checkedIndex : enabled[0] ?? -1;

    const move = (from: number, step: number | 'first' | 'last') => {
        if (!enabled.length) return;
        let target: number;
        if (step === 'first') target = enabled[0];
        else if (step === 'last') target = enabled[enabled.length - 1];
        else {
            const pos = enabled.indexOf(from);
            target = enabled[(pos + step + enabled.length) % enabled.length];
        }
        refs.current[target]?.focus();
        onChange(options[target].value);
    };

    const onKeyDown = (e: React.KeyboardEvent, i: number) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
        else if (e.key === 'Home') { e.preventDefault(); move(i, 'first'); }
        else if (e.key === 'End') { e.preventDefault(); move(i, 'last'); }
    };

    return (
        <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}
            className={cx('ui-seg', size === 'sm' && 'ui-seg--sm', className)}>
            {options.map((o, i) => (
                <button
                    key={o.value}
                    ref={el => { refs.current[i] = el; }}
                    type="button"
                    role="radio"
                    aria-checked={o.value === value}
                    tabIndex={i === tabStop ? 0 : -1}
                    disabled={disabled || o.disabled}
                    title={o.title}
                    className="ui-seg__opt"
                    onClick={() => onChange(o.value)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                >
                    {o.icon}
                    {o.label}
                </button>
            ))}
        </div>
    );
}
