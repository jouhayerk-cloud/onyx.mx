import React, { useEffect, useId, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { cx } from '../../components/ui';

export interface EntrySectionProps {
    id?: string;
    title: string;
    open: boolean;
    onToggle: () => void;
    onOpen?: () => void;
    onCollapse?: () => void;
    summary?: readonly (string | null | undefined)[];
    collapsible?: boolean;
    isFilled?: boolean;
    autoCollapse?: boolean;
    className?: string;
    children: React.ReactNode;
}

/**
 * Collapsible section disclosure with a quiet header row: small caps title,
 * chevron, hairline separator, and a one-line summary of values when collapsed.
 * Auto-collapses 400 ms after required fields are filled and focus leaves the section.
 */
export const EntrySection: React.FC<EntrySectionProps> = ({
    id,
    title,
    open,
    onToggle,
    onOpen,
    onCollapse,
    summary,
    collapsible = true,
    isFilled = false,
    autoCollapse = false,
    className = '',
    children,
}) => {
    const uid = useId();
    const sectionId = id || `sec-${uid}`;
    const headerId = `${sectionId}-header`;
    const contentId = `${sectionId}-content`;

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        const next = e.relatedTarget as HTMLElement | null;
        if (e.currentTarget.contains(next)) return;

        if (!autoCollapse || !isFilled || !open) return;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            onCollapse?.();
        }, 400);
    };

    const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (!open) {
            onOpen?.();
        }
    };

    const handleHeaderClick = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        onToggle();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleHeaderClick();
        }
    };

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!isFilled || !open) {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        }
    }, [isFilled, open]);

    if (!collapsible) {
        return (
            <div className={cx('entry-section entry-section--bare', className)}>
                {children}
            </div>
        );
    }

    const summaryChips = (summary || []).filter((s): s is string => typeof s === 'string' && s.trim().length > 0);

    return (
        <div
            className={cx('entry-section', className)}
            onBlur={handleBlur}
            onFocus={handleFocus}
        >
            <button
                type="button"
                id={headerId}
                className="entry-section__header"
                aria-expanded={open}
                aria-controls={contentId}
                aria-label={!open && summaryChips.length > 0 ? `${title}: ${summaryChips.join(', ')}` : title}
                onClick={handleHeaderClick}
                onKeyDown={handleKeyDown}
            >
                <div className="entry-section__header-left">
                    <span className="entry-section__title">{title}</span>
                    {!open && summaryChips.length > 0 && (
                        <span className="entry-section__summary" aria-hidden="true">
                            {summaryChips.map((chip, idx) => (
                                <span key={idx} className="entry-section__chip">{chip}</span>
                            ))}
                        </span>
                    )}
                </div>
                <span
                    className={cx('entry-section__chevron', open && 'entry-section__chevron--open')}
                    aria-hidden="true"
                    title={open ? tr('Collapse section') : tr('Expand section')}
                >
                    <ChevronDown size={14} />
                </span>
            </button>

            <div
                id={contentId}
                role="region"
                aria-labelledby={headerId}
                hidden={!open}
                className="entry-section__body"
            >
                {children}
            </div>
        </div>
    );
};
