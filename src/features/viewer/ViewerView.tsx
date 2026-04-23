import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAtom } from 'jotai';
import { viewerSearchQueryAtom, exchangeRateAtom, workbookVersionAtom } from '../../lib/atoms';
import { searchArtifacts, ResolvedArtifact } from '../../lib/artifactUtils';
import { getCleanImageUrl, cmToImperial, formatWeightImperialOnly } from '../../lib/utils';
import { exportCatalogPdf } from '../../lib/pdfExport';
import { OnyxLogo } from '../../components/OnyxLogo';
import {
    Maximize2, Loader2, Search, Package, X,
    ChevronLeft, ChevronRight, FileDown, LayoutGrid,
    CloudUpload, Check as CheckIcon, FileText as FileTextIcon,
    QrCode, Smartphone, Trash2, CheckCircle2
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import gsap from 'gsap';
import { jsPDF } from 'jspdf';
import toast from 'react-hot-toast';

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
    const vendorColor = (codes as any).vendorColor || '#b8860b';
    const retailUsd = codes.bookRetail && codes.bookRetail !== '-' ? `$${codes.bookRetail}` : '—';
    const shape = norm.shape || '';
    const type = norm.shortDescription || '';
    const combinedName = (shape && type && shape !== type) ? `${shape} - ${type}` : (shape || type || 'Artifact');
    
    const color = norm.color || (norm as any).Color || '';
    const material = norm.material || (norm as any).Material || '';
    const detailStr = [color, material].filter(Boolean).join(' · ');

    const dimensionsCmStr = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×');
    const dimensionsInchStr = [norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean)
        .map(v => cmToImperial(v)).join('×');

    const weightKg = norm.weightKg ? `${norm.weightKg}kg` : '';
    const weightLbs = norm.weightKg ? formatWeightImperialOnly(norm.weightKg) : '';
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
// ── Scanner Center Overlay (QR & NFC) ──────────────────────────────────────────
const ScannerCenter: React.FC<{
    initialMode?: 'qr' | 'nfc';
    onComplete: (ids: string[]) => void;
    onClose: () => void;
}> = ({ initialMode = 'qr', onComplete, onClose }) => {
    const [mode, setMode] = useState<'qr' | 'nfc'>(initialMode);
    const [scannedIds, setScannedIds] = useState<string[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [lastScan, setLastScan] = useState<string | null>(null);
    const [nfcError, setNfcError] = useState<string | null>(null);
    
    const qrRegionId = "qr-reader-region";
    const qrScannerRef = useRef<Html5Qrcode | null>(null);

    const playBeep = () => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        } catch (e) {}
    };

    const handleIdCaptured = useCallback((id: string) => {
        if (!id.trim()) return;
        const normalized = id.trim().toUpperCase();
        setScannedIds(prev => {
            if (prev.includes(normalized)) return prev;
            playBeep();
            setLastScan(normalized);
            setTimeout(() => setLastScan(null), 1500);
            return [...prev, normalized];
        });
    }, []);

    useEffect(() => {
        let scanner: Html5Qrcode | null = null;

        const startScanner = async () => {
            if (mode === 'qr' && !isScanning) {
                const element = document.getElementById(qrRegionId);
                if (!element) {
                    // Element not ready, retry briefly
                    setTimeout(startScanner, 100);
                    return;
                }

                try {
                    scanner = new Html5Qrcode(qrRegionId);
                    qrScannerRef.current = scanner;
                    setIsScanning(true);

                    await scanner.start(
                        { facingMode: "environment" },
                        { fps: 10, qrbox: { width: 250, height: 250 } },
                        (text) => handleIdCaptured(text),
                        () => {}
                    );
                } catch (err) {
                    console.error("QR Scanner Error:", err);
                    setIsScanning(false);
                }
            }
        };

        startScanner();

        return () => {
            if (scanner && scanner.isScanning) {
                scanner.stop().then(() => scanner.clear()).catch(console.error);
            }
        };
    }, [mode, handleIdCaptured, isScanning]);

    useEffect(() => {
        if (mode === 'nfc') {
            if (!('NDEFReader' in window)) {
                setNfcError("NFC not supported on this device/browser.");
                return;
            }

            const reader = new (window as any).NDEFReader();
            let aborted = false;

            const startNfc = async () => {
                try {
                    await reader.scan();
                    reader.onreading = (event: any) => {
                        if (aborted) return;
                        const decoder = new TextDecoder();
                        for (const record of event.message.records) {
                            if (record.recordType === "text") {
                                handleIdCaptured(decoder.decode(record.data));
                            }
                        }
                    };
                } catch (err) {
                    console.error("NFC Error:", err);
                    setNfcError("NFC Access Denied or Failed.");
                }
            };

            startNfc();
            return () => { aborted = true; };
        }
    }, [mode, handleIdCaptured]);

    return createPortal(
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-black/90 backdrop-blur-3xl p-4 sm:p-10 animate-in fade-in duration-500">
            <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-[48px] overflow-hidden flex flex-col shadow-2xl relative">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#b8860b]/40 to-transparent" />
                <div className="p-8 pb-4 flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Scanner Center</h2>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Batch ID Capture</p>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-90">
                        <X size={20} />
                    </button>
                </div>
                <div className="px-8 flex gap-3 mb-6">
                    <button onClick={() => setMode('qr')} className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl border transition-all ${mode === 'qr' ? 'bg-[#b8860b]/10 border-[#b8860b]/30 text-[#b8860b]' : 'bg-white/2 border-white/5 text-white/20 hover:text-white/40'}`}>
                        <QrCode size={18} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">QR Scan</span>
                    </button>
                    <button onClick={() => setMode('nfc')} className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl border transition-all ${mode === 'nfc' ? 'bg-[#b8860b]/10 border-[#b8860b]/30 text-[#b8860b]' : 'bg-white/2 border-white/5 text-white/20 hover:text-white/40'}`}>
                        <Smartphone size={18} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">NFC Scan</span>
                    </button>
                </div>
                <div className="flex-1 min-h-[300px] bg-black/40 relative flex items-center justify-center">
                    {mode === 'qr' ? <div id={qrRegionId} className="w-full h-full" /> : (
                        <div className="flex flex-col items-center gap-6 p-10 text-center">
                            <div className={`w-24 h-24 rounded-full flex items-center justify-center border transition-all duration-500 ${nfcError ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-[#b8860b]/10 border-[#b8860b]/20 text-[#b8860b] animate-pulse'}`}><Smartphone size={40} /></div>
                            <div><p className="text-sm font-black text-white uppercase tracking-widest mb-2">{nfcError || "Scanning for Tags..."}</p><p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Hold device near NFC tag</p></div>
                        </div>
                    )}
                    {lastScan && (
                        <div className="absolute top-6 inset-x-0 flex justify-center pointer-events-none px-4 animate-in slide-in-from-top-4 duration-300">
                            <div className="bg-green-500/20 border border-green-500/40 backdrop-blur-xl px-4 py-2 rounded-full flex items-center gap-2 shadow-xl"><CheckCircle2 size={12} className="text-green-400" /><span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Captured: {lastScan}</span></div>
                        </div>
                    )}
                </div>
                <div className="p-8 bg-black/20 flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3"><span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Batch List</span><div className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono font-black text-[#b8860b]">{scannedIds.length}</div></div>
                        {scannedIds.length > 0 && <button onClick={() => setScannedIds([])} className="text-[9px] font-black text-rose-500/40 hover:text-rose-500 uppercase tracking-widest transition-colors flex items-center gap-1.5"><Trash2 size={12} /> Clear List</button>}
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto no-scrollbar">
                        {scannedIds.length === 0 ? <div className="w-full py-8 border border-dashed border-white/5 rounded-2xl flex items-center justify-center"><p className="text-[10px] font-black text-white/10 uppercase tracking-widest">No tags scanned yet</p></div> : scannedIds.map(id => (
                            <div key={id} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2 group/tag"><span className="text-[10px] font-mono font-black text-white/60 tracking-tight">{id}</span><button onClick={() => setScannedIds(prev => prev.filter(x => x !== id))} className="opacity-0 group-hover/tag:opacity-100 transition-opacity"><X size={10} className="text-white/20 hover:text-rose-500" /></button></div>
                        ))}
                    </div>
                    <div className="flex gap-4">
                        <button onClick={onClose} className="flex-1 h-14 rounded-full bg-white/5 border border-white/5 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] hover:bg-white/10 transition-all">Cancel</button>
                        <button disabled={scannedIds.length === 0} onClick={() => onComplete(scannedIds)} className="flex-[2] h-14 rounded-full bg-[#b8860b] disabled:bg-white/5 disabled:text-white/10 text-[10px] font-black text-black uppercase tracking-[0.3em] hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-[#b8860b]/10">Generate Results</button>
                    </div>
                </div>
            </div>
        </div>
    , document.body);
};

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
    const [scannerMode, setScannerMode] = useState<'qr' | 'nfc' | null>(null);

    const performSearch = useCallback(async (q: string) => {
        if (!q.trim()) { setResults([]); setIsInitial(true); return; }
        setIsInitial(false); setLoading(true);
        try {
            const results = await searchArtifacts(q, { exchangeRate, workbookPrefix: wbPrefix });
            setResults(results);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [exchangeRate, wbPrefix]);

    useEffect(() => { if (query) performSearch(query); }, []);

    const [showExportConfig, setShowExportConfig] = useState(false);
    const [exportTitle, setExportTitle] = useState('');
    const [exportMethod, setExportMethod] = useState<'grid' | 'single'>('grid');

    const handleExportPdf = async () => {
        if (!results.length || exporting) return;
        setShowExportConfig(false);
        setExporting(true); 
        setExportProgress(0);
        setExportStatus('Starting Export...');
        try { 
            const itemsToExport = results.map(item => {
                const codes = item.codes;
                const norm = item.data;

                return {
                    data: norm,
                    codes: {
                        ...codes,
                        primaryPriceLabel: 'USD RETAIL',
                        primaryPriceValue: `$${codes.bookRetail} USD`
                    },
                    images: item.images,
                    exportType: 'catalog'
                };
            });

            const sortedItems = [...itemsToExport].sort((a, b) => {
                const qA = parseInt(String(a.data.quantity || a.data.QTY || 1));
                const qB = parseInt(String(b.data.quantity || b.data.QTY || 1));
                return qB - qA;
            });

            await exportCatalogPdf(sortedItems as any, { title: exportTitle, method: exportMethod, exportType: 'catalog' }, (p, s) => {
                setExportProgress(p);
                setExportStatus(s);
            }); 
            setTimeout(() => setExporting(false), 800);
            toast.success('Catalog exported successfully');
        } catch (e) { 
            console.error('PDF export failed:', e); 
            setExporting(false);
            toast.error('Failed to generate PDF. Please try again.');
        }
    };


    return (
        <div className="h-full flex flex-col bg-white/[0.03] backdrop-blur-3xl text-white selection:bg-white/20 overflow-hidden relative font-sans rounded-[32px] border border-white/10 shadow-2xl m-1 sm:m-4">
            {viewerItem && <FullscreenViewer images={viewerItem.images} initialIdx={viewerIdx} onClose={() => setViewerItem(null)} />}
            <div className={`shrink-0 transition-all duration-700 ${isInitial && results.length === 0 ? 'h-full flex flex-col items-center justify-center' : 'pt-10 pb-6'}`}>
                <div className="max-w-4xl mx-auto w-full px-6 flex flex-col gap-10">
                    {isInitial && results.length === 0 && <div className="flex flex-col items-center gap-8"><OnyxLogo width={56} height={56} className="opacity-80 hover:opacity-100 transition-opacity" /></div>}
                    <div className="flex flex-col gap-8">
                        {/* Large Opaque Scanner Triggers */}
                        <div className="flex items-center justify-center gap-12 sm:gap-16 pb-2 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                            <button 
                                onClick={() => setScannerMode('qr')}
                                className="group flex flex-col items-center gap-4 transition-all hover:scale-105 active:scale-95"
                                title="Open QR Scanner"
                            >
                                <div className="text-white group-hover:text-[#b8860b] transition-all drop-shadow-lg">
                                    <QrCode size={32} strokeWidth={2} />
                                </div>
                                <span className="text-[10px] font-black text-white group-hover:text-[#b8860b] uppercase tracking-[0.4em] transition-all">QR Scan</span>
                            </button>
                            <div className="w-px h-8 bg-white/20" />
                            <button 
                                onClick={() => setScannerMode('nfc')}
                                className="group flex flex-col items-center gap-4 transition-all hover:scale-105 active:scale-95"
                                title="Scan NFC Tag"
                            >
                                <div className="text-white group-hover:text-[#b8860b] transition-all drop-shadow-lg">
                                    <Smartphone size={32} strokeWidth={2} />
                                </div>
                                <span className="text-[10px] font-black text-white group-hover:text-[#b8860b] uppercase tracking-[0.4em] transition-all">NFC Scan</span>
                            </button>
                        </div>

                        <div className="relative group max-w-2xl mx-auto w-full">
                            <div className="absolute inset-y-0 left-7 flex items-center pointer-events-none text-white/20 group-focus-within:text-[#b8860b] transition-colors"><Search size={22} strokeWidth={2.5} /></div>
                            <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') performSearch(query); }} placeholder="INPUT BARCODES..." className={`w-full transition-all duration-700 bg-black border-2 border-white rounded-full font-black uppercase tracking-tight placeholder:text-white/30 focus:border-[#b8860b] focus:bg-white/5 outline-none ${isInitial && results.length === 0 ? 'h-20 sm:h-28 px-20 text-lg sm:text-2xl shadow-[0_0_40px_rgba(255,255,255,0.05)]' : 'h-14 px-14 text-sm sm:text-base'}`} />
                            <div className={`absolute inset-y-0 flex items-center transition-all duration-700 ${isInitial && results.length === 0 ? 'right-8' : 'right-4'}`}>
                                {loading && <Loader2 size={20} className="animate-spin text-[#b8860b]" />}
                            </div>
                        </div>

                        {/* Batch Scanning Status Indicator (if query has multiple items) */}
                        {query.includes(' ') && (
                            <div className="flex justify-center">
                                <div className="px-4 py-1.5 rounded-full bg-[#b8860b]/10 border border-[#b8860b]/20 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                                    <span className="text-[10px] font-black text-[#b8860b] uppercase tracking-[0.2em]">Batch Search Active</span>
                                    <div className="w-1 h-1 rounded-full bg-[#b8860b]/40" />
                                    <span className="text-[10px] font-mono font-black text-[#b8860b]">{query.split(' ').filter(Boolean).length} ITEMS</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {scannerMode && (
                <ScannerCenter 
                    initialMode={scannerMode}
                    onClose={() => setScannerMode(null)}
                    onComplete={(ids) => {
                        const newQuery = ids.join(' ');
                        setQuery(newQuery);
                        setScannerMode(null);
                        performSearch(newQuery);
                    }}
                />
            )}
            {!isInitial && (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-8 pb-32">
                        {results.length > 0 ? (
                            <>
                                <div className="flex items-center justify-between mb-8">
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
                                        {results.length} Artifact{results.length !== 1 ? 's' : ''}
                                    </span>
                                    <button 
                                        onClick={() => setShowExportConfig(true)} 
                                        className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#b8860b]/10 border border-[#b8860b]/20 text-[#b8860b] text-xs font-black uppercase tracking-[0.2em] hover:bg-[#b8860b]/20 transition-all shadow-lg active:scale-95"
                                    >
                                        <FileTextIcon size={20} />
                                        Export PDF options
                                    </button>
                                </div>
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
            
            {showExportConfig && createPortal(
                <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/80 backdrop-blur-2xl animate-in fade-in duration-300">
                    <div className="w-[480px] p-10 rounded-[48px] bg-white/[0.03] border border-white/10 flex flex-col gap-10 shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#b8860b]/40 to-transparent" />
                        
                        <div className="flex flex-col gap-2">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Export Configuration</h2>
                            <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em]">Customize your catalog</p>
                        </div>

                        <div className="space-y-8">
                            {/* Title Input */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] ml-2">PDF Title (Cover & Filename)</label>
                                <input 
                                    autoFocus
                                    type="text" 
                                    value={exportTitle} 
                                    onChange={e => setExportTitle(e.target.value)}
                                    placeholder="Enter custom title..."
                                    className="w-full h-14 px-6 bg-white/[0.04] border border-white/10 rounded-2xl text-sm font-bold text-white outline-none focus:border-[#b8860b]/30 focus:bg-white/5 transition-all"
                                />
                            </div>

                            {/* Method Selection */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] ml-2">Export Methodology</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => setExportMethod('grid')}
                                        className={`flex flex-col gap-4 p-5 rounded-3xl border transition-all text-left group ${exportMethod === 'grid' ? 'bg-[#b8860b]/10 border-[#b8860b]/30' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${exportMethod === 'grid' ? 'bg-[#b8860b]/20 border-[#b8860b]/30' : 'bg-white/5 border-white/10'}`}>
                                            <LayoutGrid size={20} className={exportMethod === 'grid' ? 'text-[#b8860b]' : 'text-white/40'} />
                                        </div>
                                        <div>
                                            <p className={`text-xs font-black uppercase tracking-widest ${exportMethod === 'grid' ? 'text-white' : 'text-white/40'}`}>Catalog Grid</p>
                                            <p className="text-[9px] font-bold text-white/20 uppercase tracking-wider mt-1">Multi-image rows</p>
                                        </div>
                                    </button>
                                    <button 
                                        onClick={() => setExportMethod('single')}
                                        className={`flex flex-col gap-4 p-5 rounded-3xl border transition-all text-left group ${exportMethod === 'single' ? 'bg-[#b8860b]/10 border-[#b8860b]/30' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${exportMethod === 'single' ? 'bg-[#b8860b]/20 border-[#b8860b]/30' : 'bg-white/5 border-white/10'}`}>
                                            <FileTextIcon size={20} className={exportMethod === 'single' ? 'text-[#b8860b]' : 'text-white/40'} />
                                        </div>
                                        <div>
                                            <p className={`text-xs font-black uppercase tracking-widest ${exportMethod === 'single' ? 'text-white' : 'text-white/40'}`}>Per Image</p>
                                            <p className="text-[9px] font-bold text-white/20 uppercase tracking-wider mt-1">Full-page view</p>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button 
                                onClick={() => setShowExportConfig(false)}
                                className="flex-1 h-14 rounded-full bg-white/5 border border-white/5 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] hover:bg-white/10 transition-all"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleExportPdf}
                                className="flex-[2] h-14 rounded-full bg-[#b8860b] text-[10px] font-black text-black uppercase tracking-[0.3em] hover:scale-105 transition-all shadow-[0_0_20px_rgba(184,134,11,0.3)] active:scale-95"
                            >
                                Start Generation
                            </button>
                        </div>
                    </div>
                </div>
            , document.body)}

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
