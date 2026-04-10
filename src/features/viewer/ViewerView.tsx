import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAtom } from 'jotai';
import { viewerSearchQueryAtom, exchangeRateAtom, workbookVersionAtom } from '../../lib/atoms';
import { searchArtifacts, ResolvedArtifact } from '../../lib/artifactUtils';
import { getCleanImageUrl } from '../../lib/utils';
import { OnyxLogo } from '../../components/OnyxLogo';
import {
    Maximize2, Loader2, Search, Package, X,
    ChevronLeft, ChevronRight, FileDown,
    CloudUpload, Check as CheckIcon, FileText as FileTextIcon
} from 'lucide-react';
import gsap from 'gsap';

declare global { interface Window { jspdf?: any; } }

// ── Fullscreen Image Viewer (Pinch-to-zoom & Swipe) ───────────────────────────
const FullscreenViewer: React.FC<{
    images: string[]; initialIdx: number; onClose: () => void;
}> = ({ images, initialIdx, onClose }) => {
    const [idx, setIdx] = useState(initialIdx);
    const imgRef = useRef<HTMLImageElement>(null);

    // Gestures State (use refs for performance, sync to UI via GSAP)
    const state = useRef({
        scale: 1, lastScale: 1,
        x: 0, y: 0,
        lastTranslate: { x: 0, y: 0 },
        touchStart: { x: 0, y: 0, dist: 0 },
        isZoomed: false,
        isSwiping: false,
        swipeStart: 0
    });

    const updateTransform = useCallback((animate = true) => {
        if (!imgRef.current) return;
        gsap.to(imgRef.current, {
            scale: state.current.scale,
            x: state.current.x,
            y: state.current.y,
            duration: animate ? 0.35 : 0,
            ease: 'power3.out',
            overwrite: 'auto'
        });
        state.current.isZoomed = state.current.scale > 1.05;
    }, []);

    const resetTransform = useCallback((animate = true) => {
        state.current.scale = 1;
        state.current.x = 0;
        state.current.y = 0;
        updateTransform(animate);
    }, [updateTransform]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight' && !state.current.isZoomed) handleNav(1);
            if (e.key === 'ArrowLeft'  && !state.current.isZoomed) handleNav(-1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [images.length, onClose]);

    const handleNav = (dir: number) => {
        if (state.current.isZoomed) return;
        const nextIdx = (idx + dir + images.length) % images.length;
        gsap.to(imgRef.current, {
            opacity: 0, x: -dir * 100, scale: 0.95, duration: 0.25, ease: 'power2.in',
            onComplete: () => {
                setIdx(nextIdx);
                resetTransform(false);
                gsap.fromTo(imgRef.current, 
                    { opacity: 0, x: dir * 100, scale: 0.95 },
                    { opacity: 1, x: 0, scale: 1, duration: 0.4, ease: 'power3.out' }
                );
            }
        });
    };

    const onTouchStart = (e: React.TouchEvent) => {
        const touches = e.touches;
        if (touches.length === 1) {
            state.current.touchStart.x = touches[0].clientX;
            state.current.touchStart.y = touches[0].clientY;
            state.current.lastTranslate = { x: state.current.x, y: state.current.y };
            state.current.swipeStart = touches[0].clientX;
            state.current.isSwiping = !state.current.isZoomed;
        } else if (touches.length === 2) {
            state.current.isSwiping = false;
            state.current.lastScale = state.current.scale;
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            state.current.touchStart.dist = Math.sqrt(dx * dx + dy * dy);
        }
    };

    const onTouchMove = (e: React.TouchEvent) => {
        const touches = e.touches;
        if (touches.length === 1) {
            const dx = touches[0].clientX - state.current.touchStart.x;
            const dy = touches[0].clientY - state.current.touchStart.y;
            if (state.current.isZoomed) {
                state.current.x = state.current.lastTranslate.x + dx;
                state.current.y = state.current.lastTranslate.y + dy;
                updateTransform(false);
            } else if (state.current.isSwiping) {
                gsap.set(imgRef.current, { x: dx * 0.5 });
            }
        } else if (touches.length === 2) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const scaleFactor = dist / state.current.touchStart.dist;
            state.current.scale = Math.max(1, Math.min(6, state.current.lastScale * scaleFactor));
            updateTransform(false);
        }
    };

    const onTouchEnd = (e: React.TouchEvent) => {
        if (state.current.isSwiping) {
            const dx = e.changedTouches[0].clientX - state.current.swipeStart;
            if (Math.abs(dx) > 100) handleNav(dx > 0 ? -1 : 1);
            else resetTransform();
        } else if (state.current.isZoomed) {
            const limitX = (state.current.scale - 1) * 200;
            const limitY = (state.current.scale - 1) * 250;
            state.current.x = Math.max(-limitX, Math.min(limitX, state.current.x));
            state.current.y = Math.max(-limitY, Math.min(limitY, state.current.y));
            updateTransform();
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center overflow-hidden"
            onClick={onClose}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}>
            <div className="absolute top-0 inset-x-0 flex items-center justify-between px-6 py-6 z-10 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em] mb-1">Navigation</span>
                    <span className="text-xs font-black text-white/80 tabular-nums">{idx + 1} / {images.length}</span>
                </div>
                <button onClick={onClose} className="w-12 h-12 flex items-center justify-center text-white/40 hover:text-white transition-all pointer-events-auto rounded-full bg-white/5 border border-white/10 active:scale-90">
                    <X size={20} strokeWidth={2.5} />
                </button>
            </div>
            <div className="relative w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                <img ref={imgRef} src={getCleanImageUrl(images[idx])} className="max-w-[90%] max-h-[90%] object-contain select-none shadow-2xl transition-opacity will-change-transform" style={{ borderRadius: '4px' }} draggable={false} />
            </div>
            {!state.current.isZoomed && images.length > 1 && (
                <>
                    <button onClick={e => { e.stopPropagation(); handleNav(-1); }} className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center text-white/30 hover:text-white transition-all rounded-full bg-white/5 border border-white/10 hidden sm:flex active:scale-90">
                        <ChevronLeft size={32} strokeWidth={1.5} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleNav(1); }} className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center text-white/30 hover:text-white transition-all rounded-full bg-white/5 border border-white/10 hidden sm:flex active:scale-90">
                        <ChevronRight size={32} strokeWidth={1.5} />
                    </button>
                </>
            )}
            {images.length > 1 && (
                <div className="absolute bottom-0 inset-x-0 flex gap-2.5 px-6 py-8 bg-gradient-to-t from-black/80 to-transparent overflow-x-auto no-scrollbar justify-center" onClick={e => e.stopPropagation()}>
                    {images.map((src, i) => (
                        <div key={i} onClick={() => setIdx(i)} className={`w-14 h-14 rounded-xl overflow-hidden shrink-0 cursor-pointer transition-all border-2 ${i === idx ? 'border-[#b8860b] scale-110 shadow-lg' : 'border-transparent opacity-30 hover:opacity-70'}`}>
                            <img src={getCleanImageUrl(src)} className="w-full h-full object-cover" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Dynamic Image Grid ────────────────────────────────────────────────────────
const ImageGrid: React.FC<{ images: string[]; onOpenViewer: (idx: number) => void }> = ({ images, onOpenViewer }) => {
    const total = images.length;
    const MAX_DISPLAY = 16;
    const visibleUrls = images.slice(0, MAX_DISPLAY);
    const remaining = total - MAX_DISPLAY;
    if (total === 0) return <div className="w-full aspect-square bg-black/40 flex items-center justify-center"><Package size={64} strokeWidth={0.5} className="opacity-10 text-white" /></div>;
    if (total === 1) return <div className="relative w-full aspect-square cursor-zoom-in overflow-hidden" onClick={() => onOpenViewer(0)}><img src={getCleanImageUrl(visibleUrls[0])} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" /></div>;
    if (total <= 3) {
        const cols = total === 2 ? 'grid-cols-2' : 'grid-cols-3';
        return <div className={`grid gap-px aspect-square ${cols}`}>{visibleUrls.map((url, i) => <div key={i} className="relative overflow-hidden cursor-zoom-in" onClick={() => onOpenViewer(i)}><img src={getCleanImageUrl(url)} className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" /></div>)}</div>;
    }
    const gridCols = total <= 6 ? 'grid-cols-3' : 'grid-cols-4';
    return (
        <div className={`grid gap-px aspect-square ${gridCols}`}>
            {visibleUrls.map((url, i) => (
                <div key={i} className="relative overflow-hidden aspect-square cursor-zoom-in group/img" onClick={() => onOpenViewer(i)}>
                    <img src={getCleanImageUrl(url)} className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" />
                    {i === visibleUrls.length - 1 && remaining > 0 && <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center"><div className="flex flex-col items-center"><span className="text-2xl font-black text-white">+{remaining}</span><span className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-0.5">More</span></div></div>}
                </div>
            ))}
        </div>
    );
};

// ── Viewer Card ───────────────────────────────────────────────────────────────
const ViewerCard: React.FC<{ item: ResolvedArtifact; onOpenFull: (idx: number) => void }> = ({ item, onOpenFull }) => {
    const norm = item.data; const codes = item.codes;
    const shape = norm.shape || '';
    const type = norm.shortDescription || '';
    const combinedName = (shape && type && shape !== type) ? `${shape} - ${type}` : (shape || type || 'Artifact');
    
    const color = norm.color || (norm as any).Color || '';
    const material = norm.material || (norm as any).Material || '';
    const detailStr = [color, material].filter(Boolean).join(' · ');

    const dimensionsCmStr = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×');
    const dimensionsInchStr = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean)
        .map(v => `${(Number(v) * 0.3937).toFixed(1)}"`).join('×');

    const weightKg = norm.weightKg ? `${norm.weightKg}kg` : '';
    const weightLbs = norm.weightKg ? `${(Number(norm.weightKg) * 2.2046).toFixed(1)} lbs` : '';
    return (
        <div className="group relative flex flex-col overflow-hidden cursor-pointer bg-[#070606]/60 border border-white/5 backdrop-blur-xl transition-all duration-500 hover:-translate-y-0.5 hover:shadow-2xl hover:border-[#b8860b]/20" style={{ borderRadius: '16px' }}>
            <div className="relative w-full overflow-hidden"><ImageGrid images={item.images} onOpenViewer={onOpenFull} /><div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center"><Maximize2 size={12} className="text-white/60" /></div></div></div>
            <div className="p-6 flex flex-col gap-5">
                <div className="flex justify-between items-start gap-3">
                    <div className="flex flex-col gap-2 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="px-3 py-1 rounded text-xs font-black uppercase tracking-wider shrink-0" style={{ background: vendorColor + '22', border: `1px solid ${vendorColor}44`, color: vendorColor }}>{codes.bookBarcode || '—'}</div>
                            {detailStr && (
                                <div className="px-2 py-1 rounded bg-white/5 border border-white/8 text-[9px] font-black text-white/50 uppercase tracking-widest">{detailStr}</div>
                            )}
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/8">
                                <span className="text-[8px] font-black text-white/20 uppercase">AQ</span>
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{codes.bookAqCode || '—'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/8">
                                <span className="text-[8px] font-black text-white/20 uppercase">LD</span>
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{codes.bookLandCode || '—'}</span>
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight leading-none group-hover:text-[#b8860b] transition-colors truncate">
                                {combinedName}
                            </h3>
                        </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end"><span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">QTY</span><span className="text-2xl font-black text-white/60 leading-none">{norm.quantity || 1}</span></div>
                </div>
                <div className="flex items-center justify-between py-4 border-t border-b border-white/5"><div className="flex flex-col gap-1"><span className="text-[10px] font-black text-white/20 uppercase tracking-[0.25em]">USD Retail</span><span className="text-3xl font-black text-white font-mono">{retailUsd}</span></div><div className="flex flex-col items-end gap-1"><span className="text-[10px] font-black text-white/20 uppercase tracking-[0.25em]">Images</span><span className="text-lg font-black text-white/40 font-mono">{item.images.length}</span></div></div>
                <div className="grid grid-cols-2 gap-5">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Dimensions</span>
                        <span className="text-sm font-mono font-bold text-white/50 leading-tight">
                            {dimensionsCmStr ? `${dimensionsCmStr}cm` : '—'} 
                            {dimensionsInchStr && <span className="text-[10px] text-white/20 block">({dimensionsInchStr})</span>}
                        </span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Weight</span>
                        <span className="text-sm font-mono font-bold text-white/50 leading-tight">
                            {weightKg || '—'}
                            {weightLbs && <span className="text-[10px] text-white/20 block">({weightLbs})</span>}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── PDF Helpers ───────────────────────────────────────────────────────────────
interface ImgData { dataUrl: string; w: number; h: number; }
async function loadImgData(url: string, maxSize = 900): Promise<ImgData | null> {
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image(); el.crossOrigin = 'anonymous'; el.onload = () => resolve(el); el.onerror = reject; el.src = url; setTimeout(() => reject(new Error('timeout')), 8000);
        });
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * scale); const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), w, h };
    } catch { return null; }
}
function drawContain(doc: any, img: ImgData, cx: number, cy: number, cw: number, ch: number) {
    doc.setFillColor(248, 248, 248); doc.rect(cx, cy, cw, ch, 'F');
    const ir = img.w / img.h; const cr = cw / ch;
    let dw: number, dh: number;
    if (ir > cr) { dw = cw; dh = cw / ir; } else { dh = ch; dw = ch * ir; }
    doc.addImage(img.dataUrl, 'JPEG', cx + (cw - dw) / 2, cy + (ch - dh) / 2, dw, dh);
}


const toImp = (val: any, type: 'in'|'lbs'|'ft' = 'in') => {
    const v = parseFloat(val); if (!v || isNaN(v)) return '';
    if (type === 'lbs') return (v * 2.20462).toFixed(1) + ' lbs';
    const totalInches = v * 0.393701;
    if (type === 'ft') {
        const feet = Math.floor(totalInches / 12); const inches = Math.round(totalInches % 12);
        return feet > 0 ? `${feet}' ${inches}"` : `${inches}"`;
    }
    const whole = Math.floor(totalInches); const frac = Math.round((totalInches - whole) * 4) / 4;
    let f = ''; if (frac === 0.25) f = ' 1/4'; if (frac === 0.5) f = ' 1/2'; if (frac === 0.75) f = ' 3/4';
    return `${whole}${f}"`;
};

function drawHeader(doc: any, item: ResolvedArtifact, M: number, PW: number, startY: number): number {
    const norm = item.data; const codes = item.codes; const hY = startY + 4;
    const barcode = codes.bookBardcode || codes.bookBarcode || '—';
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(130, 100, 15); doc.text(barcode, M + 4, hY);
    
    const aqld = [codes.bookAqCode, codes.bookLandCode].filter(c => c && c !== '-').join('  ·  ');
    if (aqld) { doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180); doc.text(aqld, M + 4 + doc.getTextWidth(barcode) + 4, hY); }
    
    // Shape + Type (Description)
    const shape = norm.shape || '';
    const type = norm.shortDescription || '';
    const nameStr = (shape && type && shape !== type) ? `${shape} - ${type}` : (shape || type || 'Artifact');
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 15); doc.text(nameStr.toUpperCase(), M + 4, hY + 10, { maxWidth: PW - M * 2 - 10 });
    
    // Color + Material
    const color = item.data.color || item.data.Color || '';
    const material = item.data.material || item.data.Material || '';
    const detailStr = [color, material].filter(Boolean).join(' · ');
    if (detailStr) {
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 120);
        doc.text(detailStr.toUpperCase(), M + 4, hY + 16);
    }

    doc.setDrawColor(235, 235, 235); doc.setLineWidth(0.3); doc.line(M + 4, hY + 20, PW - M, hY + 20);
    
    const specY = hY + 28;
    const retail = codes.bookRetail && codes.bookRetail !== '-' ? `$${codes.bookRetail}` : '—';
    const dimsMetric = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') + (norm.lengthCm ? 'cm' : '');
    const dimsImp = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).map(v => toImp(v, 'in')).join(' × ');
    const weightImp = toImp(norm.weightKg, 'lbs');

    const cols = [
        { label: 'USD RETAIL', value: retail, x: M + 4, accent: true },
        { label: 'QTY',        value: String(norm.quantity || 1), x: M + 38 },
        { label: 'DIMENSIONS', value: dimsMetric ? `${dimsMetric} (${dimsImp})` : '—', x: M + 54 },
        { label: 'WEIGHT',     value: norm.weightKg ? `${norm.weightKg}kg (${weightImp})` : '—', x: M + 155 }
    ];
    
    cols.forEach((col) => {
        const cx = col.x;
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(170, 170, 170); doc.text(col.label, cx, specY);
        doc.setFontSize(col.accent ? 13 : 10); doc.setFont('helvetica', 'bold'); doc.setTextColor(col.accent ? 15 : 30, col.accent ? 15 : 30, col.accent ? 15 : 30); doc.text(col.value, cx, specY + 8);
    });

    
    doc.setDrawColor(235, 235, 235); doc.line(M + 4, specY + 14, PW - M, specY + 14);
    return specY + 20;
}
function drawHeaderCompact(doc: any, item: ResolvedArtifact, M: number, PW: number, startY: number, pageNum: number, totalPages: number): number {

    const hY = startY + 4;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180);
    doc.text(`${item.codes.bookBardcode || item.codes.bookBarcode || '—'}  \xb7  PAGE ${pageNum} OF ${totalPages}`, M + 4, hY);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
    doc.text((item.data.shortDescription || item.data.shape || 'Stone Piece').toUpperCase(), M + 4, hY + 6);
    doc.setDrawColor(245, 245, 245); doc.setLineWidth(0.2); doc.line(M + 4, hY + 9, PW - M, hY + 9);
    return hY + 12;
}
async function exportCatalogPdf(results: ResolvedArtifact[], onProgress?: (p: number, s: string) => void) {
    onProgress?.(0, 'Initializing Engine...');
    if (!(window as any).jspdf) {
        onProgress?.(2, 'Downloading dependencies...');
        await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = () => resolve(); s.onerror = () => reject(new Error('jsPDF load failed')); document.head.appendChild(s);
        });
    }
    onProgress?.(5, 'Preparing Catalog...');
    const { jsPDF } = (window as any).jspdf; const PW = 210, PH = 297, M = 12;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, PH, 'F'); doc.setFillColor(20, 20, 20); doc.rect(0, 0, 4, PH, 'F');
    doc.setFontSize(48); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 15); doc.text('Art of Decor', M + 4, 88);
    doc.setFontSize(20); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 100, 15); doc.text('Catalog', M + 4, 102);
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(M + 4, 110, PW - M, 110);
    doc.setFontSize(9); doc.setTextColor(160, 160, 160); doc.text(`${results.length} Items  \u00b7  ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, M + 4, 118);
    
    const simple = results.filter(r => r.images.length <= 2);
    const rich = results.filter(r => r.images.length > 2);
    let globalPageNum = 0;
    const footer = (doc: any) => { 
        globalPageNum++; 
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 200, 200); 
        doc.text('Art of Decor', M + 4, PH - 8); 
        doc.text(String(globalPageNum), PW - M, PH - 8, { align: 'right' }); 
    };
    
    const HW = (PW - M * 2 - 4) / 2; const HG = 4;
    const totalItems = results.length;
    let processedCount = 0;

    for (let i = 0; i < simple.length; i += 2) {
        doc.addPage(); doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, PH, 'F'); doc.setFillColor(20, 20, 20); doc.rect(0, 0, 4, PH, 'F'); footer(doc);
        doc.setDrawColor(240, 240, 240); doc.setLineWidth(0.2); doc.line(M + HW + HG / 2, M, M + HW + HG / 2, PH - M);
        for (let slot = 0; slot < 2; slot++) {
            const item = simple[i + slot]; if (!item) break;
            processedCount++;
            onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
            const norm = item.data; const codes = item.codes; const sx = M + slot * (HW + HG);
            doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(130, 100, 15); doc.text(codes.bookBardcode || codes.bookBarcode || '—', sx + 2, M + 6);
            const shape = norm.shape || '';
            const desc = norm.shortDescription || '';
            const nameStr = (shape && desc && shape !== desc) ? `${shape} - ${desc}` : (shape || desc || 'Stone Piece');
            doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 15); doc.text(nameStr.toUpperCase(), sx + 2, M + 13, { maxWidth: HW - 4 });
            
            const color = item.data.color || item.data.Color || '';
            const material = item.data.material || item.data.Material || '';
            const detailStr = [color, material].filter(Boolean).join(' · ');
            if (detailStr) {
                doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 120);
                doc.text(detailStr.toUpperCase(), sx + 2, M + 18);
            }

            doc.setDrawColor(235, 235, 235); doc.setLineWidth(0.2); doc.line(sx + 2, M + 21, sx + HW - 2, M + 21);
            
            doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(170, 170, 170); doc.text('USD RETAIL', sx + 2, M + 25);
            doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 15); doc.text(codes.bookRetail && codes.bookRetail !== '-' ? `$${codes.bookRetail} USD` : '—', sx + 2, M + 31);
            
            doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
            const dimsM = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×');
            const dimsI = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).map(v => toImp(v, 'in')).join(' × ');
            if (dimsM) doc.text(`${dimsM}cm (${dimsI})`, sx + 2, M + 36);
            if (norm.weightKg) doc.text(`${norm.weightKg}kg (${toImp(norm.weightKg, 'lbs')})`, sx + 2, M + 41);

            const imgTop = M + 44; const imgH = PH - imgTop - 14; const imgW = HW - 4; const imgs = item.images;
            if (imgs.length === 0) { doc.setFillColor(248, 248, 248); doc.rect(sx + 2, imgTop, imgW, imgH, 'F'); }
            else if (imgs.length === 1) { const d = await loadImgData(getCleanImageUrl(imgs[0])); if (d) drawContain(doc, d, sx + 2, imgTop, imgW, imgH); else { doc.setFillColor(248, 248, 248); doc.rect(sx + 2, imgTop, imgW, imgH, 'F'); } }
            else { const cellH = (imgH - 2) / 2; for (let j = 0; j < 2; j++) { const cy = imgTop + j * (cellH + 2); const d = await loadImgData(getCleanImageUrl(imgs[j])); if (d) drawContain(doc, d, sx + 2, cy, imgW, cellH); else { doc.setFillColor(248, 248, 248); doc.rect(sx + 2, cy, imgW, cellH, 'F'); } } }
        }
    }
    
    for (let i = 0; i < rich.length; i++) {
        const item = rich[i]; const imgs = item.images; const n = imgs.length;
        processedCount++;
        onProgress?.(Math.round(5 + (processedCount / totalItems) * 85), `Processing Item ${processedCount}/${totalItems}...`);
        const CHUNK = 12; // 4 columns x 3 rows
        const totalPagesForItem = Math.ceil(n / CHUNK);
        
        for (let p = 0; p < totalPagesForItem; p++) {
            doc.addPage(); doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, PH, 'F'); doc.setFillColor(20, 20, 20); doc.rect(0, 0, 4, PH, 'F'); footer(doc);
            
            let imgTop = 0;
            if (p === 0) {
                imgTop = drawHeader(doc, item, M, PW, M);
            } else {
                imgTop = drawHeaderCompact(doc, item, M, PW, M, p + 1, totalPagesForItem);
            }
            
            const imgH = PH - imgTop - 14; const imgW = PW - M * 2 - 4;
            const currentChunk = imgs.slice(p * CHUNK, (p + 1) * CHUNK);
            const numInChunk = currentChunk.length;
            
            let cols = 2, rows = 1;
            if (numInChunk <= 4) { cols = 2; rows = Math.ceil(numInChunk / 2); }
            else if (numInChunk <= 6) { cols = 3; rows = 2; }
            else if (numInChunk <= 9) { cols = 3; rows = 3; }
            else { cols = 4; rows = 3; }
            
            const GAP = 2; 
            const cellW = (imgW - GAP * (cols - 1)) / cols; 
            const cellH = (imgH - GAP * (rows - 1)) / rows;
            
            for (let j = 0; j < numInChunk; j++) {
                const cx = M + 4 + (j % cols) * (cellW + GAP);
                const cy = imgTop + Math.floor(j / cols) * (cellH + GAP);
                const d = await loadImgData(getCleanImageUrl(currentChunk[j]));
                if (d) drawContain(doc, d, cx, cy, cellW, cellH);
                else { doc.setFillColor(248, 248, 248); doc.rect(cx, cy, cellW, cellH, 'F'); }
            }
        }
    }
    onProgress?.(95, 'Finalizing Catalogue...');
    doc.save(`ArtOfDecor_Catalog_${new Date().toISOString().slice(0, 10)}.pdf`);
    onProgress?.(100, 'Catalogue Downloaded');
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
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState('');
    const [viewerItem, setViewerItem] = useState<ResolvedArtifact | null>(null);
    const [viewerIdx, setViewerIdx] = useState(0);

    const performSearch = useCallback(async (q: string) => {
        if (!q.trim()) { setResults([]); setIsInitial(true); return; }
        setIsInitial(false); setLoading(true);
        try {
            const results = await searchArtifacts(q, { exchangeRate, workbookPrefix: wbPrefix });
            setResults(results);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [exchangeRate, wbPrefix]);

    useEffect(() => { if (query) performSearch(query); }, []);

    const handleExportPdf = async () => {
        if (!results.length || exporting) return;
        setExporting(true); 
        setExportProgress(0);
        setExportStatus('Starting Export...');
        try { 
            await exportCatalogPdf(results, (p, s) => {
                setExportProgress(p);
                setExportStatus(s);
            }); 
            // Briefly show 100% before closing
            setTimeout(() => setExporting(false), 800);
        } catch (e) { 
            console.error('PDF export failed:', e); 
            setExporting(false);
        }
    };


    return (
        <div className="h-full flex flex-col bg-[#050505] text-white selection:bg-white/20 overflow-hidden relative font-sans">
            {viewerItem && <FullscreenViewer images={viewerItem.images} initialIdx={viewerIdx} onClose={() => setViewerItem(null)} />}
            <div className={`shrink-0 transition-all duration-700 ${isInitial && results.length === 0 ? 'h-full flex flex-col items-center justify-center' : 'pt-10 pb-6'}`}>
                <div className="max-w-4xl mx-auto w-full px-6 flex flex-col gap-10">
                    {isInitial && results.length === 0 && <div className="flex flex-col items-center gap-8"><OnyxLogo width={56} height={56} className="opacity-80 hover:opacity-100 transition-opacity" /></div>}
                    <div className="relative group max-w-2xl mx-auto w-full">
                        <div className="absolute inset-y-0 left-7 flex items-center pointer-events-none text-white/10 group-focus-within:text-[#b8860b]/50 transition-colors"><Search size={22} strokeWidth={2.5} /></div>
                        <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') performSearch(query); }} placeholder="INPUT BARCODES..." className={`w-full transition-all duration-700 bg-white/[0.02] border border-white/8 rounded-full font-black uppercase tracking-tight placeholder:text-white/10 focus:border-[#b8860b]/20 focus:bg-white/5 outline-none ${isInitial && results.length === 0 ? 'h-20 sm:h-28 px-20 text-lg sm:text-2xl' : 'h-14 px-14 text-sm sm:text-base'}`} />
                        {loading && <div className="absolute inset-y-0 right-8 flex items-center"><Loader2 size={20} className="animate-spin text-[#b8860b]/40" /></div>}
                    </div>
                </div>
            </div>
            {!isInitial && (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-8 pb-32">
                        {results.length > 0 ? (
                            <>
                                <div className="flex items-center justify-between mb-8"><span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">{results.length} Artifact{results.length !== 1 ? 's' : ''}</span><button onClick={handleExportPdf} className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#b8860b]/10 border border-[#b8860b]/20 text-[#b8860b] text-xs font-black uppercase tracking-[0.2em] hover:bg-[#b8860b]/20 transition-all shadow-lg active:scale-95"><FileDown size={20} />Export PDF Catalog</button></div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                                    {results.map((item, idx) => {
                                        const n = item.images.length;
                                        return <div key={`${item.data.id}-${idx}`} className={n >= 12 ? 'col-span-full' : n >= 4 ? 'sm:col-span-2' : ''} style={{ animation: `fadeUp 0.5s ease ${idx * 60}ms both` }}><ViewerCard item={item} onOpenFull={(imgIdx) => { setViewerItem(item); setViewerIdx(imgIdx); }} /></div>;
                                    })}
                                </div>
                            </>
                        ) : !loading && <div className="flex flex-col items-center justify-center py-40 gap-6 opacity-20"><Package size={72} strokeWidth={0.5} /><p className="text-sm font-black uppercase tracking-[0.3em]">No Artifacts Found</p></div>}
                    </div>
                </div>
            )}
            
            {exporting && createPortal(
                <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-300 pointer-events-auto">
                    <div className="w-[360px] p-10 rounded-[48px] bg-white/3 border border-white/10 flex flex-col items-center gap-8 shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-b from-[#b8860b]/5 to-transparent opacity-50" />
                        
                        <div className="relative">
                            <div className="w-20 h-20 rounded-3xl bg-[#b8860b]/10 flex items-center justify-center border border-[#b8860b]/20 animate-pulse">
                                <CloudUpload size={40} className="text-[#b8860b]" />
                            </div>
                            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center border-4 border-[#050505] transition-all duration-500" style={{ transform: exportProgress === 100 ? 'scale(1)' : 'scale(0)' }}>
                                <CheckIcon size={14} className="text-white font-bold" />
                            </div>
                        </div>

                        <div className="w-full space-y-4 relative">
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">PDF Exporting</span>
                                <span className="text-sm font-mono font-black text-[#b8860b]">{exportProgress}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                <div 
                                    className="h-full bg-gradient-to-r from-[#b8860b]/50 to-[#b8860b] transition-all duration-500 ease-out"
                                    style={{ width: `${exportProgress}%` }}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] animate-pulse text-center">
                                {exportStatus}
                            </p>
                            {exportProgress === 100 && (
                                <p className="text-[9px] font-bold text-green-500/60 uppercase tracking-widest text-center">
                                    Ready for download
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            , document.body)}

            <style dangerouslySetInnerHTML={{ __html: `
                :root { color-scheme: dark; }
                @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fadeUp  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 10px; }
                .no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </div>
    );
};
