import React, { useRef } from 'react';
import { cx } from './types';

export interface FilterTab<T extends string> {
    id: T;
    /** Already translated. */
    label: string;
    count?: number;
    disabled?: boolean;
}

export interface FilterTabsProps<T extends string> {
    tabs: readonly FilterTab<T>[];
    value: T;
    onChange: (id: T) => void;
    /** Accessible name, e.g. "Filter items". */
    label: string;
    /** id of the list the tabs filter, for aria-controls. */
    controls?: string;
    /** Right-hand slot: a search field, a sort. */
    end?: React.ReactNode;
    className?: string;
}

/**
 * All / Needs review / Running / Failed / Saved, with counts. A tablist with
 * one tab stop; arrows move and select. A zero count is muted, not hidden,
 * so the row of tabs never shifts under the pointer as a run progresses.
 */
export function FilterTabs<T extends string>({ tabs, value, onChange, label, controls, end, className }: FilterTabsProps<T>) {
    const refs = useRef<Array<HTMLButtonElement | null>>([]);
    const enabled = tabs.map((t, i) => (t.disabled ? -1 : i)).filter(i => i >= 0);

    const onKeyDown = (e: React.KeyboardEvent, i: number) => {
        const pos = enabled.indexOf(i);
        let next: number | undefined;
        if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length];
        else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length];
        else if (e.key === 'Home') next = enabled[0];
        else if (e.key === 'End') next = enabled[enabled.length - 1];
        if (next === undefined) return;
        e.preventDefault();
        refs.current[next]?.focus();
        onChange(tabs[next].id);
    };

    return (
        <div className={cx('ui-ftabs', className)}>
            <div className="ui-ftabs__list" role="tablist" aria-label={label}>
                {tabs.map((t, i) => (
                    <button
                        key={t.id}
                        ref={el => { refs.current[i] = el; }}
                        type="button"
                        role="tab"
                        className="ui-ftab"
                        aria-selected={t.id === value}
                        aria-controls={controls}
                        tabIndex={t.id === value ? 0 : -1}
                        disabled={t.disabled}
                        onClick={() => onChange(t.id)}
                        onKeyDown={(e) => onKeyDown(e, i)}
                    >
                        {t.label}
                        {t.count !== undefined && (
                            <span className={cx('ui-ftab__n', t.count === 0 && 'ui-ftab__n--muted')}>{t.count}</span>
                        )}
                    </button>
                ))}
            </div>
            {end && <div className="ui-ftabs__end">{end}</div>}
        </div>
    );
}
