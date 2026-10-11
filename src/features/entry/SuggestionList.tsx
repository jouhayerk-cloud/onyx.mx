import React from 'react';
import { cx } from '../../components/ui';

export interface SuggestionListProps {
    label: string;
    suggestions: readonly string[];
    onPick: (value: string) => void;
    onClose?: () => void;
    getCount?: (value: string) => number | undefined;
    max?: number;
    renderLead?: (value: string) => React.ReactNode;
    className?: string;
}

const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/**
 * Mobile suggestion list: an in-flow list of 44px rows displaying the candidate
 * value and its frequency count, with the field label above. Tapping an item fills
 * the field and closes the list.
 */
export const SuggestionList: React.FC<SuggestionListProps> = ({
    label,
    suggestions,
    onPick,
    onClose,
    getCount,
    max = 12,
    renderLead,
    className = '',
}) => {
    const items = suggestions.slice(0, max);
    if (items.length === 0) return null;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose?.();
        }
    };

    return (
        <div
            role="region"
            aria-label={label}
            className={cx('suggestion-list', className)}
            onKeyDown={handleKeyDown}
        >
            <div className="suggestion-list__header">
                <span className="suggestion-list__label">{label}</span>
            </div>
            <ul className="suggestion-list__items">
                {items.map(item => {
                    const count = getCount?.(item);
                    const lead = renderLead?.(item);
                    return (
                        <li key={item} className="suggestion-list__row">
                            <button
                                type="button"
                                className="suggestion-list__item"
                                onMouseDown={keepFocus}
                                onClick={() => onPick(item)}
                            >
                                {lead && (
                                    <span className="suggestion-list__lead" aria-hidden="true">
                                        {lead}
                                    </span>
                                )}
                                <span className="suggestion-list__value">{item}</span>
                                {count !== undefined && count > 0 && (
                                    <span className="suggestion-list__count">{count}</span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};
