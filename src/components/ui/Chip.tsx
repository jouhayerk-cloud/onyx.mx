import React from 'react';
import { CATALOG_PROCESSES } from '../../lib/catalogHubProcesses';
import { tr } from '../../lib/i18n';
import { PROCESS_GROUP_LABEL, PROCESS_META, cx, type ProcessGroup, type ProcessId } from './types';

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
    pressed: boolean;
    onPressedChange?: (next: boolean) => void;
    icon?: React.ReactNode;
    ref?: React.Ref<HTMLButtonElement>;
}

/** A toggle: aria-pressed, flat at rest, pressed and lit when on. */
export function Chip({ pressed, onPressedChange, icon, className, children, onClick, type = 'button', ref, ...rest }: ChipProps) {
    return (
        <button
            {...rest}
            ref={ref}
            type={type}
            className={cx('ui-chip', className)}
            aria-pressed={pressed}
            onClick={(e) => {
                onClick?.(e);
                if (!e.defaultPrevented) onPressedChange?.(!pressed);
            }}
        >
            {icon}
            {children}
        </button>
    );
}

export interface ChipGroupProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Names the group for assistive tech; shown too when `showLabel` is set. */
    label: string;
    showLabel?: boolean;
}

/** role="group" around a set of chips. */
export function ChipGroup({ label, showLabel = false, className, children, ...rest }: ChipGroupProps) {
    return (
        <div {...rest} role="group" aria-label={label} className={cx('ui-chips', className)}>
            {showLabel && <span className="ui-chips__label" aria-hidden="true">{label}</span>}
            {children}
        </div>
    );
}

export interface ProcessChipsProps {
    /** The ticked processes. */
    value: ReadonlySet<ProcessId> | readonly ProcessId[];
    onChange: (next: Set<ProcessId>) => void;
    /**
     * Which processes to offer, in CATALOG_PROCESSES order. Defaults to every
     * process except variation_donor, which only applies to items without a
     * photo and is offered by the screens that handle those.
     */
    include?: readonly ProcessId[];
    /** Processes that cannot run here, with the reason shown as the tooltip (e.g. "Needs a photo"). */
    unavailable?: Partial<Record<ProcessId, string>>;
    disabled?: boolean;
    /** Accessible name of the whole control. */
    label?: string;
    className?: string;
}

/**
 * The process picker, driven by CATALOG_PROCESSES so a new process appears
 * here without a UI change. Two groups, Text and Image, each a role="group"
 * of aria-pressed chips. Every ticked process runs and is saved on its own;
 * an unticked one is neither run nor written.
 */
export function ProcessChips({ value, onChange, include, unavailable, disabled = false, label, className }: ProcessChipsProps) {
    const selected = value instanceof Set ? value : new Set(value as readonly ProcessId[]);
    const offered = CATALOG_PROCESSES
        .map(p => p.id)
        .filter(id => (include ? include.includes(id) : id !== 'variation_donor'));
    const groups: ProcessGroup[] = ['text', 'image'];

    const toggle = (id: ProcessId, on: boolean) => {
        const next = new Set(selected);
        if (on) next.add(id); else next.delete(id);
        onChange(next);
    };

    return (
        <div role="group" aria-label={label ?? tr('Processes to run')} className={cx('ui-chips', className)}>
            {groups.map(group => {
                const ids = offered.filter(id => PROCESS_META[id].group === group);
                if (!ids.length) return null;
                const groupLabel = tr(PROCESS_GROUP_LABEL[group]);
                return (
                    <div key={group} role="group" aria-label={groupLabel} className="ui-chips__set">
                        <span className="ui-chips__label" aria-hidden="true">{groupLabel}</span>
                        {ids.map(id => {
                            const reason = unavailable?.[id];
                            const process = CATALOG_PROCESSES.find(p => p.id === id);
                            return (
                                <Chip
                                    key={id}
                                    pressed={selected.has(id) && !reason}
                                    disabled={disabled || !!reason}
                                    title={reason ? tr(reason) : process ? tr(process.label) : undefined}
                                    onPressedChange={(on) => toggle(id, on)}
                                >
                                    {tr(PROCESS_META[id].label)}
                                </Chip>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
