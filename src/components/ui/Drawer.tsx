import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { Key } from './Key';
import { cx } from './types';

export interface DrawerProps {
    /** Header content: an ItemTag and a StatusPill, or a plain title. */
    title: React.ReactNode;
    /** Accessible name when the title is not plain text. */
    label?: string;
    /** Keys in the header, before the close key. */
    actions?: React.ReactNode;
    /** Footer: Accept, regenerate, edit. */
    footer?: React.ReactNode;
    /**
     * inline: a column beside the list (wide screens). overlay: a modal
     * panel over the page from the right (narrow screens), portalled to
     * <body> with a scrim; Esc and the scrim close it.
     */
    variant?: 'inline' | 'overlay';
    /** Overlay only. An inline drawer is shown or not by its parent. */
    open?: boolean;
    onClose?: () => void;
    className?: string;
    children: React.ReactNode;
}

/** The review panel shell: header, scrolling body, footer. */
export function Drawer({ title, label, actions, footer, variant = 'inline', open = true, onClose, className, children }: DrawerProps) {
    const panelRef = useRef<HTMLElement>(null);
    const overlay = variant === 'overlay';

    // An overlay takes focus when it opens and gives it back when it closes.
    useEffect(() => {
        if (!overlay || !open) return;
        const opener = document.activeElement as HTMLElement | null;
        panelRef.current?.focus();
        return () => { opener?.focus?.(); };
    }, [overlay, open]);

    const panel = (
        <aside
            ref={panelRef}
            className={cx(overlay ? 'ui-root ui-drawer ui-drawer--overlay' : 'ui-drawer ui-drawer--inline', className)}
            aria-label={label ?? (typeof title === 'string' ? title : tr('Item review'))}
            role={overlay ? 'dialog' : undefined}
            aria-modal={overlay || undefined}
            tabIndex={overlay ? -1 : undefined}
            onKeyDown={overlay ? (e) => {
                if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose(); return; }
                // Modal: Tab cycles inside the panel instead of reaching the
                // page behind the scrim.
                // (A Lightbox opened from the panel is portalled elsewhere but
                // its keys still bubble here through React; it traps its own.)
                if (e.key !== 'Tab' || e.defaultPrevented || !panelRef.current?.contains(e.target as Node)) return;
                const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
                ));
                if (!nodes.length) { e.preventDefault(); return; }
                const first = nodes[0];
                const last = nodes[nodes.length - 1];
                const active = document.activeElement;
                if (e.shiftKey && (active === first || active === panelRef.current)) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
            } : undefined}
        >
            <div className="ui-drawer__head">
                <div className="ui-drawer__title">{title}</div>
                {actions}
                {onClose && <Key iconOnly size="sm" variant="quiet" icon={<X size={14} />} label={tr('Close')} onClick={onClose} />}
            </div>
            <div className="ui-drawer__body">{children}</div>
            {footer && <div className="ui-drawer__foot">{footer}</div>}
        </aside>
    );

    if (!overlay) return panel;
    if (!open) return null;
    return createPortal(
        <>
            <div className="ui-root ui-drawer-scrim" aria-hidden="true" onClick={onClose} />
            {panel}
        </>,
        document.body,
    );
}
