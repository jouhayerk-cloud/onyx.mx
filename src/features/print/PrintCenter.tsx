import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtom } from 'jotai/react';
import { X, UploadCloud, Search, Printer, FileText } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { isPrintCenterOpenAtom, printCenterTabAtom, PrintCenterTab } from './printState';
import { PrintJobsPanel } from './PrintJobsPanel';
import { verifyDocumentJob } from '../../lib/documentJobs';
import './printCenter.css';

function PrintTemplatesPlaceholder() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
            <FileText className="w-12 h-12 mb-4 opacity-50" />
            <p>{tr('Templates registry arriving in a later phase.')}</p>
        </div>
    );
}

export const PrintCenter: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPrintCenterOpenAtom);
    const [tab, setTab] = useAtom(printCenterTabAtom);
    const [season, setSeason] = useState<'825' | '826'>('826');
    
    // Roving focus refs
    const tabListRef = useRef<HTMLDivElement>(null);
    const prevFocusRef = useRef<HTMLElement | null>(null);
    const centerRef = useRef<HTMLDivElement>(null);

    const [verifyHash, setVerifyHash] = useState('');
    const [verifyStatus, setVerifyStatus] = useState<'match' | 'mismatch' | 'unverifiable' | 'idle'>('idle');

    useEffect(() => {
        if (isOpen) {
            prevFocusRef.current = document.activeElement as HTMLElement;
            centerRef.current?.focus();
        } else {
            if (prevFocusRef.current) {
                prevFocusRef.current.focus();
                prevFocusRef.current = null;
            }
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, setIsOpen]);

    const handleTabKeyDown = (e: React.KeyboardEvent, currentTab: PrintCenterTab) => {
        const tabs: PrintCenterTab[] = ['queue', 'history', 'verify', 'printers', 'templates'];
        const currentIndex = tabs.indexOf(currentTab);
        let nextIndex = currentIndex;

        if (e.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % tabs.length;
        } else if (e.key === 'ArrowLeft') {
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (e.key === 'Home') {
            nextIndex = 0;
        } else if (e.key === 'End') {
            nextIndex = tabs.length - 1;
        } else {
            return;
        }
        
        e.preventDefault();
        const nextTab = tabs[nextIndex];
        setTab(nextTab);
        
        const nextButton = tabListRef.current?.querySelector(`button[data-tab="${nextTab}"]`) as HTMLButtonElement;
        nextButton?.focus();
    };

    const handleVerify = async () => {
        if (!verifyHash.trim()) return;
        setVerifyStatus('idle');
        const status = await verifyDocumentJob(verifyHash.trim());
        setVerifyStatus(status);
    };

    if (!isOpen) return null;

    const content = (
        <div 
            className="pc-layer ui-root" 
            role="dialog" 
            aria-modal="false" 
            aria-label={tr("Print Center")}
            ref={centerRef}
            tabIndex={-1}
        >
            <div className="pc-surface">
                <header className="pc-header">
                    <h2 className="pc-title">{tr('Print Center')}</h2>
                    <div className="pc-header-controls">
                        <select 
                            className="pc-season-select"
                            value={season} 
                            onChange={(e) => setSeason(e.target.value as '825' | '826')}
                            aria-label={tr("Season")}
                        >
                            <option value="826">826</option>
                            <option value="825">825 (Legacy)</option>
                        </select>
                        <button 
                            className="pc-close-btn" 
                            onClick={() => setIsOpen(false)}
                            aria-label={tr('Close')}
                        >
                            <X size={22} />
                        </button>
                    </div>
                </header>

                <div 
                    className="pc-tabs" 
                    role="tablist" 
                    ref={tabListRef}
                    aria-label={tr("Print Center Tabs")}
                >
                    {(['queue', 'history', 'verify', 'printers', 'templates'] as PrintCenterTab[]).map((t) => (
                        <button
                            key={t}
                            role="tab"
                            data-tab={t}
                            aria-selected={tab === t}
                            aria-controls={`tabpanel-${t}`}
                            tabIndex={tab === t ? 0 : -1}
                            className={`pc-tab ${tab === t ? 'active' : ''}`}
                            onClick={() => setTab(t)}
                            onKeyDown={(e) => handleTabKeyDown(e, t)}
                        >
                            {tr(t.charAt(0).toUpperCase() + t.slice(1))}
                        </button>
                    ))}
                </div>

                <div className="pc-content" id={`tabpanel-${tab}`} role="tabpanel">
                    {tab === 'queue' && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                            <Printer className="w-12 h-12 mb-4 opacity-50" />
                            <p>{tr('Print jobs appear here before they are processed.')}</p>
                        </div>
                    )}
                    
                    {tab === 'history' && (
                        <div className="h-full overflow-hidden flex flex-col items-center pt-4">
                            <PrintJobsPanel />
                        </div>
                    )}
                    
                    {tab === 'verify' && (
                        <div className="flex flex-col items-center justify-center h-full p-8 max-w-lg mx-auto w-full gap-6">
                            <div className="text-center pc-text-muted">
                                <Search className="w-12 h-12 mb-4 opacity-50 mx-auto" />
                                <p>{tr('Paste a dj1 hash to verify a document job.')}</p>
                            </div>
                            <div className="flex w-full gap-2">
                                <input 
                                    type="text" 
                                    value={verifyHash} 
                                    onChange={(e) => setVerifyHash(e.target.value)} 
                                    placeholder="dj1:..."
                                    className="pc-input flex-1"
                                />
                                <button onClick={handleVerify} className="pc-btn-primary">
                                    {tr('Verify')}
                                </button>
                            </div>
                            {verifyStatus !== 'idle' && (
                                <div className={`pc-verify-status status-${verifyStatus}`}>
                                    {verifyStatus === 'match' && tr('Match: The document is verified.')}
                                    {verifyStatus === 'mismatch' && tr('Mismatch: The document was altered.')}
                                    {verifyStatus === 'unverifiable' && tr('Unverifiable: Cannot verify this hash.')}
                                </div>
                            )}
                            <div className="pc-dropzone">
                                <UploadCloud className="w-8 h-8 mb-2 opacity-50" />
                                <span>{tr('Or drop a file here')}</span>
                            </div>
                        </div>
                    )}

                    {tab === 'printers' && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                            <Printer className="w-12 h-12 mb-4 opacity-50" />
                            <p>{tr('Phomemo pairing arrives in a later phase.')}</p>
                        </div>
                    )}

                    {tab === 'templates' && (
                        <PrintTemplatesPlaceholder />
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};
