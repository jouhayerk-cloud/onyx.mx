import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAtom } from 'jotai';
import { viewerSearchQueryAtom, exchangeRateAtom, workbookVersionAtom } from '../../lib/atoms';
import { resolveArtifact, ResolvedArtifact } from '../../lib/artifactUtils';
import { getCleanImageUrl, formatDimensionsImperial, formatWeightImperial } from '../../lib/utils';
import { OnyxLogo } from '../../components/OnyxLogo';
import {
    Maximize2, Loader2, Search, Package, X,
    ChevronLeft, ChevronRight, FileDown
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
declare global {
    interface Window {
        jspdf?: any;
    }
}

// ── Fullscreen Image Viewer ───────────────────────────────────────────────────
const FullscreenViewer: React.FC<{
    images: string[];
    initialIdx: number;
    onClose: () => void;
}> = ({ images, initialIdx, onClose }) => {
    const [idx, setIdx] = useState(initialIdx);
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') setIdx(p => (p + 1) % images.length);
            if (e.key === 'ArrowLeft') setIdx(p => (p - 1 + images.length) % images.length);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [images.length, onClose]);

    return (
        <div
            className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-2xl flex flex-col"
            onClick={onClose}
            onTouchStart={e => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); }}
            onTouchMove={e => setTouchEnd(e.targetTouches[0].clientX)}
            onTouchEnd={() => {
                if (!touchStart || !touchEnd) return;
                const d = touchStart - touchEnd;
                if (d > 50) setIdx(p => (p + 1) % images.length);
                if (d < -50) setIdx(p => (p - 1 + images.length) % images.length);
            }}
        >
            {/* Top bar */}
            <div className="absolute top-0 inset-x-0 flex items-center justify-between px-6 py-4 z-10 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
                    {idx + 1} / {images.length}
                </span>
                <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white transition-all pointer-events-auto active:scale-95 rounded-full bg-white/5 border border-white/10">
                    <X size={18} strokeWidth={2} />
                </button>
            </div>

            {/* Main image */}
            <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
                <img
                    key={idx}
                    src={getCleanImageUrl(images[idx])}
                    className="max-w-full max-h-full object-contain select-none"
                    style={{ animation: 'fadeIn 0.3s ease' }}
                    draggable={false}
                />
            </div>

            {/* Nav arrows */}
            {images.length > 1 && (
                <>
                    <button onClick={e => { e.stopPropagation(); setIdx(p => (p - 1 + images.length) % images.length); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white/30 hover:text-white transition-all rounded-full bg-white/5 border border-white/10 hidden sm:flex">
                        <ChevronLeft size={24} strokeWidth={1.5} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setIdx(p => (p + 1) % images.length); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white/30 hover:text-white transition-all rounded-full bg-white/5 border border-white/10 hidden sm:flex">
                        <ChevronRight size={24} strokeWidth={1.5} />
                    </button>
                </>
            )}

            {/* Thumbnail strip */}
            {images.length > 1 && (
                <div className="flex gap-1.5 px-6 py-4 bg-gradient-to-t from-black/60 to-transparent overflow-x-auto no-scrollbar" onClick={e => e.stopPropagation()}>
                    {images.map((src, i) => (
                        <div key={i} onClick={() => setIdx(i)}
                            className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 cursor-pointer transition-all border-2 ${i === idx ? 'border-white scale-110' : 'border-transparent opacity-40 hover:opacity-80'}`}>
                            <img src={getCleanImageUrl(src)} className="w-full h-full object-cover" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Dynamic Image Grid (Inventory Gallery Layout) ─────────────────────────────
const ImageGrid: React.FC<{ images: string[]; onOpenViewer: (idx: number) => void }> = ({ images, onOpenViewer }) => {
    const total = images.length;
    const MAX_DISPLAY = 16;
    const visibleUrls = images.slice(0, MAX_DISPLAY);
    const remaining = total - MAX_DISPLAY;

    if (total === 0) return (
        <div className="w-full aspect-square bg-black/40 flex items-center justify-center">
            <Package size={64} strokeWidth={0.5} className="opacity-10 text-white" />
        </div>
    );

    if (total === 1) return (
        <div className="relative w-full aspect-square cursor-zoom-in overflow-hidden" onClick={() => onOpenViewer(0)}>
            <img src={getCleanImageUrl(visibleUrls[0])} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
        </div>
    );

    if (total <= 3) {
        const cols = total === 2 ? 'grid-cols-2' : 'grid-cols-3';
        return (
            <div className={`grid gap-px aspect-square ${cols}`}>
                {visibleUrls.map((url, i) => (
                    <div key={i} className="relative overflow-hidden cursor-zoom-in" onClick={() => onOpenViewer(i)}>
                        <img src={getCleanImageUrl(url)} className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" />
                    </div>
                ))}
            </div>
        );
    }

    const gridCols = total <= 6 ? 'grid-cols-3' : 'grid-cols-4';

    return (
        <div className={`grid gap-px aspect-square ${gridCols}`}>
            {visibleUrls.map((url, i) => (
                <div key={i} className="relative overflow-hidden aspect-square cursor-zoom-in group/img" onClick={() => onOpenViewer(i)}>
                    <img src={getCleanImageUrl(url)} className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" />
                    {i === visibleUrls.length - 1 && remaining > 0 && (
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
                            <div className="flex flex-col items-center">
                                <span className="text-2xl font-black text-white">+{remaining}</span>
                                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-0.5">More</span>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// ── Viewer Card (Inventory Gallery Aesthetic) ─────────────────────────────────
const ViewerCard: React.FC<{
    item: ResolvedArtifact;
    onOpenFull: (idx: number) => void;
}> = ({ item, onOpenFull }) => {
    const norm = item.data;
    const codes = item.codes;
    const vendorPrefix = (codes.bookBardcode || codes.bookBarcode || '').substring(0, 2).toUpperCase();
    const vendorColor = (codes as any).vendorColor || '#b8860b';

    // USD Retail: costMXN * 1.4 (landed) * 12 (retail markup) / exchangeRate
    const retailUsd = codes.bookRetail && codes.bookRetail !== '-' ? `$${codes.bookRetail}` : '—';

    const typeLabel = norm.shape || norm.shortDescription || 'Artifact';
    const itemName = norm.shortDescription || norm.shape || 'Stone Piece';
    const dimensionsCmStr = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×');
    const dimensionsInchStr = [norm.lengthCm, norm.widthCm, norm.heightCm]
        .filter(Boolean)
        .map(v => `${(Number(v) * 0.3937).toFixed(1)}"`)
        .join('×');
    const weightKg = norm.weightKg ? `${norm.weightKg}kg` : '';
    const weightLbs = norm.weightKg ? `${(Number(norm.weightKg) * 2.2046).toFixed(1)} lbs` : '';

    return (
        <div className="group relative flex flex-col overflow-hidden cursor-pointer bg-[#070606]/60 border border-white/5 backdrop-blur-xl transition-all duration-500 hover:-translate-y-0.5 hover:shadow-2xl hover:border-[#b8860b]/20"
            style={{ borderRadius: '16px' }}>

            {/* Image Grid */}
            <div className="relative w-full overflow-hidden">
                <ImageGrid images={item.images} onOpenViewer={onOpenFull} />
                {/* Expand hint */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                        <Maximize2 size={12} className="text-white/60" />
                    </div>
                </div>
            </div>

            {/* Metadata */}
            <div className="p-6 flex flex-col gap-5">
                {/* Header row */}
                <div className="flex justify-between items-start gap-3">
                    <div className="flex flex-col gap-2 min-w-0 flex-1">
                        {/* Barcodes */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="px-3 py-1 rounded text-xs font-black uppercase tracking-wider shrink-0"
                                style={{ background: vendorColor + '22', border: `1px solid ${vendorColor}44`, color: vendorColor }}>
                                {codes.bookBardcode || codes.bookBarcode || '—'}
                            </div>
                            <div className="px-2 py-1 rounded bg-white/5 border border-white/8 text-[10px] font-black text-white/30 uppercase tracking-widest">{codes.bookAqCode || '—'}</div>
                            <div className="px-2 py-1 rounded bg-white/5 border border-white/8 text-[10px] font-black text-white/30 uppercase tracking-widest">{codes.bookLandCode || '—'}</div>
                        </div>
                        {/* Name + shape */}
                        <div className="flex items-baseline gap-2 mt-1">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight leading-none group-hover:text-[#b8860b] transition-colors truncate">
                                {itemName}
                            </h3>
                            <span className="text-xs font-black text-white/20 uppercase tracking-[0.2em] shrink-0">{typeLabel !== itemName ? typeLabel : ''}</span>
                        </div>
                    </div>
                    {/* QTY */}
                    <div className="shrink-0 flex flex-col items-end">
                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">QTY</span>
                        <span className="text-2xl font-black text-white/60 leading-none">{norm.quantity || 1}</span>
                    </div>
                </div>

                {/* USD Retail Price */}
                <div className="flex items-center justify-between py-4 border-t border-b border-white/5">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.25em]">USD Retail</span>
                        <span className="text-3xl font-black text-white font-mono">{retailUsd}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.25em]">Images</span>
                        <span className="text-lg font-black text-white/40 font-mono">{item.images.length}</span>
                    </div>
                </div>

                {/* Specs */}
                <div className="grid grid-cols-2 gap-5">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Dimensions</span>
                        <span className="text-sm font-mono font-bold text-white/50 leading-tight">
                            {dimensionsCmStr ? `${dimensionsCmStr}cm` : '—'}
                        </span>
                        {dimensionsInchStr && (
                            <span className="text-xs text-white/20">{dimensionsInchStr}</span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Weight</span>
                        <span className="text-sm font-mono font-bold text-white/50 leading-tight">{weightKg || '—'}</span>
                        {weightLbs && <span className="text-xs text-white/20">{weightLbs}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
};


// ── Helpers ───────────────────────────────────────────────────────────────────
async function loadImgToDataUrl(url: string, size = 512): Promise<string | null> {
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.crossOrigin = 'anonymous';
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = url;
            setTimeout(() => reject(new Error('timeout')), 6000);
        });
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(0, 0, size, size);
        const scale = Math.min(size / img.width, size / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
        return canvas.toDataURL('image/jpeg', 0.85);
    } catch {
        return null;
    }
}

// ── PDF Export — White Catalog Layout ─────────────────────────────────────────
async function exportCatalogPdf(results: ResolvedArtifact[]) {
    if (!(window as any).jspdf) {
        await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load jsPDF'));
            document.head.appendChild(script);
        });
    }

    const { jsPDF } = (window as any).jspdf;
    const PAGE_W = 210;
    const PAGE_H = 297;
    const M = 14;  // margin

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // ── Cover Page ────────────────────────────────────────────────────────────
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

    // Left accent bar
    doc.setFillColor(20, 20, 20);
    doc.rect(0, 0, 4, PAGE_H, 'F');

    doc.setFontSize(52);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 15, 15);
    doc.text('ONYX', M + 4, 90);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140, 140, 140);
    doc.text('ARTIFACT CATALOG', M + 4, 102);

    // Thin separator
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(M + 4, 110, PAGE_W - M, 110);

    doc.setFontSize(9);
    doc.setTextColor(160, 160, 160);
    doc.text(`${results.length} Items  ·  ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, M + 4, 118);

    // ── Item Pages (1 item per page) ──────────────────────────────────────────
    for (let i = 0; i < results.length; i++) {
        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

        const item = results[i];
        const norm = item.data;
        const codes = item.codes;

        // Left accent bar (thin)
        doc.setFillColor(20, 20, 20);
        doc.rect(0, 0, 4, PAGE_H, 'F');

        // Page number footer
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(200, 200, 200);
        doc.text(`${i + 1} / ${results.length}`, PAGE_W - M, PAGE_H - 8, { align: 'right' });
        doc.text('ONYX.MX', M + 4, PAGE_H - 8);

        // ── Header ───────────────────────────────────────────────────────────
        const hY = 18;

        // Barcode badge
        const barcode = codes.bookBardcode || codes.bookBarcode || '—';
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(130, 100, 15);
        doc.text(barcode, M + 4, hY);

        // AQ / LD codes
        const aqld = [codes.bookAqCode, codes.bookLandCode].filter(c => c && c !== '-').join('  ·  ');
        if (aqld) {
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(180, 180, 180);
            doc.text(aqld, M + 4 + doc.getTextWidth(barcode) + 4, hY);
        }

        // Item Name
        const itemName = (norm.shortDescription || norm.shape || 'Stone Piece').toUpperCase();
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 15, 15);
        doc.text(itemName, M + 4, hY + 10, { maxWidth: PAGE_W - M * 2 - 10 });

        // Separator
        doc.setDrawColor(235, 235, 235);
        doc.setLineWidth(0.3);
        doc.line(M + 4, hY + 15, PAGE_W - M, hY + 15);

        // ── Specs Row ─────────────────────────────────────────────────────────
        const specY = hY + 22;
        const specCols = [
            { label: 'USD RETAIL', value: codes.bookRetail && codes.bookRetail !== '-' ? `$${codes.bookRetail}` : '—', accent: true },
            { label: 'QTY', value: String(norm.quantity || 1) },
            { label: 'DIMENSIONS', value: [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') + (norm.lengthCm ? 'cm' : '') || '—' },
            { label: 'WEIGHT', value: norm.weightKg ? `${norm.weightKg} kg` : '—' },
        ];

        const colW = (PAGE_W - M * 2 - 4) / specCols.length;
        specCols.forEach((col, ci) => {
            const cx = M + 4 + ci * colW;
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(170, 170, 170);
            doc.text(col.label, cx, specY);

            doc.setFontSize(col.accent ? 13 : 10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(col.accent ? 15 : 30, col.accent ? 15 : 30, col.accent ? 15 : 30);
            doc.text(col.value, cx, specY + 8);
        });

        // Separator
        doc.setDrawColor(235, 235, 235);
        doc.line(M + 4, specY + 13, PAGE_W - M, specY + 13);

        // ── Image Grid ───────────────────────────────────────────────────────
        const imgAreaY = specY + 17;
        const imgAreaH = PAGE_H - imgAreaY - 18; // leave footer space
        const imgAreaW = PAGE_W - M * 2 - 4;

        const images = item.images;
        const n = images.length;

        if (n === 0) {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(200, 200, 200);
            doc.text('No images', M + 4 + imgAreaW / 2, imgAreaY + imgAreaH / 2, { align: 'center' });
        } else {
            // Determine grid columns and rows
            let cols: number, rows: number;
            if (n === 1)       { cols = 1; rows = 1; }
            else if (n <= 2)   { cols = 2; rows = 1; }
            else if (n <= 4)   { cols = 2; rows = 2; }
            else if (n <= 6)   { cols = 3; rows = 2; }
            else if (n <= 9)   { cols = 3; rows = 3; }
            else if (n <= 12)  { cols = 4; rows = 3; }
            else               { cols = 4; rows = 4; }

            const GAP = 2;
            const cellW = (imgAreaW - GAP * (cols - 1)) / cols;
            const cellH = (imgAreaH - GAP * (rows - 1)) / rows;

            const displayCount = Math.min(n, cols * rows);

            for (let j = 0; j < displayCount; j++) {
                const col = j % cols;
                const row = Math.floor(j / cols);
                const cx = M + 4 + col * (cellW + GAP);
                const cy = imgAreaY + row * (cellH + GAP);

                // Cell background
                doc.setFillColor(248, 248, 248);
                doc.rect(cx, cy, cellW, cellH, 'F');

                // Load and draw image
                const dataUrl = await loadImgToDataUrl(getCleanImageUrl(images[j]), 512);
                if (dataUrl) {
                    doc.addImage(dataUrl, 'JPEG', cx, cy, cellW, cellH);
                }

                // Overflow overlay on last cell
                if (j === displayCount - 1 && n > displayCount) {
                    const remaining = n - displayCount;
                    doc.setFillColor(0, 0, 0);
                    // semi-transparent overlay via a rect with low opacity isn't natively supported in jsPDF,
                    // so draw a solid overlay
                    doc.setFillColor(20, 20, 20);
                    doc.rect(cx, cy, cellW, cellH, 'F');
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(255, 255, 255);
                    doc.text(`+${remaining}`, cx + cellW / 2, cy + cellH / 2 + 2, { align: 'center' });
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(180, 180, 180);
                    doc.text('MORE', cx + cellW / 2, cy + cellH / 2 + 7, { align: 'center' });
                }
            }
        }
    }

    doc.save(`Onyx_Catalog_${new Date().toISOString().slice(0, 10)}.pdf`);
}


// ── Main Viewer Module ────────────────────────────────────────────────────────

export const ViewerView: React.FC<{ onOpenArtifact?: (id: string) => void }> = ({ onOpenArtifact }) => {
    const [query, setQuery] = useAtom(viewerSearchQueryAtom);
    const [exchangeRate] = useAtom(exchangeRateAtom);
    const [wbPrefix] = useAtom(workbookVersionAtom);

    const [results, setResults] = useState<ResolvedArtifact[]>([]);
    const [loading, setLoading] = useState(false);
    const [isInitial, setIsInitial] = useState(true);
    const [exporting, setExporting] = useState(false);

    // Fullscreen viewer state
    const [viewerItem, setViewerItem] = useState<ResolvedArtifact | null>(null);
    const [viewerIdx, setViewerIdx] = useState(0);

    const performSearch = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            setIsInitial(true);
            return;
        }
        setIsInitial(false);
        setLoading(true);
        const ids = searchQuery.split(/\s+/).filter(Boolean);
        try {
            const resolved = await Promise.all(
                ids.map(id => resolveArtifact(id, { exchangeRate, workbookPrefix: wbPrefix }))
            );
            setResults(resolved.filter((item): item is ResolvedArtifact => item !== null));
        } catch (err) {
            console.error('Batch search error:', err);
        } finally {
            setLoading(false);
        }
    }, [exchangeRate, wbPrefix]);

    useEffect(() => {
        if (query) performSearch(query);
    }, []);

    const handleExportPdf = async () => {
        if (results.length === 0 || exporting) return;
        setExporting(true);
        try {
            await exportCatalogPdf(results);
        } catch (e) {
            console.error('PDF export failed:', e);
        } finally {
            setExporting(false);
        }
    };

    const showResults = !isInitial;

    return (
        <div className="h-full flex flex-col bg-[#050505] text-white selection:bg-white/20 overflow-hidden relative font-sans">

            {/* Fullscreen Viewer Overlay */}
            {viewerItem && (
                <FullscreenViewer
                    images={viewerItem.images}
                    initialIdx={viewerIdx}
                    onClose={() => setViewerItem(null)}
                />
            )}

            {/* Header / Search */}
            <div className={`shrink-0 transition-all duration-700 ${isInitial && results.length === 0 ? 'h-full flex flex-col items-center justify-center' : 'pt-10 pb-6'}`}>
                <div className="max-w-4xl mx-auto w-full px-6 flex flex-col gap-10">
                    {/* Splash */}
                    {isInitial && results.length === 0 && (
                        <div className="flex flex-col items-center gap-8">
                            <OnyxLogo width={56} height={56} className="opacity-80 hover:opacity-100 transition-opacity" />
                        </div>
                    )}

                    {/* Search bar */}
                    <div className="relative group max-w-2xl mx-auto w-full">
                        <div className="absolute inset-y-0 left-7 flex items-center pointer-events-none text-white/10 group-focus-within:text-[#b8860b]/50 transition-colors">
                            <Search size={22} strokeWidth={2.5} />
                        </div>
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') performSearch(query); }}
                            placeholder="INPUT BARCODES..."
                            className={`w-full transition-all duration-700 bg-white/[0.02] border border-white/8 rounded-full font-black uppercase tracking-tight placeholder:text-white/10 focus:border-[#b8860b]/20 focus:bg-white/5 outline-none ${
                                isInitial && results.length === 0
                                    ? 'h-20 sm:h-28 px-20 text-lg sm:text-2xl'
                                    : 'h-14 px-14 text-sm sm:text-base'
                            }`}
                        />
                        {loading && (
                            <div className="absolute inset-y-0 right-8 flex items-center">
                                <Loader2 size={20} className="animate-spin text-[#b8860b]/40" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Results */}
            {showResults && (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-8 pb-32">
                        {results.length > 0 ? (
                            <>
                                {/* Toolbar */}
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
                                            {results.length} Artifact{results.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    {/* Export PDF Button */}
                                    <button
                                        onClick={handleExportPdf}
                                        disabled={exporting}
                                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#b8860b]/10 border border-[#b8860b]/20 text-[#b8860b] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#b8860b]/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {exporting ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <FileDown size={12} />
                                        )}
                                        {exporting ? 'Generating...' : 'Export PDF Catalog'}
                                    </button>
                                </div>

                                {/* Gallery Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                                    {results.map((item, idx) => {
                                        const mediaCount = item.images.length;
                                        const spanFull = mediaCount >= 12;
                                        const spanTwo = mediaCount >= 4 && mediaCount < 12;

                                        return (
                                            <div
                                                key={`${item.data.id}-${idx}`}
                                                className={`${spanFull ? 'col-span-full' : spanTwo ? 'sm:col-span-2' : ''}`}
                                                style={{ animation: `fadeUp 0.5s ease ${idx * 60}ms both` }}
                                            >
                                                <ViewerCard
                                                    item={item}
                                                    onOpenFull={(imgIdx) => {
                                                        setViewerItem(item);
                                                        setViewerIdx(imgIdx);
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        ) : !loading && (
                            <div className="flex flex-col items-center justify-center py-40 gap-6 opacity-20">
                                <Package size={72} strokeWidth={0.5} />
                                <div className="flex flex-col items-center gap-2">
                                    <p className="text-sm font-black uppercase tracking-[0.3em]">No Artifacts Found</p>
                                    <p className="text-[10px] font-medium uppercase tracking-widest text-white/60">Check barcodes and retry</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                :root { color-scheme: dark; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 10px; }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
};
