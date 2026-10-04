import React, { Suspense, lazy, useCallback, useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { onyxAgentOpenAtom, onyxAgentPhaseAtom } from './agentState';
import { OnyxAgentButton } from './OnyxAgentButton';
import { userAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';

const OnyxAgentHost = lazy(() => import('./OnyxAgentHost').then(m => ({ default: m.OnyxAgentHost })));

export function OnyxAgentSlot() {
    const user = useAtomValue(userAtom);
    const role = user?.role;
    const isAllowed = role === 'Developer' || role === 'Admin' || role === 'Vendor' || role === 'Client';

    const [open, setOpen] = useAtom(onyxAgentOpenAtom);
    const phase = useAtomValue(onyxAgentPhaseAtom);
    
    const buttonRef = useRef<HTMLButtonElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const handleToggle = useCallback(() => setOpen(o => !o), [setOpen]);
    const handleClose = useCallback(() => {
        setOpen(false);
        if (buttonRef.current) {
            buttonRef.current.focus();
        }
    }, [setOpen]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleClose();
            }
        };
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node) && buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
                handleClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [open, handleClose]);

    if (!isAllowed) {
        return null;
    }

    const controlsId = 'onyx-agent-panel-dialog';

    return (
        <>
            <OnyxAgentButton 
                ref={buttonRef}
                phase={phase} 
                open={open} 
                onToggle={handleToggle} 
                controlsId={controlsId} 
            />
            {open && (
                <div 
                    ref={wrapperRef}
                    className="fixed z-50 flex flex-col bg-[var(--slab)] shadow-[var(--slab-float)] rounded-lg border border-[var(--slab-edge)] overflow-hidden" 
                    style={{ top: '64px', right: '12px', width: 'min(440px, calc(100vw - 24px))', maxHeight: 'calc(100vh - 80px)' }}
                    role="dialog"
                    aria-label={tr('Onyx assistant')}
                    id={controlsId}
                >
                    <Suspense fallback={null}>
                        <OnyxAgentHost variant="drawer" onClose={handleClose} />
                    </Suspense>
                </div>
            )}
        </>
    );
}
