import React from 'react';
import { ChevronDown, X } from 'lucide-react';
import { tr } from '../../lib/i18n';

/**
 * One panel of the deployed island's stack (Chan, Inbox, and the on demand All tools and Item panels).
 * The always present panels collapse to their header; the on demand ones have a close button instead.
 */
export const IslandStackPanel: React.FC<{
    id: string;
    title: string;
    icon: React.ElementType;
    open: boolean;
    /** Toggles the panel (collapsible panels). */
    onToggle?: () => void;
    /** Closes the panel (on demand panels). */
    onClose?: () => void;
    badge?: number;
    /** Share of the free height while open (flex grow). */
    grow?: number;
    children: React.ReactNode;
}> = ({ id, title, icon: Icon, open, onToggle, onClose, badge = 0, grow = 1, children }) => {
    const headId = `isl-stack-${id}-h`;
    const bodyId = `isl-stack-${id}-b`;
    const label = (
        <>
            <Icon size={16} strokeWidth={2} aria-hidden="true" />
            <span className="isl-stack-title">{title}</span>
            {badge > 0 && <span className="isl-tab-count isl-num" aria-label={`${badge}`}>{badge > 9 ? '9+' : badge}</span>}
        </>
    );

    return (
        <section className={`isl-stack-panel${open ? ' is-open' : ''}`} style={open ? { flexGrow: grow } : undefined} aria-labelledby={headId}>
            <header className="isl-stack-head">
                {onToggle ? (
                    <button id={headId} type="button" className="isl-stack-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
                        {label}
                        <ChevronDown size={16} strokeWidth={2} className="isl-stack-chev" aria-hidden="true" />
                    </button>
                ) : (
                    <h3 id={headId} className="isl-stack-toggle isl-stack-static">{label}</h3>
                )}
                {onClose && (
                    <button type="button" className="isl-stack-close" onClick={onClose} aria-label={tr('Close')} title={tr('Close')}>
                        <X size={16} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                )}
            </header>
            {open && <div id={bodyId} className="isl-stack-body">{children}</div>}
        </section>
    );
};
