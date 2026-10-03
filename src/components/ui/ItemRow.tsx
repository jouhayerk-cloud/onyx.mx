import React, { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { cx } from './types';

interface ItemListContextValue {
    multiselectable: boolean;
}

const ItemListContext = createContext<ItemListContextValue>({ multiselectable: false });

export interface ItemListProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
    /** Accessible name of the listbox, e.g. "Items". */
    label: string;
    /**
     * The grid track template, shared by the header and every row (the
     * density.css idea: one property, so columns line up row to row).
     * Default: check · item · media · title · steps · state.
     */
    columns?: string;
    /** Header cells, one per column. Visual only; each row names its own content. */
    header?: readonly React.ReactNode[];
    /** Rows carry a tick for batch actions: aria-selected means ticked. */
    multiselectable?: boolean;
    /**
     * Fold the default six-column row into two lines under 640px (check ·
     * item · state over media · title; steps hidden). Only meaningful for
     * that column order.
     */
    fold?: boolean;
    /** Shown instead of rows when there are none. */
    empty?: React.ReactNode;
    children?: React.ReactNode;
}

/**
 * A listbox of ItemRows with one tab stop: Tab enters on the current row,
 * arrows / Home / End move between rows. The scroll container carries the
 * track template so the sticky header and the rows share it.
 */
export function ItemList({ label, columns, header, multiselectable = false, fold = false, empty, className, style, children, ...rest }: ItemListProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const options = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);

    // One tab stop: the current row (tabIndex 0 from ItemRow), or the first
    // row when nothing is current yet.
    useLayoutEffect(() => {
        const rows = options();
        if (rows.length && !rows.some(r => r.tabIndex === 0)) rows[0].tabIndex = 0;
    });

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        const rows = options();
        if (!rows.length) return;
        const at = rows.indexOf(document.activeElement as HTMLElement);
        let next = at;
        if (e.key === 'ArrowDown') next = Math.min(rows.length - 1, at + 1);
        else if (e.key === 'ArrowUp') next = Math.max(0, at - 1);
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = rows.length - 1;
        if (next === at || next < 0) return;
        e.preventDefault();
        rows.forEach((r, i) => { r.tabIndex = i === next ? 0 : -1; });
        rows[next].focus();
        rows[next].scrollIntoView({ block: 'nearest' });
    };

    const hasRows = React.Children.toArray(children).length > 0;
    return (
        <ItemListContext.Provider value={{ multiselectable }}>
            <div {...rest}
                className={cx('ui-list', fold && 'ui-list--fold', className)}
                style={columns ? { ...style, ['--ui-row-cols' as string]: columns } : style}>
                {header && (
                    <div className="ui-thead" aria-hidden="true">
                        {header.map((cell, i) => <span key={i}>{cell}</span>)}
                    </div>
                )}
                <div ref={listRef} role="listbox" aria-label={label}
                    aria-multiselectable={multiselectable || undefined} onKeyDown={onKeyDown}>
                    {hasRows ? children : <div className="ui-list__empty">{empty ?? tr('Nothing to show')}</div>}
                </div>
            </div>
        </ItemListContext.Provider>
    );
}

export interface ItemRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect' | 'onToggle'> {
    /** Open in the review drawer (aria-current, accent rail). */
    current?: boolean;
    /** Ticked for a batch action (aria-selected in a multiselectable list). */
    selected?: boolean;
    /** Click or Enter. */
    onOpen?: () => void;
    /** Renders the tick cell; click on it or Space toggles. */
    onToggle?: (next: boolean) => void;
    disabled?: boolean;
    /** Spoken name of the row, e.g. "EM-004 Large Bowl"; the cells are read otherwise. */
    label?: string;
    children: React.ReactNode;
}

/**
 * One item as one dense grid row. Cells are the children (after the tick
 * cell when onToggle is given), laid out on the list's shared track template.
 */
export function ItemRow({ current = false, selected = false, onOpen, onToggle, disabled = false, label, className, children, onClick, onKeyDown, ...rest }: ItemRowProps) {
    const { multiselectable } = useContext(ItemListContext);
    return (
        <div
            {...rest}
            role="option"
            tabIndex={current ? 0 : -1}
            aria-selected={multiselectable ? selected : current}
            aria-current={current ? 'true' : undefined}
            aria-disabled={disabled || undefined}
            aria-label={label}
            data-ticked={onToggle ? String(selected) : undefined}
            className={cx('ui-row', className)}
            onClick={(e) => {
                onClick?.(e);
                if (!e.defaultPrevented && !disabled) onOpen?.();
            }}
            onKeyDown={(e) => {
                onKeyDown?.(e);
                if (e.defaultPrevented || disabled || e.target !== e.currentTarget) return;
                if (e.key === 'Enter') { e.preventDefault(); onOpen?.(); }
                else if (e.key === ' ') {
                    e.preventDefault();
                    if (onToggle) onToggle(!selected); else onOpen?.();
                }
            }}
        >
            {onToggle && (
                // Not a second focus stop inside the option: Space on the row
                // does the same, so the box is a mouse target only.
                <span className="ui-row__check" aria-hidden="true"
                    onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(!selected); }}>
                    <span className="ui-row__box">{selected && <Check size={10} strokeWidth={3.5} />}</span>
                </span>
            )}
            {children}
        </div>
    );
}
