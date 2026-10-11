import React, { useEffect, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { trf } from '../../lib/i18n';
import { cx } from '../../components/ui';

export interface FieldTagProps {
    label: string;
    value: string;
    display?: string;
    onOpen?: () => void;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    style?: React.CSSProperties;
    id?: string;
    autoFocus?: boolean;
}

/**
 * Compact button representing a filled field in the Details section.
 * Displays a small caps label beside or above the value, with a pencil icon.
 * Activating via click, Enter, or Space re-deploys the input field.
 */
export const FieldTag: React.FC<FieldTagProps> = ({
    label,
    value,
    display,
    onOpen,
    onClick,
    disabled = false,
    className = '',
    style,
    id,
    autoFocus = false,
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const displayText = display ?? value;

    useEffect(() => {
        if (autoFocus) {
            buttonRef.current?.focus();
        }
    }, [autoFocus]);

    const handleAction = () => {
        if (disabled) return;
        onOpen?.();
        onClick?.();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleAction();
        }
    };

    const ariaLabel = trf('Edit {label}: {value}', {
        label,
        value: displayText,
    });

    return (
        <button
            ref={buttonRef}
            type="button"
            id={id}
            className={cx('entry-field-tag', className)}
            style={style}
            disabled={disabled}
            onClick={handleAction}
            onKeyDown={handleKeyDown}
            aria-label={ariaLabel}
        >
            <span className="entry-field-tag__body">
                <span className="entry-field-tag__label">{label}</span>
                <span className="entry-field-tag__value">{displayText}</span>
            </span>
            <span className="entry-field-tag__icon" aria-hidden="true">
                <Pencil size={11} />
            </span>
        </button>
    );
};
