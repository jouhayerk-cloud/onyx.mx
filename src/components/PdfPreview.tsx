import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ExternalLink, Eye, FileText, AlertTriangle } from 'lucide-react';
import { tr } from '../lib/i18n';

/**
 * One document in the preview pane. Either `url` (caller owns the object URL and
 * is responsible for revoking it) or `blob` (this component creates the URL and
 * revokes it) -- never both. Passing both is a caller bug; `url` wins.
 */
export interface PdfDocumentSource {
    key: string;
    /** Tab label. Already translated by the caller. */
    label: string;
    /** Suggested download filename, including the .pdf extension. */
    filename: string;
    url?: string;
    blob?: Blob | null;
    /** Small grey note beside the tab label, e.g. an item count. */
    meta?: string;
    /** Byte size, when the caller knows it and only passed a `url`. */
    bytes?: number;
}

interface PdfPreviewProps {
    isOpen: boolean;
    onClose: () => void;
    docs: PdfDocumentSource[];
    title: string;
    /**
     * Rendered in the footer beside Download -- used for "Regenerate" in the
     * Printables Engine. Kept as a slot so this component never learns what
     * generating a catalogue means.
     */
    actions?: React.ReactNode;
}

/**
 * Documents past this are not handed to the plugin automatically. A 484-item
 * catalogue with images runs to hundreds of megabytes, and asking the PDF
 * plugin to page one in can wedge the tab on a mid-range laptop. Past the gate
 * the user gets an explicit "render anyway" button; Download always works.
 */
const AUTO_RENDER_LIMIT = 150 * 1024 * 1024;

const formatBytes = (n: number): string => {
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

/**
 * iOS renders neither <object> nor <iframe> PDFs reliably -- Safari shows the
 * first page and stops, and in a standalone PWA it often shows nothing at all.
 * There the honest affordance is a new tab, which hands the document to the
 * system viewer.
 */
const isIOS = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const PdfPreview: React.FC<PdfPreviewProps> = ({ isOpen, onClose, docs, title, actions }) => {
    const [activeKey, setActiveKey] = useState<string>(docs[0]?.key ?? '');
    const [forceRender, setForceRender] = useState<Record<string, boolean>>({});

    // Object URLs this component created, so it can revoke exactly those and
    // never a URL the caller still owns.
    const ownedUrlsRef = useRef<Map<string, string>>(new Map());

    const resolved = useMemo(() => docs.map(doc => {
        if (doc.url) return { doc, url: doc.url, owned: false, bytes: doc.bytes ?? 0 };
        if (doc.blob) {
            const existing = ownedUrlsRef.current.get(doc.key);
            if (existing) return { doc, url: existing, owned: true, bytes: doc.blob.size };
            const created = URL.createObjectURL(doc.blob);
            ownedUrlsRef.current.set(doc.key, created);
            return { doc, url: created, owned: true, bytes: doc.blob.size };
        }
        return { doc, url: '', owned: false, bytes: doc.bytes ?? 0 };
    }), [docs]);

    // Revoke on unmount. Deliberately not keyed to `resolved` -- a URL is
    // revoked when this pane goes away, not when React re-runs the memo.
    useEffect(() => {
        const owned = ownedUrlsRef.current;
        return () => {
            owned.forEach(url => URL.revokeObjectURL(url));
            owned.clear();
        };
    }, []);

    // Keep the active tab pointing at something that exists.
    useEffect(() => {
        if (!docs.length) return;
        if (!docs.some(d => d.key === activeKey)) setActiveKey(docs[0].key);
    }, [docs, activeKey]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen || !docs.length) return null;

    const active = resolved.find(r => r.doc.key === activeKey) ?? resolved[0];
    const oversized = active.bytes > AUTO_RENDER_LIMIT && !forceRender[active.doc.key];
    const iOS = isIOS();

    const download = () => {
        if (!active.url) return;
        const a = document.createElement('a');
        a.href = active.url;
        a.download = active.doc.filename;
        a.click();
    };

    return createPortal(
        <div className="fixed inset-0 z-[6500] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200 pointer-events-auto">
            <div className="w-full max-w-6xl h-full max-h-[92vh] bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-white/10 bg-white/5 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <FileText className="text-(--main-color) shrink-0" size={20} />
                        <h3 className="text-base sm:text-lg font-black text-white tracking-wider truncate">{title}</h3>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label={tr("CLOSE")}
                        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs -- only when there is more than one document */}
                {docs.length > 1 && (
                    <div className="flex gap-1 px-3 sm:px-4 pt-3 border-b border-white/10 bg-black/40 shrink-0 overflow-x-auto">
                        {resolved.map(({ doc, bytes }) => (
                            <button
                                key={doc.key}
                                onClick={() => setActiveKey(doc.key)}
                                className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-t-lg whitespace-nowrap transition-all border-b-2 ${
                                    doc.key === activeKey
                                        ? 'bg-white/10 text-white border-(--main-color)'
                                        : 'text-white/40 hover:text-white/80 hover:bg-white/5 border-transparent'
                                }`}
                            >
                                {doc.label}
                                {doc.meta && <span className="ml-2 text-white/30 font-bold">{doc.meta}</span>}
                                {bytes > 0 && <span className="ml-2 text-white/20 font-bold tabular-nums">{formatBytes(bytes)}</span>}
                            </button>
                        ))}
                    </div>
                )}

                {/* Document */}
                <div className="flex-1 min-h-0 bg-[#1a1a1a] relative">
                    {!active.url ? (
                        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-xs font-bold uppercase tracking-widest">
                            {tr("NO DOCUMENT")}
                        </div>
                    ) : oversized ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                            <AlertTriangle className="text-amber-400" size={32} />
                            <div className="max-w-md">
                                <p className="text-white font-black uppercase tracking-widest text-xs mb-2">
                                    {tr("LARGE DOCUMENT")} — {formatBytes(active.bytes)}
                                </p>
                                <p className="text-white/50 text-xs leading-relaxed">
                                    {tr("Rendering a document this size can freeze the tab. Download works either way.")}
                                </p>
                            </div>
                            <button
                                onClick={() => setForceRender(p => ({ ...p, [active.doc.key]: true }))}
                                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2 transition-all"
                            >
                                <Eye size={12} /> {tr("RENDER ANYWAY")}
                            </button>
                        </div>
                    ) : iOS ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                            <FileText className="text-white/30" size={32} />
                            <p className="text-white/50 text-xs leading-relaxed max-w-md">
                                {tr("This browser cannot display a PDF inline. Open it in a new tab to review it.")}
                            </p>
                            <a
                                href={active.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-5 py-2.5 bg-(--main-color) text-black text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2 transition-all hover:opacity-90"
                            >
                                <ExternalLink size={12} /> {tr("OPEN IN NEW TAB")}
                            </a>
                        </div>
                    ) : (
                        /*
                         * The browser's own PDF plugin. No pdf.js, no react-pdf, no
                         * second rendering path -- what is on screen is byte-identical
                         * to what downloads, because it is the same object.
                         */
                        <object
                            key={active.url}
                            data={active.url}
                            type="application/pdf"
                            className="w-full h-full"
                            aria-label={active.doc.label}
                        >
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                                <p className="text-white/50 text-xs max-w-md leading-relaxed">
                                    {tr("This browser cannot display a PDF inline. Open it in a new tab to review it.")}
                                </p>
                                <a
                                    href={active.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-5 py-2.5 bg-(--main-color) text-black text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2"
                                >
                                    <ExternalLink size={12} /> {tr("OPEN IN NEW TAB")}
                                </a>
                            </div>
                        </object>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-white/10 bg-white/5 shrink-0">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest truncate">
                        {active.doc.filename}
                        {active.bytes > 0 && docs.length <= 1 && (
                            <span className="ml-2 text-white/20 tabular-nums">{formatBytes(active.bytes)}</span>
                        )}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                        {actions}
                        <button
                            onClick={download}
                            disabled={!active.url}
                            className="px-5 py-2.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2 hover:bg-emerald-500/30 transition-all disabled:opacity-40"
                        >
                            <Download size={12} /> {tr("DOWNLOAD")}
                        </button>
                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
};

export default PdfPreview;
