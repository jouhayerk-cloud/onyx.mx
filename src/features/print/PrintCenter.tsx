import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtom } from 'jotai/react';
import { X, UploadCloud, Search, Printer, FileText } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { isPrintCenterOpenAtom, printCenterTabAtom, PrintCenterTab } from './printState';
import { PrintJobsPanel } from './PrintJobsPanel';
import { verifyDocumentJob, checksumV1, findDocumentJobsByHash, getDocumentJobById } from '../../lib/documentJobs';
import { runDjSelfTest } from './selfTest';
import type { SelfTestResult } from './selfTest';
import { getRecentTracked } from './jobTracking';
import type { TrackedJob } from './jobTracking';
import { TemplatesTabContent } from './TemplatesTab';
import { getTemplate } from './templateCatalogue';
import './printCenter.css';

function PrintTemplatesPlaceholder() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
            <FileText className="w-12 h-12 mb-4 opacity-50" />
            <p>{tr('Templates registry arriving in a later phase.')}</p>
        </div>
    );
}

const LocalQueueTabContent: React.FC = () => {
    const tracked = getRecentTracked();
    
    if (tracked.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                <Printer className="w-12 h-12 mb-4 opacity-50" />
                <p>{tr('No recent print jobs in the queue.')}</p>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col h-full p-6 overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{tr("Recent Tracked Jobs")}</h3>
            <div className="flex flex-col gap-3 max-w-4xl mx-auto w-full">
                {tracked.map((job, idx) => {
                    const t = getTemplate(job.templateId);
                    return (
                        <div key={`${job.templateId}-${job.at}-${idx}`} className="pc-glass-card ui-root flex items-center justify-between p-4">
                            <div className="flex items-center gap-4">
                                <div className={`w-2 h-2 rounded-full ${job.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold">{t?.label || job.templateId}</span>
                                        {job.verified === false && (
                                            <span 
                                                className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 cursor-help"
                                                title={tr('File was saved by the generator itself so no output hash was seen.')}
                                            >
                                                {tr('unverified')}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-400 font-mono">{job.fileName || tr('unknown file')}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-6 text-sm text-gray-400">
                                {job.outputBytes !== undefined && (
                                    <span>{(job.outputBytes / 1024).toFixed(1)} KB</span>
                                )}
                                <span>{new Date(job.at).toLocaleString()}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

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
    const [matchedJobs, setMatchedJobs] = useState<any[] | null>(null);
    const [jobVerifyStatuses, setJobVerifyStatuses] = useState<Record<string, 'match' | 'mismatch' | 'unverifiable'>>({});

    const [dragActive, setDragActive] = useState(false);
    const [droppedHash, setDroppedHash] = useState('');

    const [testResults, setTestResults] = useState<SelfTestResult[] | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [recentJobs, setRecentJobs] = useState<TrackedJob[]>([]);

    useEffect(() => {
        if (isOpen) {
            setRecentJobs(getRecentTracked());
            const interval = setInterval(() => {
                setRecentJobs(getRecentTracked());
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [isOpen]);

    const handleRunSelfTest = async () => {
        setIsTesting(true);
        setTestResults(null);
        const results = await runDjSelfTest();
        setTestResults(results);
        setIsTesting(false);
    };

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

    const handleVerify = async (inputStr?: string) => {
        const input = (typeof inputStr === 'string' ? inputStr : verifyHash).trim();
        if (!input) return;
        
        setVerifyStatus('idle');
        setMatchedJobs(null);
        setJobVerifyStatuses({});

        if (input.startsWith('dj1:') || /^[a-fA-F0-9]{64}$/.test(input)) {
            const jobs = await findDocumentJobsByHash(input);
            if (jobs && jobs.length > 0) {
                setMatchedJobs(jobs);
            } else {
                setMatchedJobs([]);
            }
        } else {
            await getDocumentJobById(input);
            const status = await verifyDocumentJob(input);
            setVerifyStatus(status);
        }
    };
    
    const handleVerifyJobRow = async (jobId: string) => {
        const status = await verifyDocumentJob(jobId);
        setJobVerifyStatuses(prev => ({ ...prev, [jobId]: status }));
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
            setVerifyHash(hash);
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

                <div className="pc-status-strip">
                    <span className="font-semibold">
                        {tr('Tracked this session:')} {recentJobs.length} {recentJobs.length === 1 ? tr('job') : tr('jobs')}
                    </span>
                    {recentJobs.length > 0 && (
                        <span className="ml-4 opacity-80 text-sm">
                            {tr('Last:')} {recentJobs[0].templateId}
                            {recentJobs[0].fileName ? ` (${recentJobs[0].fileName})` : ''}
                            {recentJobs[0].outputBytes ? ` - ${recentJobs[0].outputBytes} ${tr('bytes')}` : ''}
                        </span>
                    )}
                </div>

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
                            <LocalQueueTabContent />
                        </div>
                    )}
                    
                    {tab === 'history' && (
                        <div className="h-full overflow-hidden flex flex-col items-center pt-4 w-full">
                            <PrintJobsPanel season={season} />
                        </div>
                    )}
                    
                    {tab === 'verify' && (
                        <div className="flex flex-col items-center justify-start h-full p-8 max-w-lg mx-auto w-full gap-6 overflow-y-auto">
                            <div className="text-center pc-text-muted shrink-0">
                                <Search className="w-12 h-12 mb-4 opacity-50 mx-auto" />
                                <p>{tr('Paste a document job ID to verify its ledger entry.')}</p>
                            </div>
                            <div className="flex w-full gap-2 shrink-0">
                                <input 
                                    type="text" 
                                    value={verifyHash} 
                                    onChange={(e) => setVerifyHash(e.target.value)} 
                                    placeholder={tr("Job ID...")}
                                    className="pc-input flex-1"
                                />
                                <button onClick={() => handleVerify()} className="pc-btn-primary">
                                    {tr('Verify')}
                                </button>
                            </div>
                            
                            {matchedJobs !== null ? (
                                matchedJobs.length === 0 ? (
                                    <div className="pc-verify-status status-unverifiable shrink-0">
                                        {tr('No matching jobs found for this hash.')}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2 w-full shrink-0 overflow-y-auto max-h-64 pr-2">
                                        {matchedJobs.map(job => (
                                            <div key={job.id} className="pc-glass-card ui-root p-4 flex flex-col gap-2">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sm">{job.job_ref || job.id}</span>
                                                        <span className="text-xs text-gray-400 font-mono">{job.template_id} - Season {job.season}</span>
                                                        <span className="text-xs text-gray-500">{job.file_name}</span>
                                                        <span className="text-xs text-gray-500">{new Date(job.created_at).toLocaleString()}</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => handleVerifyJobRow(job.id)}
                                                        className="pc-btn-primary text-xs py-1 px-3"
                                                    >
                                                        {tr('Verify')}
                                                    </button>
                                                </div>
                                                {jobVerifyStatuses[job.id] && (
                                                    <div className={`pc-verify-status status-${jobVerifyStatuses[job.id]} mt-2 p-2 text-xs`}>
                                                        {jobVerifyStatuses[job.id] === 'match' && tr('Match: The document is verified.')}
                                                        {jobVerifyStatuses[job.id] === 'mismatch' && tr('Mismatch: The document was altered.')}
                                                        {jobVerifyStatuses[job.id] === 'unverifiable' && tr('Unverifiable: Cannot verify this ID.')}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : (
                                verifyStatus !== 'idle' && (
                                    <div className={`pc-verify-status status-${verifyStatus} shrink-0`}>
                                        {verifyStatus === 'match' && tr('Match: The document is verified.')}
                                        {verifyStatus === 'mismatch' && tr('Mismatch: The document was altered.')}
                                        {verifyStatus === 'unverifiable' && tr('Unverifiable: Cannot verify this ID.')}
                                    </div>
                                )
                            )}

                            <div 
                                className={`pc-dropzone flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 w-full transition-colors shrink-0 ${dragActive ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-gray-600 bg-gray-800/50 text-gray-400'}`}
                                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                                onDragLeave={() => setDragActive(false)}
                                onDrop={handleDrop}
                            >
                                <UploadCloud className="w-8 h-8 mb-2 opacity-50" />
                                <span className="text-center">{tr('Or drop a snapshot file here to calculate its hash')}</span>
                                {droppedHash && (
                                    <div className="mt-4 p-2 bg-black/50 rounded w-full text-center font-mono text-sm select-all break-all text-gray-300">
                                        {droppedHash}
                                    </div>
                                )}
                            </div>

                            <div className="w-full mt-2 pt-6 border-t border-gray-600/30 flex flex-col items-center shrink-0">
                                <button onClick={handleRunSelfTest} disabled={isTesting} className="pc-btn-primary mb-4">
                                    {isTesting ? tr('Running...') : tr('Run self-test')}
                                </button>
                                {testResults && (
                                    <div className="pc-test-results">
                                        <div className="text-center font-bold mb-2">
                                            {testResults.filter(r => r.ok).length} {tr('of')} {testResults.length} {tr('passed')}
                                        </div>
                                        {testResults.map((res, i) => (
                                            <div key={i} className="pc-test-row">
                                                <div className="pc-test-row-header">
                                                    <span className="font-semibold">{res.name}</span>
                                                    <span className={res.ok ? 'text-green-400' : 'text-red-400'}>
                                                        {res.ok ? tr('Passed') : tr('Failed')}
                                                    </span>
                                                </div>
                                                <div className="text-xs opacity-70">{res.detail}</div>
                                            </div>
                                        ))}
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
