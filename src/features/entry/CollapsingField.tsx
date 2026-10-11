import React, { useEffect, useRef, useState } from 'react';
import { cx } from '../../components/ui';
import { FieldTag } from './FieldTag';

export interface CollapsingFieldProps {
    label: string;
    value: string;
    display?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    enabled?: boolean;
    disabled?: boolean;
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}

/**
 * Wrapper for a form field that collapses into a compact FieldTag once filled,
 * and re-deploys when clicked or focused.
 *
 * State: open when value is empty, when re-opened by the user, or while focus
 * is inside the field or its suggestions. Collapses when non-empty and focus
 * leaves the field (or when Enter is pressed in a filled input).
 */
export const CollapsingField: React.FC<CollapsingFieldProps> = ({
    label,
    value,
    display,
    open: openProp,
    onOpenChange,
    enabled = true,
    disabled = false,
    className = '',
    style,
    children,
}) => {
    const isControlled = openProp !== undefined;
    const isEmpty = !value || value.trim().length === 0;

    const [isUserOpen, setIsUserOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [shouldFocusTag, setShouldFocusTag] = useState(false);
    const shouldFocusInputRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const isOpen = !enabled
        ? true
        : isControlled
        ? openProp
        : (isEmpty || isUserOpen || isFocused);

    // Focus input and select its text when deployed by clicking the tag
    useEffect(() => {
        if (isOpen && shouldFocusInputRef.current) {
            shouldFocusInputRef.current = false;
            requestAnimationFrame(() => {
                const input = containerRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(
                    'input:not([type="hidden"]), select'
                );
                if (input) {
                    input.focus();
                    if ('select' in input && typeof input.select === 'function') {
                        input.select();
                    }
                }
            });
        }
    }, [isOpen]);

    const handleOpen = () => {
        shouldFocusInputRef.current = true;
        setIsUserOpen(true);
        onOpenChange?.(true);
    };

    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        const next = e.relatedTarget as HTMLElement | null;
        // Focus stayed inside container
        if (e.currentTarget.contains(next)) return;

        // Focus moved to suggestions (desktop chips or mobile list)
        if (
            next?.closest('.entry-tags-row') ||
            next?.closest('.entry-suggestions-mobile') ||
            next?.closest('.entry-field-suggestions')
        ) {
            return;
        }

        setIsFocused(false);
        if (!isEmpty) {
            setIsUserOpen(false);
            onOpenChange?.(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter') {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' && !isEmpty) {
                // For dimensions: pressing Enter in W advances to H, H advances to D
                const fieldName = target.getAttribute('data-field');
                if (fieldName === 'widthCm') {
                    const next = containerRef.current?.querySelector<HTMLInputElement>('input[data-field="heightCm"]');
                    if (next) {
                        e.preventDefault();
                        next.focus();
                        next.select?.();
                        return;
                    }
                }
                if (fieldName === 'heightCm') {
                    const next = containerRef.current?.querySelector<HTMLInputElement>('input[data-field="lengthCm"]');
                    if (next) {
                        e.preventDefault();
                        next.focus();
                        next.select?.();
                        return;
                    }
                }

                // In a filled field, Enter collapses it and moves focus to the tag
                e.preventDefault();
                setIsUserOpen(false);
                setIsFocused(false);
                onOpenChange?.(false);
                setShouldFocusTag(true);
            }
        }
    };

    if (!isOpen) {
        return (
            <FieldTag
                label={label}
                value={value}
                display={display}
                onOpen={handleOpen}
                disabled={disabled}
                className={className}
                style={style}
                autoFocus={shouldFocusTag}
            />
        );
    }

    return (
        <div
            ref={containerRef}
            className={cx('entry-collapsing-field entry-collapsing-field--open', className)}
            style={style}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
        >
            {children}
        </div>
    );
};
