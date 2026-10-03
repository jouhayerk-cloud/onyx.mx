import React from 'react';
import { cx } from './types';

export type KeyVariant = 'default' | 'go' | 'stop' | 'quiet' | 'danger';
export type KeySize = 'sm' | 'md' | 'lg';

export interface KeyProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    variant?: KeyVariant;
    size?: KeySize;
    /** Leading icon (a lucide icon element). Replaced by the spinner while busy. */
    icon?: React.ReactNode;
    /** Shows a spinner, sets aria-busy and ignores clicks, without greying the key out. */
    busy?: boolean;
    /** Toggle keys only: renders aria-pressed and the pressed state. */
    pressed?: boolean;
    /**
     * Icon-only key. The label is required then and becomes aria-label, since
     * there is no visible text to name the control.
     */
    iconOnly?: boolean;
    label?: string;
    children?: React.ReactNode;
    ref?: React.Ref<HTMLButtonElement>;
}

/**
 * The kit's button. Variants: default (raised), go (the one primary action),
 * stop (halt a run), quiet (secondary, no fill), danger (destructive, final).
 * type defaults to "button" so a Key inside a form never submits it by accident.
 */
export function Key({
    variant = 'default',
    size = 'md',
    icon,
    busy = false,
    pressed,
    iconOnly = false,
    label,
    className,
    children,
    disabled,
    onClick,
    type = 'button',
    ref,
    ...rest
}: KeyProps) {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (busy) { e.preventDefault(); return; }
        onClick?.(e);
    };
    return (
        <button
            {...rest}
            ref={ref}
            type={type}
            className={cx(
                'ui-key',
                variant !== 'default' && `ui-key--${variant}`,
                size !== 'md' && `ui-key--${size}`,
                iconOnly && 'ui-key--icon',
                className,
            )}
            disabled={disabled}
            aria-busy={busy || undefined}
            aria-pressed={pressed === undefined ? undefined : pressed}
            aria-label={iconOnly ? label : rest['aria-label']}
            title={rest.title ?? (iconOnly ? label : undefined)}
            onClick={handleClick}
        >
            {busy ? <span className="ui-spin" aria-hidden="true" /> : icon}
            {!iconOnly && (children ?? label)}
        </button>
    );
}
