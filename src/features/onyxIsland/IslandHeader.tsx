import React from 'react';
import { X } from 'lucide-react';
import { tr } from '../../lib/i18n';
import type { IslandSize } from './islandState';

/**
 * One header for every tab of the panel: the face (it morphs here from the rest pill), the greeting with the name,
 * the role and the current view, the page figures, Close. The same header everywhere replaces the two different
 * ones the panel had.
 */

/** Time-of-day greeting for the given hour, translated: morning before 12, afternoon before 18. */
export const greeting = (now = new Date()): string => {
    const h = now.getHours();
    if (h < 12) return tr('Good morning');
    if (h < 18) return tr('Good afternoon');
    return tr('Good evening');
};

/** The first name when the user has one, otherwise the part of the e-mail before the @ (never a raw uuid). */
export const displayNameOf = (user: { name?: string; email?: string } | null | undefined): string => {
    const name = user?.name;
    if (name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) return name.split(' ')[0];
    return user?.email?.split('@')[0] || tr('User');
};

const SIZES: { id: IslandSize; label: string; name: string }[] = [
    { id: 'S', label: 'S', name: 'Small' },
    { id: 'M', label: 'M', name: 'Medium' },
    { id: 'L', label: 'L', name: 'Large' },
    { id: 'F', label: 'Full', name: 'Full' },
];

export const IslandHeader: React.FC<{
    face: React.ReactNode;
    name: string;
    meta: string;
    figures?: React.ReactNode;
    onClose: () => void;
    id?: string;
    /** Size control (desktop only: the phone sheet is always full width). */
    size?: IslandSize;
    onSize?: (s: IslandSize) => void;
}> = ({ face, name, meta, figures, onClose, id, size, onSize }) => (
    <header className="isl-head">
        <div className="isl-head-face">{face}</div>
        <div className="isl-head-text">
            <h2 id={id} className="isl-greet">{greeting()}, <span className="isl-greet-name">{name}</span></h2>
            <p className="isl-meta">{meta}</p>
        </div>
        {figures && <div className="isl-head-figures">{figures}</div>}
        {size && onSize && (
            <div className="isl-size" role="radiogroup" aria-label={tr('Island size')}>
                {SIZES.map(o => (
                    <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={size === o.id}
                        aria-label={tr(o.name)}
                        title={tr(o.name)}
                        className={`isl-size-btn${size === o.id ? ' is-selected' : ''}`}
                        onClick={() => onSize(o.id)}
                    >
                        {o.id === 'F' ? tr('Full') : o.label}
                    </button>
                ))}
            </div>
        )}
        <button type="button" className="isl-icon-btn" aria-label={tr('Close')} onClick={onClose}>
            <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
    </header>
);
