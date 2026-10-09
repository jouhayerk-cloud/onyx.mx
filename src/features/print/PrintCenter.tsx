import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useSetAtom } from 'jotai/react';
import { X, UploadCloud, Search, Printer, FileText } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { isPackingPrintWizardOpenAtom, isPackingNFCWizardOpenAtom } from '../../lib/atoms';
import { isPrintCenterOpenAtom, printCenterTabAtom, PrintCenterTab } from './printState';
import { PrintJobsPanel } from './PrintJobsPanel';
import { verifyDocumentJob, checksumV1 } from '../../lib/documentJobs';
import { TemplatesTabContent, QueueTabContent } from './TemplatesTab';
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
    const [dragActive, setDragActive] = useState(false);
    const [droppedHash, setDroppedHash] = useState('');
    const setPrintOpen = useSetAtom(isPackingPrintWizardOpenAtom);
    const setNfcOpen = useSetAtom(isPackingNFCWizardOpenAtom);

    useEffect(() => {
        // No longer trigger standalone LabelWizard/NFCWizard from tabs.
        // The PrintCenter now has its own inline split-view UI for templates and NFC.
    }, []);

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

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const snapshot = JSON.parse(text);
            const hash = await checksumV1(snapshot);
            setDroppedHash(hash);
        } catch (err) {
            console.error('Failed to parse or hash dropped file:', err);
            setDroppedHash(tr('Invalid JSON file or hash failure'));
        }
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
                        <div className="h-full overflow-hidden w-full">
                            <QueueTabContent />
                        </div>
                    )}
                    
                    {tab === 'history' && (
                        <div className="h-full overflow-hidden flex flex-col items-center pt-4 w-full">
                            <PrintJobsPanel season={season} />
                        </div>
                    )}
                    
                    {tab === 'verify' && (
                        <div className="flex flex-col items-center justify-center h-full p-8 max-w-lg mx-auto w-full gap-6">
                            <div className="text-center pc-text-muted">
                                <Search className="w-12 h-12 mb-4 opacity-50 mx-auto" />
                                <p>{tr('Paste a document job ID to verify its ledger entry.')}</p>
                            </div>
                            <div className="flex w-full gap-2">
                                <input 
                                    type="text" 
                                    value={verifyHash} 
                                    onChange={(e) => setVerifyHash(e.target.value)} 
                                    placeholder={tr("Job ID...")}
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
                                    {verifyStatus === 'unverifiable' && tr('Unverifiable: Cannot verify this ID.')}
                                </div>
                            )}
                            <div 
                                className={`pc-dropzone flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 w-full transition-colors ${dragActive ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-gray-600 bg-gray-800/50 text-gray-400'}`}
                                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                                onDragLeave={() => setDragActive(false)}
                                onDrop={handleDrop}
                            >
                                <UploadCloud className="w-8 h-8 mb-2 opacity-50" />
                                <span>{tr('Or drop a snapshot file here to calculate its hash')}</span>
                                {droppedHash && (
                                    <div className="mt-4 p-2 bg-black/50 rounded w-full text-center font-mono text-sm select-all break-all text-gray-300">
                                        {droppedHash}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'nfc' && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 max-w-sm mx-auto">
                            <div className="w-32 h-32 rounded-full border-4 border-dashed border-gray-600 flex items-center justify-center mb-6 animate-pulse">
                                <span className="text-gray-500">NFC</span>
                            </div>
                            <button className="pc-btn-primary w-full py-4 text-lg font-semibold tracking-wider rounded-xl">
                                WRITE TO TAG
                            </button>
                        </div>
                    )}

                    {tab === 'printers' && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                            <Printer className="w-12 h-12 mb-4 opacity-50" />
                            <p>{tr('Phomemo pairing arrives in a later phase.')}</p>
                        </div>
                    )}

                    {tab === 'templates' && (
                        <div className="h-full overflow-hidden w-full">
                            <TemplatesTabContent />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};


