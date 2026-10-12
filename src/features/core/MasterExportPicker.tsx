import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../lib/i18n';
import { Dialog, Key, cx } from '../../components/ui';

export type ExportBook = 'V2' | 'V3';

const STORAGE_KEY = 'onyx_export_book';

function getInitialBook(): ExportBook {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'V3') return 'V3';
        if (stored === 'V2') return 'V2';
    } catch {
        // Ignore localStorage access failures
    }
    return 'V2';
}

function saveBookPreference(book: ExportBook): void {
    try {
        localStorage.setItem(STORAGE_KEY, book);
    } catch {
        // Ignore localStorage write failures
    }
}

export function MasterExportPicker() {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedBook, setSelectedBook] = useState<ExportBook>(getInitialBook);

    const v2Ref = useRef<HTMLButtonElement>(null);
    const v3Ref = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleOpen = () => {
            setSelectedBook(getInitialBook());
            setIsOpen(true);
        };

        document.addEventListener('openMasterExportPicker', handleOpen);
        return () => {
            document.removeEventListener('openMasterExportPicker', handleOpen);
        };
    }, []);

    const handleCancel = () => {
        setIsOpen(false);
    };

    const handleConfirm = () => {
        setIsOpen(false);
        saveBookPreference(selectedBook);
        const eventName = selectedBook === 'V3' ? 'triggerMasterExportV3' : 'triggerMasterExport';
        document.dispatchEvent(new CustomEvent(eventName));
    };

    const selectBook = (book: ExportBook) => {
        setSelectedBook(book);
        saveBookPreference(book);
    };

    const handleOptionKeyDown = (e: React.KeyboardEvent, book: ExportBook) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            selectBook('V3');
            v3Ref.current?.focus();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            selectBook('V2');
            v2Ref.current?.focus();
        } else if (e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            selectBook(book);
        }
    };

    const handleDialogKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const target = e.target as HTMLElement | null;
            if (target?.getAttribute('data-action') === 'cancel') {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            handleConfirm();
        }
    };

    if (!isOpen || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div
            className="ui-root fixed inset-0 z-[1050]"
            onKeyDown={handleDialogKeyDown}
        >
            <Dialog
                title={tr('Export workbook')}
                onCancel={handleCancel}
                actions={
                    <>
                        <Key
                            variant="quiet"
                            data-action="cancel"
                            onClick={handleCancel}
                        >
                            {tr('Cancel')}
                        </Key>
                        <Key
                            variant="go"
                            onClick={handleConfirm}
                        >
                            {tr('Export')}
                        </Key>
                    </>
                }
            >
                <div className="flex flex-col gap-3">
                    <p className="text-[13px] text-[var(--ui-dim)] m-0 leading-normal">
                        {tr('Choose which book to export.')}
                    </p>

                    <div
                        role="radiogroup"
                        aria-label={tr('Choose which book to export.')}
                        className="flex flex-col gap-2.5 my-1"
                    >
                        {/* Choice 1: Workbook V2 */}
                        <button
                            ref={v2Ref}
                            type="button"
                            role="radio"
                            aria-checked={selectedBook === 'V2'}
                            data-autofocus=""
                            tabIndex={0}
                            onClick={() => selectBook('V2')}
                            onKeyDown={(e) => handleOptionKeyDown(e, 'V2')}
                            className={cx(
                                'w-full text-left flex items-start gap-3 p-3.5 rounded-[var(--ui-r-md)] border transition-all cursor-pointer select-none',
                                'focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] focus-visible:outline-offset-2',
                                selectedBook === 'V2'
                                    ? 'bg-[var(--ui-raise)] border-[var(--ui-accent)] shadow-[var(--ui-lift)]'
                                    : 'bg-[var(--ui-well)] border-[var(--ui-edge)] hover:bg-[var(--ui-hover)] hover:border-[var(--ui-edge-hi)]'
                            )}
                            style={{ minHeight: '52px' }}
                        >
                            <span
                                className={cx(
                                    'flex-none w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 transition-colors',
                                    selectedBook === 'V2'
                                        ? 'border-[var(--ui-accent)] bg-[var(--ui-accent)]'
                                        : 'border-[var(--ui-dim)] bg-transparent'
                                )}
                                aria-hidden="true"
                            >
                                {selectedBook === 'V2' && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--ui-accent-ink)]" />
                                )}
                            </span>
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[14px] font-bold text-[var(--ui-ink)] tracking-tight">
                                        {tr('Workbook V2')}
                                    </span>
                                    <span
                                        className={cx(
                                            'text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-[var(--ui-r-sm)] tabular-nums border',
                                            selectedBook === 'V2'
                                                ? 'bg-[var(--ui-accent)] text-[var(--ui-accent-ink)] border-transparent'
                                                : 'bg-[var(--ui-raise)] text-[var(--ui-dim)] border-[var(--ui-edge)]'
                                        )}
                                    >
                                        326
                                    </span>
                                </div>
                                <span className="text-[12px] text-[var(--ui-dim)] leading-snug">
                                    {tr('All items, full finance ledger (Rare Earth Format)')}
                                </span>
                            </div>
                        </button>

                        {/* Choice 2: Workbook V3 */}
                        <button
                            ref={v3Ref}
                            type="button"
                            role="radio"
                            aria-checked={selectedBook === 'V3'}
                            tabIndex={0}
                            onClick={() => selectBook('V3')}
                            onKeyDown={(e) => handleOptionKeyDown(e, 'V3')}
                            className={cx(
                                'w-full text-left flex items-start gap-3 p-3.5 rounded-[var(--ui-r-md)] border transition-all cursor-pointer select-none',
                                'focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] focus-visible:outline-offset-2',
                                selectedBook === 'V3'
                                    ? 'bg-[var(--ui-raise)] border-[var(--ui-accent)] shadow-[var(--ui-lift)]'
                                    : 'bg-[var(--ui-well)] border-[var(--ui-edge)] hover:bg-[var(--ui-hover)] hover:border-[var(--ui-edge-hi)]'
                            )}
                            style={{ minHeight: '52px' }}
                        >
                            <span
                                className={cx(
                                    'flex-none w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 transition-colors',
                                    selectedBook === 'V3'
                                        ? 'border-[var(--ui-accent)] bg-[var(--ui-accent)]'
                                        : 'border-[var(--ui-dim)] bg-transparent'
                                )}
                                aria-hidden="true"
                            >
                                {selectedBook === 'V3' && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--ui-accent-ink)]" />
                                )}
                            </span>
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[14px] font-bold text-[var(--ui-ink)] tracking-tight">
                                        {tr('Workbook V3')}
                                    </span>
                                    <span
                                        className={cx(
                                            'text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-[var(--ui-r-sm)] tabular-nums border',
                                            selectedBook === 'V3'
                                                ? 'bg-[var(--ui-accent)] text-[var(--ui-accent-ink)] border-transparent'
                                                : 'bg-[var(--ui-raise)] text-[var(--ui-dim)] border-[var(--ui-edge)]'
                                        )}
                                    >
                                        826
                                    </span>
                                </div>
                                <span className="text-[12px] text-[var(--ui-dim)] leading-snug">
                                    {tr('Workbook 826 items only, finance ledger from September 2026')}
                                </span>
                            </div>
                        </button>
                    </div>
                </div>
            </Dialog>
        </div>,
        document.body
    );
}

export default MasterExportPicker;
