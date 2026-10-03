import React, { useEffect, useId, useRef } from 'react';

export interface DialogProps {
    title: string;
    children: React.ReactNode;
    /** The buttons, right-aligned under the body. */
    actions: React.ReactNode;
    /** Esc, a click on the scrim, or a Cancel key. */
    onCancel: () => void;
}

/**
 * An in-page confirmation or prompt (never a native confirm()). It fills its
 * nearest positioned ancestor, so the screen that uses it decides what gets
 * covered. Opaque card: it is read on, and it can sit over a list that keeps
 * updating while a run goes on.
 *
 * Focus goes in (to [data-autofocus], else the first field or key) and back to
 * whatever opened it. Tab cycles inside the card. Esc cancels and goes no
 * further: it does not also close the screen underneath, whether that listens
 * through React or on window.
 */
export function Dialog({ title, children, actions, onCancel }: DialogProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const bodyId = useId();

    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        const card = cardRef.current;
        const first = card?.querySelector<HTMLElement>('[data-autofocus]') || card?.querySelector<HTMLElement>('input, button');
        first?.focus();
        return () => { opener?.focus?.(); };
    }, []);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onCancel();
            return;
        }
        if (e.key !== 'Tab' || !cardRef.current) return;
        const nodes = Array.from(cardRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
        ));
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    return (
        <div className="ui-dialog" onKeyDown={onKeyDown}>
            <div className="ui-dialog__scrim" aria-hidden="true" onClick={onCancel} />
            {/* tabIndex -1: a click on the text keeps focus inside, so Esc and
                the Tab trap keep working. */}
            <div ref={cardRef} className="ui-dialog__card" role="alertdialog" aria-modal="true"
                aria-labelledby={titleId} aria-describedby={bodyId} tabIndex={-1}>
                <h3 id={titleId} className="ui-dialog__title">{title}</h3>
                <div id={bodyId} className="ui-dialog__body">{children}</div>
                <div className="ui-dialog__acts">{actions}</div>
            </div>
        </div>
    );
}
