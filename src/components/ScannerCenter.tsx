import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Terminal, Camera, Nfc, Activity, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { tr } from '../lib/i18n';

interface ScannerCenterProps {
    initialMode?: 'qr' | 'nfc';
    onComplete?: (ids: string[]) => void;
    onStepCapture?: (allIds: string[]) => void;
    onVerify?: (id: string) => boolean | Promise<boolean>;
    onClose: () => void;
    title?: string;
    subtitle?: string;
}

export const ScannerCenter: React.FC<ScannerCenterProps> = ({ 
    initialMode = 'qr', 
    onComplete, 
    onStepCapture, 
    onVerify,
    onClose,
    title = "Scanner Center",
    subtitle = "Tactical ID Capture"
}) => {
    const [mode, setMode] = useState<'qr' | 'nfc'>(initialMode);
    const [scannedIds, setScannedIds] = useState<string[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [lastScan, setLastScan] = useState<string | null>(null);
    const [isVerified, setIsVerified] = useState<boolean | null>(null);
    const [nfcError, setNfcError] = useState<string | null>(null);
    
    const qrRegionId = "qr-reader-region-shared";
    const qrScannerRef = useRef<Html5Qrcode | null>(null);

    // AudioContext singleton — creating a new AudioContext on every beep is very expensive.
    // Reuse the same context for the lifetime of the scanner.
    const audioCtxRef = useRef<AudioContext | null>(null);

    const playBeep = useCallback(() => {
        try {
            if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
                audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            const ctx = audioCtxRef.current;
            // Resume if suspended (browser autoplay policy)
            if (ctx.state === 'suspended') ctx.resume();
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
    }, []);

    const handleIdCaptured = useCallback(async (id: string) => {
        if (!id.trim()) return;
        const tagId = id.trim().split('|')[0].trim().toUpperCase();
        if (!tagId) return;

        if (onVerify) {
            const result = await onVerify(tagId);
            setIsVerified(result);
            if (result) {
                playBeep();
                setLastScan(tagId);
                setTimeout(() => {
                    onComplete?.([tagId]);
                }, 1000);
            } else {
                // Play error sound or show error?
                setTimeout(() => setIsVerified(null), 2000);
            }
            return;
        }

        setScannedIds(prev => {
            if (prev.includes(tagId)) return prev;
            playBeep();
            setLastScan(tagId);
            setTimeout(() => setLastScan(null), 1500);
            const next = [...prev, tagId];
            onStepCapture?.(next);
            return next;
        });
    }, [onStepCapture, onVerify, onComplete]);

    useEffect(() => {
        let isMounted = true;
        
        const startScanner = async () => {
            if (mode === 'qr') {
                const element = document.getElementById(qrRegionId);
                if (!element) {
                    if (isMounted) setTimeout(startScanner, 100);
                    return;
                }

                try {
                    const scanner = new Html5Qrcode(qrRegionId);
                    qrScannerRef.current = scanner;

                    const config = {
                        fps: 30,
                        qrbox: (viewWidth: number, viewHeight: number) => {
                            const size = Math.min(viewWidth, viewHeight) * 0.8;
                            return { width: size, height: size };
                        },
                        aspectRatio: 1.0,
                        formatsToSupport: [ 
                            Html5QrcodeSupportedFormats.QR_CODE,
                            Html5QrcodeSupportedFormats.DATA_MATRIX,
                            Html5QrcodeSupportedFormats.AZTEC,
                            Html5QrcodeSupportedFormats.PDF_417
                        ]
                    };

                    await scanner.start(
                        { facingMode: "environment" },
                        config,
                        (text) => {
                            if (isMounted) handleIdCaptured(text);
                        },
                        () => {} 
                    );
                    
                    if (isMounted) setIsScanning(true);
                } catch (err: any) {
                    console.error("QR Scanner Error:", err);
                    if (isMounted) {
                        setIsScanning(false);
                        if (err.name === 'NotAllowedError') {
                            toast.error(tr("Camera permission denied. Please allow access in your browser settings."));
                        } else {
                            toast.error(tr("Failed to initialize camera scanner."));
                        }
                    }
                }
            }
        };

        startScanner();

        return () => {
            isMounted = false;
            const scanner = qrScannerRef.current;
            if (scanner) {
                const stopAndClear = async () => {
                    try {
                        if (scanner.isScanning) {
                            await scanner.stop();
                        }
                        scanner.clear();
                        qrScannerRef.current = null;
                    } catch (err) {
                        console.warn("Cleanup error:", err);
                        try { scanner.clear(); } catch(e){}
                    }
                };
                stopAndClear();
            }
        };
    }, [mode, handleIdCaptured]);

    useEffect(() => {
        if (mode === 'nfc') {
            if (!('NDEFReader' in window)) {
                setNfcError("NFC not supported");
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
                    setNfcError("NFC Access Failed");
                }
            };

            startNfc();
            return () => { aborted = true; };
        }
    }, [mode, handleIdCaptured]);

    return createPortal(
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-black/60 backdrop-blur-xl p-4 sm:p-10 animate-in fade-in duration-500">
            <div className="w-full max-w-2xl bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[48px] overflow-hidden flex flex-col shadow-2xl relative">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-(--main-color)/40 to-transparent" />
                
                <div className="p-8 pb-4 flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3 mb-1 opacity-20">
                            <Terminal size={12} className="text-(--main-color)" />
                            <span className="text-[8px] font-black text-white uppercase tracking-[1em]">{tr("SCAN_PROTOCOL")}</span>
                        </div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{title}</h2>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">{subtitle}</p>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-90">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 p-8 flex flex-col gap-8 min-h-[500px]">
                    {/* Mode Toggle */}
                    <div className="flex items-center gap-4 p-2 bg-white/[0.02] border border-white/5 rounded-3xl self-center">
                        <button 
                            onClick={() => setMode('qr')}
                            className={`flex items-center gap-3 px-8 py-3 rounded-2xl transition-all ${mode === 'qr' ? 'bg-white text-black font-black' : 'text-white/20 hover:text-white/40'}`}
                        >
                            <Camera size={18} />
                            <span className="text-[11px] uppercase tracking-widest">{tr("QR Reader")}</span>
                        </button>
                        <button 
                            onClick={() => setMode('nfc')}
                            className={`flex items-center gap-3 px-8 py-3 rounded-2xl transition-all ${mode === 'nfc' ? 'bg-white text-black font-black' : 'text-white/20 hover:text-white/40'}`}
                        >
                            <Nfc size={18} />
                            <span className="text-[11px] uppercase tracking-widest">{tr("NFC Link")}</span>
                        </button>
                    </div>

                    {/* Active Viewport */}
                    <div className="flex-1 relative rounded-[40px] overflow-hidden border border-white/10 bg-black/40 group">
                        {mode === 'qr' ? (
                            <div id={qrRegionId} className="w-full h-full [&>video]:object-cover" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-8 p-12 text-center">
                                <div className="relative">
                                    {/* Replaced blur-[100px] animate-pulse with opacity-animated radial shadow.
                                        Blur rasterization on every frame is expensive on mobile. */}
                                    <div className="absolute inset-0 animate-pulse" style={{ boxShadow: '0 0 80px 40px color-mix(in srgb, var(--main-color) 25%, transparent)', borderRadius: '50%' }} />
                                    <Nfc size={120} strokeWidth={0.5} className="text-(--main-color) relative" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <h3 className="text-xl font-black text-white uppercase tracking-widest">{tr("Awaiting Proximity")}</h3>
                                    <p className="text-sm text-white/30 font-medium max-w-[280px]">{tr("Hold the tag near the top-back of your device to establish secure handshake.")}</p>
                                </div>
                                {nfcError && (
                                    <div className="flex items-center gap-3 px-6 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl animate-in zoom-in duration-300">
                                        <AlertTriangle size={16} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">{nfcError}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Scanner Overlay UI */}
                        {isScanning && mode === 'qr' && (
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute inset-0 border-[60px] border-black/40" />
                                <div className="absolute inset-[60px] border border-white/20">
                                    <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-(--main-color)" />
                                    <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-(--main-color)" />
                                    <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-(--main-color)" />
                                    <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-(--main-color)" />
                                </div>
                                <div className="absolute inset-x-[60px] top-1/2 h-px bg-(--main-color)/50 animate-scan-line shadow-[0_0_20px_rgba(var(--main-rgb),0.8)]" />
                            </div>
                        )}

                        {/* Verification Status Overlay */}
                        {isVerified !== null && (
                            <div className={`absolute inset-0 flex flex-col items-center justify-center backdrop-blur-3xl animate-in fade-in duration-300 ${isVerified ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                                {isVerified ? (
                                    <>
                                        <div className="w-32 h-32 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_80px_rgba(16,185,129,0.4)] animate-in zoom-in duration-500">
                                            <ShieldCheck size={64} className="text-black" />
                                        </div>
                                        <h3 className="mt-8 text-3xl font-black text-emerald-400 uppercase tracking-tighter">{tr("Verified")}</h3>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-32 h-32 rounded-full bg-red-500 flex items-center justify-center shadow-[0_0_80px_rgba(239,68,68,0.4)] animate-in zoom-in duration-500">
                                            <AlertTriangle size={64} className="text-black" />
                                        </div>
                                        <h3 className="mt-8 text-3xl font-black text-red-400 uppercase tracking-tighter">{tr("Mismatch Error")}</h3>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Scanned Footer */}
                    <div className="flex items-center justify-between px-2">
                        <div className="flex flex-col gap-1">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.5em]">{tr("BUFFER_STATUS")}</span>
                            <div className="flex items-center gap-3">
                                <Activity size={12} className={isScanning ? "text-(--main-color) animate-pulse" : "text-white/10"} />
                                <span className="text-sm font-black text-white tabular-nums tracking-tighter">
                                    {scannedIds.length} <span className="text-white/20 uppercase tracking-[0.2em] text-[10px] ml-1">{tr("Items Captured")}</span>
                                </span>
                            </div>
                        </div>

                        {scannedIds.length > 0 && !onVerify && (
                            <button 
                                onClick={() => onComplete?.(scannedIds)}
                                className="px-10 py-4 bg-(--main-color) text-black rounded-2xl flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl font-black text-[11px] uppercase tracking-widest"
                            >
                                <CheckCircle2 size={18} />
                                {tr("Finalize Batch")}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
