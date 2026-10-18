import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    isPackingPrintWizardOpenAtom,
    selectedInventoryIdsAtom,
    inventoryAtom,
    exchangeRateAtom,
    workbookVersionAtom,
    themeAtom,
    userAtom,
    packingSelectedIdsAtom,
    activeViewAtom,
    logisticsSubTabAtom,
    packingLabelSizeAtom
} from '../../lib/atoms';
import { isPrintCenterOpenAtom, printCenterTabAtom, PrintCenterTab } from './printState';
import {
    Printer, Bluetooth, X, FileSpreadsheet, FileText, Download,
    CheckCircle2, ChevronRight, ChevronLeft, ChevronDown, Zap, AlertCircle, Eye,
    RefreshCw, Layers, Sparkles, Cpu, History, Search, UploadCloud,
    Sliders, Smartphone, Check, ArrowLeft, ShieldAlert, Activity, BookOpen,
    Play, Pause, RotateCcw, Clock, ShieldCheck
} from 'lucide-react';
import toast from '../onyxIsland/notify/toast';
import { RareEarthLogoBase64 } from '../logistics/RareEarthLogoBase64';
import { ART_OF_DECOR_LOGO } from '../../lib/artOfDecorLogo';
import {
    calculateCodesAndPrices,
    normalizeInventoryData,
    collectExportImages,
    toTitleCase
} from '../../lib/utils';
import { generateAxonometricDataUrl } from '../../lib/axonometric';
import { exportToXLSX } from '../../lib/xlsxUtils';
import { exportCrateManifesto, ManifestoItem } from '../../lib/crateManifesto';
import {
    exportCatalogPdf,
    prewarmCatalogImages,
    beginImageSession,
    endImageSession,
    CatalogArtifact
} from '../../lib/pdfExport';
import { isShopifyReady } from '../../lib/aiContent';
import { tr } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';
import { M110Driver, VirtualM110Driver, VirtualDecodedLabel, isWebBluetoothSupported, BarcodeScanlineCheckResult } from '../../utils/PhomemoM110';
import { recordExport, trackDocumentJob, getRecentTracked, TrackedJob } from './jobTracking';
import { PdfPreview, PdfDocumentSource } from '../../components/PdfPreview';
import { PreviewLabels, PixelLabelView, LABEL_WIDTH_50x30, LABEL_HEIGHT_50x30, LABEL_WIDTH_50x50, LABEL_HEIGHT_50x50, labelRasterCache } from '../../components/PreviewLabels';
import { LocalQueueTabContent } from './PrintCenter';
import { PrintJobsPanel } from './PrintJobsPanel';
import { TemplatesTabContent } from './TemplatesTab';
import {
    verifyDocumentJob,
    checksumV1,
    findDocumentJobsByHash,
    getDocumentJobById
} from '../../lib/documentJobs';
import { runDjSelfTest, SelfTestResult } from './selfTest';
import { ItemTag } from '../../components/ui/ItemTag';
import './labelPrintStudio.css';

export interface VirtualTrayItem {
    id: string;
    tagId: string;
    dataUrl: string;
    index: number;
    timestamp: number;
    item?: any;
    barcodeCheck?: BarcodeScanlineCheckResult;
}

type StudioMode = 'studio' | 'history' | 'queue' | 'verify' | 'templates';
type MobileTab = 'preview' | 'controls' | 'center';
type BleStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'printing' | 'error';
type PrinterType = 'bluetooth' | 'virtual';

const fmtDuration = (ms: number): string => {
    const total = Math.max(0, Math.floor(ms / 1000));
    return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
};

export const LabelPrintStudio: React.FC = () => {
    const user = useAtomValue(userAtom);
    const [isOpen, setIsOpen] = useAtom(isPackingPrintWizardOpenAtom);
    const [isPrintCenterOpen, setIsPrintCenterOpen] = useAtom(isPrintCenterOpenAtom);
    const [pcTab, setPcTab] = useAtom(printCenterTabAtom);
    const [persistedLabelSize, setPersistedLabelSize] = useAtom(packingLabelSizeAtom);

    const invIds = useAtomValue(selectedInventoryIdsAtom);
    const packingIds = useAtomValue(packingSelectedIdsAtom);
    const activeView = useAtomValue(activeViewAtom);
    const logisticsSubTab = useAtomValue(logisticsSubTabAtom);
    const inventory = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    const theme = useAtomValue(themeAtom);

    // Active Studio Mode
    const [mode, setMode] = useState<StudioMode>('studio');
    const [mobileTab, setMobileTab] = useState<MobileTab>('preview');
    const [season, setSeason] = useState<'825' | '826'>('826');

    // Batch and Label Configuration
    const [name, setName] = useState(`BATCH_${new Date().toISOString().split('T')[0]}`);
    const [activeLabelSize, setActiveLabelSize] = useState<'50x30' | '50x50'>(() => {
        return persistedLabelSize === '50x50' ? '50x50' : '50x30';
    });
    const [logoVariant, setLogoVariant] = useState<'ArtOfDecor' | 'RareEarth'>('ArtOfDecor');
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [isDesignerOpen, setIsDesignerOpen] = useState(false);
    const [isDesignerUserActive, setIsDesignerUserActive] = useState(false);
    const [designerRasters, setDesignerRasters] = useState<Record<string, string>>({});
    const [isDesignerIframeReady, setIsDesignerIframeReady] = useState(false);
    const triggerFocusRef = useRef<HTMLElement | null>(null);
    const designerOverlayRef = useRef<HTMLDivElement | null>(null);

    // Printer Selection & Driver State Machine
    const isBluetoothSupported = isWebBluetoothSupported();
    const [printerType, setPrinterType] = useState<PrinterType>(() => isBluetoothSupported ? 'bluetooth' : 'virtual');
    const driverRef = useRef<M110Driver>(new M110Driver());
    const virtualDriverRef = useRef<VirtualM110Driver>(new VirtualM110Driver());
    const [virtualSpeedMultiplier, setVirtualSpeedMultiplier] = useState<number>(1.0);
    const [virtualSimulatePaperOut, setVirtualSimulatePaperOut] = useState<boolean>(false);
    const [virtualSimulateDisconnect, setVirtualSimulateDisconnect] = useState<boolean>(false);
    const [virtualTray, setVirtualTray] = useState<VirtualTrayItem[]>([]);
    const [trayModalLabel, setTrayModalLabel] = useState<VirtualTrayItem | null>(null);

    // Collapsible side panel sections on mobile/tablet (<= 820px)
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
        stock: false,
        printer: false,
        copies: false,
        exports: false,
    });
    const toggleSection = (key: string) => {
        setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const trayTouchStartY = useRef<number | null>(null);
    const handleTrayTouchStart = (e: React.TouchEvent) => {
        trayTouchStartY.current = e.touches[0].clientY;
    };
    const handleTrayTouchEnd = (e: React.TouchEvent) => {
        if (trayTouchStartY.current !== null) {
            const delta = e.changedTouches[0].clientY - trayTouchStartY.current;
            if (delta > 80) {
                setTrayModalLabel(null);
            }
            trayTouchStartY.current = null;
        }
    };

    const [bleState, setBleState] = useState<BleStatus>(() =>
        printerType === 'virtual' ? 'connected' : (isBluetoothSupported ? 'disconnected' : 'unsupported')
    );
    const [deviceName, setDeviceName] = useState<string | null>(() =>
        printerType === 'virtual' ? 'Virtual M110' : null
    );
    const [bleError, setBleError] = useState<string | null>(null);
    const [printProgress, setPrintProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
    const cancelPrintRef = useRef(false);

    // Document Generation & Review State
    const [progress, setProgress] = useState({ xlsx: -1, pdf: -1, catalog: -1 });
    const [urls, setUrls] = useState({ xlsx: '', pdf: '', catalogReady: '', catalogNotReady: '' });
    const [previewTarget, setPreviewTarget] = useState<'catalog' | 'control' | null>(null);
    const slotUrlsRef = useRef<Record<string, string>>({});

    const setUrlSlot = (key: 'xlsx' | 'pdf' | 'catalogReady' | 'catalogNotReady', url: string) => {
        const prev = slotUrlsRef.current[key];
        if (prev && prev !== url) URL.revokeObjectURL(prev);
        slotUrlsRef.current[key] = url;
        setUrls(u => ({ ...u, [key]: url }));
    };

    const revokeAllUrls = () => {
        Object.values(slotUrlsRef.current).forEach(u => { if (u) URL.revokeObjectURL(u); });
        slotUrlsRef.current = {};
    };

    useEffect(() => () => { revokeAllUrls(); }, []);

    // Catalog Telemetry
    const [catalogStatus, setCatalogStatus] = useState<{
        label: string; error: string | null; startedAt: number | null; updatedAt: number; bytes: number;
        imagesTotal: number; imagesFailed: number;
    }>({ label: '', error: null, startedAt: null, updatedAt: 0, bytes: 0, imagesTotal: 0, imagesFailed: 0 });

    // Last Printed Job Tracking
    const [lastPrintJob, setLastPrintJob] = useState<{
        jobId: string; labelCount: number; itemCount: number; at: string; isReprint: boolean;
    } | null>(null);
    const [showJobLog, setShowJobLog] = useState(false);

    // Live Batch Print Run State Machine
    const [isLiveRunOpen, setIsLiveRunOpen] = useState(false);
    const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'paused_chunk' | 'paused_paper' | 'cancelled' | 'complete' | 'error'>('idle');
    const [runCurrentIndex, setRunCurrentIndex] = useState(1);
    const [runTotalLabels, setRunTotalLabels] = useState(0);
    const [runChunkIndex, setRunChunkIndex] = useState(1);
    const [runTotalChunks, setRunTotalChunks] = useState(1);
    const [runDriverProgress, setRunDriverProgress] = useState(0);
    const [batchStartedAt, setBatchStartedAt] = useState<number | null>(null);
    const [chunkStartedAt, setChunkStartedAt] = useState<number | null>(null);
    const [labelStartedAt, setLabelStartedAt] = useState<number | null>(null);
    const [completedDurations, setCompletedDurations] = useState<number[]>([]);
    const [nowTicker, setNowTicker] = useState<number>(Date.now());
    const [doneList, setDoneList] = useState<Array<{
        tagId: string;
        item: any;
        index: number;
        durationMs: number;
        checksum: string;
        completedAt: string;
        dataUrl?: string;
    }>>([]);
    const [failedList, setFailedList] = useState<Array<{
        tagId: string;
        error: string;
        index: number;
    }>>([]);

    // Live Run Timer Interval (ticker for smooth elapsed time & ETA calculation)
    useEffect(() => {
        if (!isLiveRunOpen || runStatus === 'complete' || runStatus === 'cancelled' || runStatus === 'idle') return;
        const interval = setInterval(() => {
            setNowTicker(Date.now());
        }, 250);
        return () => clearInterval(interval);
    }, [isLiveRunOpen, runStatus]);

    // Live Print Run Sheet Swipe-to-Dismiss Touch Handlers
    const liveTouchStartY = useRef<number | null>(null);
    const handleLiveTouchStart = (e: React.TouchEvent) => {
        liveTouchStartY.current = e.touches[0].clientY;
    };
    const handleLiveTouchEnd = (e: React.TouchEvent) => {
        if (liveTouchStartY.current !== null) {
            const delta = e.changedTouches[0].clientY - liveTouchStartY.current;
            if (delta > 80 && (runStatus === 'complete' || runStatus === 'cancelled' || runStatus === 'error')) {
                setIsLiveRunOpen(false);
            }
            liveTouchStartY.current = null;
        }
    };

    // Designer Iframe Refs
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const pendingBatchRef = useRef<any>(null);
    const pendingPrintJobRef = useRef<{ isVirtual?: boolean;
        ids: string[];
        tagById: Record<string, string>;
        checksum: string;
        jobId: string;
        isReprint: boolean;
    } | null>(null);
    const labelSizeRef = useRef<string>(activeLabelSize);
    useEffect(() => { labelSizeRef.current = activeLabelSize; }, [activeLabelSize]);

    // Axonometric SVG Cache
    const [axoCache, setAxoCache] = useState<Record<string, string>>({});

    // Verify Tab States (Absorbed from PrintCenter)
    const [verifyHash, setVerifyHash] = useState('');
    const [verifyStatus, setVerifyStatus] = useState<'match' | 'mismatch' | 'unverifiable' | 'idle'>('idle');
    const [matchedJobs, setMatchedJobs] = useState<any[] | null>(null);
    const [jobVerifyStatuses, setJobVerifyStatuses] = useState<Record<string, 'match' | 'mismatch' | 'unverifiable'>>({});
    const [dragActive, setDragActive] = useState(false);
    const [droppedHash, setDroppedHash] = useState('');
    const [testResults, setTestResults] = useState<SelfTestResult[] | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    // Sync activeLabelSize with atom
    const handleLabelSizeChange = (size: '50x30' | '50x50') => {
        setActiveLabelSize(size);
        setPersistedLabelSize(size);
    };

    // Calculate selected inventory items
    const selectedItems = useMemo(() => {
        const usePacking = activeView === 'logistics' && logisticsSubTab === 'packing';
        const idsArray = usePacking
            ? Array.from(packingIds)
            : (invIds.length > 0 ? invIds : Array.from(packingIds));

        const idStrings = new Set(idsArray.map(String));

        const items = inventory
            .filter(item => {
                const row = String(item.row);
                const id = String(item.data?.id);
                const tag = String(item.data?.itemId || '');
                return idStrings.has(row) || idStrings.has(id) || (tag && idStrings.has(tag));
            })
            .map(item => {
                const normData = normalizeInventoryData(item.data);
                const codes = calculateCodesAndPrices(normData, exchangeRate, workbookPrefix);
                return { ...item, normData, codes };
            });

        return items.sort((a, b) => {
            const tagA = String(a.codes.bookBarcode || '');
            const tagB = String(b.codes.bookBarcode || '');
            return tagB.localeCompare(tagA, undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [inventory, invIds, packingIds, activeView, logisticsSubTab, exchangeRate, workbookPrefix]);

    // Flatten label instances by quantity
    const labelInstances = useMemo(() => {
        const instances: { item: any; index: number; globalIndex: number }[] = [];
        let globalIndex = 0;
        selectedItems.forEach(item => {
            const count = quantities[String(item.row)] ?? (Number(item.normData?.quantity) || 1);
            for (let i = 0; i < count; i++) {
                instances.push({ item, index: i + 1, globalIndex });
                globalIndex++;
            }
        });
        return instances;
    }, [selectedItems, quantities]);

    // Live Run State Sync Refs
    const isLiveRunOpenRef = useRef(isLiveRunOpen);
    useEffect(() => { isLiveRunOpenRef.current = isLiveRunOpen; }, [isLiveRunOpen]);

    const labelStartedAtRef = useRef(labelStartedAt);
    useEffect(() => { labelStartedAtRef.current = labelStartedAt; }, [labelStartedAt]);

    const runCurrentIndexRef = useRef(runCurrentIndex);
    useEffect(() => { runCurrentIndexRef.current = runCurrentIndex; }, [runCurrentIndex]);

    const labelInstancesRef = useRef(labelInstances);
    useEffect(() => { labelInstancesRef.current = labelInstances; }, [labelInstances]);

    // Computed values for Live Batch Print Run
    const currentActiveInstance = useMemo(() => {
        if (labelInstances.length === 0) return null;
        const targetIdx = Math.max(0, Math.min(labelInstances.length - 1, runCurrentIndex - 1));
        return labelInstances[targetIdx];
    }, [labelInstances, runCurrentIndex]);

    const elapsedBatchMs = batchStartedAt ? Math.max(0, nowTicker - batchStartedAt) : 0;
    const elapsedChunkMs = chunkStartedAt ? Math.max(0, nowTicker - chunkStartedAt) : 0;
    const elapsedLabelMs = labelStartedAt ? Math.max(0, nowTicker - labelStartedAt) : 0;

    const avgDurationMs = completedDurations.length > 0 
        ? completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length 
        : 2500;
    const remainingCount = Math.max(0, runTotalLabels - (runStatus === 'complete' ? runTotalLabels : doneList.length));
    const etaMs = remainingCount * avgDurationMs;
    const runPercent = runTotalLabels > 0 
        ? Math.min(100, Math.round(((runStatus === 'complete' ? runTotalLabels : (runCurrentIndex - 1)) / runTotalLabels) * 100)) 
        : 0;

    // Pre-cache Axonometrics
    useEffect(() => {
        let isCurrent = true;
        const loadAxos = async () => {
            const cache: Record<string, string> = {};
            for (const item of selectedItems) {
                const tag = item.codes?.bookBarcode || '';
                if (!cache[tag]) {
                    const norm = item.normData || {};
                    const w = parseFloat(norm.widthCm || '10') || 10;
                    const h = parseFloat(norm.heightCm || '10') || 10;
                    const d = parseFloat(norm.lengthCm || String(w)) || w;
                    try {
                        const svg = await generateAxonometricDataUrl(w, h, d, norm.shape, norm.shortDescription || norm.type, '#111111', true);
                        cache[tag] = svg;
                    } catch {
                        // ignore error
                    }
                }
            }
            if (isCurrent) setAxoCache(cache);
        };
        if (selectedItems.length > 0) loadAxos();
        return () => { isCurrent = false; };
    }, [selectedItems]);

    // Initialize quantities and handle entry point switching
    useEffect(() => {
        if (isOpen || isPrintCenterOpen) {
            const initialQ: Record<string, number> = {};
            selectedItems.forEach(item => {
                initialQ[String(item.row)] = Number(item.normData.quantity) || 1;
            });
            setQuantities(initialQ);
            setIsDesignerOpen(false);

            if (isPrintCenterOpen && (!isOpen || selectedItems.length === 0)) {
                // Opened from legacy Print Center tool
                setMode(pcTab === 'history' ? 'history' : pcTab === 'verify' ? 'verify' : pcTab === 'templates' ? 'templates' : 'queue');
            } else {
                setMode('studio');
            }
        }
    }, [isOpen, isPrintCenterOpen, selectedItems.length]);

    const handleSetAllCopies = (qty: number) => {
        const next: Record<string, number> = {};
        selectedItems.forEach(item => {
            next[String(item.row)] = qty;
        });
        setQuantities(next);
    };

    // Send printer configuration to designer iframe
    const sendPrinterConfigToIframe = useCallback(() => {
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
                type: 'SET_PRINTER',
                payload: {
                    printerType,
                    isVirtual: printerType === 'virtual',
                    speedMultiplier: virtualSpeedMultiplier,
                    simulatePaperOut: virtualSimulatePaperOut,
                    simulateDisconnect: virtualSimulateDisconnect,
                }
            }, window.location.origin);
        }
    }, [printerType, virtualSpeedMultiplier, virtualSimulatePaperOut, virtualSimulateDisconnect]);

    useEffect(() => {
        sendPrinterConfigToIframe();
    }, [sendPrinterConfigToIframe]);

    // Sync driver state when printer type or simulation flags change
    useEffect(() => {
        if (printerType === 'virtual') {
            setBleState('connected');
            setDeviceName('Virtual M110');
            setBleError(null);
            virtualDriverRef.current.setSpeedMultiplier(virtualSpeedMultiplier);
            virtualDriverRef.current.setSimulatePaperOut(virtualSimulatePaperOut);
            virtualDriverRef.current.setSimulateDisconnect(virtualSimulateDisconnect);
        } else {
            if (!isBluetoothSupported) {
                setBleState('unsupported');
                setDeviceName(null);
            } else if (driverRef.current.isConnected()) {
                setBleState('connected');
            } else {
                setBleState('disconnected');
                setDeviceName(null);
            }
        }
    }, [printerType, isBluetoothSupported, virtualSpeedMultiplier, virtualSimulatePaperOut, virtualSimulateDisconnect]);

    // Listen for disconnects
    useEffect(() => {
        virtualDriverRef.current.onDisconnect = () => {
            if (printerType === 'virtual') {
                setBleState('disconnected');
                setDeviceName(null);
            }
        };
        driverRef.current.onDisconnect = () => {
            if (printerType === 'bluetooth') {
                setBleState('disconnected');
                setDeviceName(null);
            }
        };
    }, [printerType]);

    const requestDesignerPreviewsRef = useRef<() => void>(() => {});

    // Designer overlay close & focus return handler
    const handleCloseDesigner = useCallback(() => {
        setIsDesignerUserActive(false);
        if (runStatus !== 'running') {
            pendingPrintJobRef.current = null;
            setIsDesignerOpen(false);
        }
        requestDesignerPreviewsRef.current();
        setTimeout(() => {
            triggerFocusRef.current?.focus();
        }, 50);
    }, [runStatus]);

    // Handle Escape key to close active designer modal and return focus to trigger
    useEffect(() => {
        if (!isDesignerUserActive) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                handleCloseDesigner();
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isDesignerUserActive, handleCloseDesigner]);

    // Close handler
    const handleClose = () => {
        setIsOpen(false);
        setIsPrintCenterOpen(false);
        setIsDesignerOpen(false);
        setIsDesignerUserActive(false);
    };

    // Printer Connect (Virtual or Bluetooth)
    const handleConnectPrinter = async (): Promise<boolean> => {
        if (printerType === 'virtual') {
            setBleState('connecting');
            setBleError(null);
            try {
                virtualDriverRef.current.setSpeedMultiplier(virtualSpeedMultiplier);
                virtualDriverRef.current.setSimulatePaperOut(virtualSimulatePaperOut);
                virtualDriverRef.current.setSimulateDisconnect(virtualSimulateDisconnect);
                const name = await virtualDriverRef.current.connect();
                setDeviceName(name || 'Virtual M110');
                setBleState('connected');
                toast.success('Connected to Virtual M110');
                sendPrinterConfigToIframe();
                return true;
            } catch (e: any) {
                setBleState('error');
                setBleError(e?.message || 'Virtual printer error');
                toast.error(e?.message || 'Virtual connection failed');
                return false;
            }
        }

        if (!isBluetoothSupported) {
            toast.error("Web Bluetooth unsupported on iOS Safari. Use Virtual printer or Chrome/Edge/Bluefy.");
            return false;
        }
        setBleState('connecting');
        setBleError(null);
        try {
            const name = await driverRef.current.connect();
            setDeviceName(name || 'Phomemo M110');
            setBleState('connected');
            toast.success(`Paired with ${name || 'Phomemo M110'}`);
            return true;
        } catch (e: any) {
            console.error('Bluetooth connection failed:', e);
            setBleState('error');
            setBleError(e?.message || 'Bluetooth pairing failed');
            toast.error(e?.message || 'Bluetooth connection failed');
            return false;
        }
    };

    const ONYX_MASTER_TEMPLATE_V4 = (width: number, height: number) => ({
        name: "OnyxLabels_V7",   // owner design phomymo-design-1792284044224.json (2026-10-17): axo top-left, text block right, QR top-right (square), TAG CODE line, barcode kept inside 384 dots
        version: 7,
        isTemplate: true,
        labelSize: { width, height },
        templateFields: ["TAG ID", "TAG CODE", "DESCRIPTION", "SIZES", "BOOK RETAIL", "COLOR MATERIAL", "QR DATA", "AXO_IMAGE"],
        elements: [
            {
                "id": "el_axo",
                "type": "image",
                "zone": 0,
                "x": 21.48,
                "y": 1.81,
                "width": 82.07,
                "height": 82.07,
                "rotation": 0,
                "imageData": "{{AXO_IMAGE}}",
                "dither": "floyd-steinberg",
                "lockAspectRatio": true
            },
            {
                "id": "el_barcode",
                "type": "barcode",
                "zone": 0,
                "x": 10.47,
                "y": 122.76,
                "width": 373.5,
                "height": 117.24,
                "rotation": 0,
                "barcodeData": "{{TAG ID}}",
                "barcodeFormat": "CODE128",
                "format": "CODE128",
                "textFontSize": 15,
                "textBold": true,
                "showText": false
            },
            {
                "id": "el_retail",
                "type": "text",
                "zone": 0,
                "x": 16.1,
                "y": 95.29,
                "width": 371.97,
                "height": 34.82,
                "rotation": 0,
                "align": "center",
                "text": "{{TAG CODE}}",
                "fontSize": 13,
                "fontFamily": "Inter, sans-serif",
                "fontWeight": "bold",
                "autoScale": true,
                "noWrap": true
            },
            {
                "id": "el_desc",
                "type": "text",
                "zone": 0,
                "x": 88.36,
                "y": 24.98,
                "width": 242.75,
                "height": 43.2,
                "rotation": 0,
                "align": "left",
                "text": "{{DESCRIPTION}}",
                "fontSize": 23,
                "fontFamily": "Inter, sans-serif",
                "fontWeight": "bold",
                "autoScale": true,
                "noWrap": true
            },
            {
                "id": "el_mat",
                "type": "text",
                "zone": 0,
                "x": 89.47,
                "y": 1.81,
                "width": 240.53,
                "height": 32.79,
                "rotation": 0,
                "align": "left",
                "text": "{{COLOR MATERIAL}}",
                "fontSize": 23,
                "fontFamily": "Inter, sans-serif",
                "autoScale": true,
                "noWrap": true
            },
            {
                "id": "el_sizes",
                "type": "text",
                "zone": 0,
                "x": 88.36,
                "y": 68.18,
                "width": 157.98,
                "height": 28.41,
                "rotation": 0,
                "align": "left",
                "text": "{{SIZES}}",
                "fontSize": 15,
                "fontFamily": "Inter, sans-serif",
                "fontWeight": "normal",
                "autoScale": true,
                "noWrap": true
            },
            {
                "id": "el_qr",
                "type": "qr",
                "zone": 0,
                "x": 330.0,
                "y": 1.81,
                "width": 55.8,
                "height": 55.8,
                "rotation": 0,
                "qrData": "{{TAG ID}}"
            },
            {
                "id": "el_side",
                "type": "text",
                "zone": 0,
                "x": -87.67,
                "y": 110.11,
                "width": 220,
                "height": 20,
                "rotation": 90,
                "text": "MADE IN MEXICO",
                "fontSize": 17,
                "fontFamily": "Inter, sans-serif",
                "align": "justify",
                "fontWeight": "bold",
                "autoScale": false
            }
        ]
    });

    const ONYX_MASTER_TEMPLATE_50x50 = (width: number, height: number, logoChoice: string) => ({
        name: "OnyxLabels_50x50",
        version: 6,
        isTemplate: true,
        labelSize: { width, height },
        templateFields: ["TAG ID", "DESCRIPTION", "SIZES", "BOOK RETAIL", "COLOR MATERIAL", "QR DATA", "AXO_IMAGE"],
        elements: [
            { id: "el_axo", type: "image", zone: 0, x: 255, y: 93, width: 155, height: 155, rotation: 0, imageData: "{{AXO_IMAGE}}" },
            { id: "el_qr", type: "qr", zone: 0, x: 20, y: 12.32, width: 106.4, height: 106.4, rotation: 0, qrData: "{{QR DATA}}" },
            { id: "el_desc", type: "text", zone: 0, x: 130, y: 12.32, width: 250, height: 35, rotation: 0, align: "left", text: "{{DESCRIPTION}}", fontSize: 22, fontFamily: "Inter, sans-serif", fontWeight: "bold", autoScale: true, noWrap: true },
            { id: "el_mat", type: "text", zone: 0, x: 130, y: 47.32, width: 250, height: 35.33, rotation: 0, align: "left", text: "{{COLOR MATERIAL}}", fontSize: 22, fontFamily: "Inter, sans-serif", fontWeight: "normal", autoScale: true, noWrap: true },
            { id: "el_sizes", type: "text", zone: 0, x: 130, y: 82.65, width: 250, height: 35.01, rotation: 0, align: "left", text: "{{SIZES}}", fontSize: 22, fontFamily: "Inter, sans-serif", fontWeight: "bold", autoScale: true, noWrap: true },
            { id: "el_retail", type: "text", zone: 0, x: 20, y: 132.8, width: 250, height: 35, rotation: 0, align: "left", text: "{{BOOK RETAIL}}", fontSize: 22, fontFamily: "Inter, sans-serif", fontWeight: "bold", autoScale: true, noWrap: true },
            { id: "el_madein", type: "text", zone: 0, x: 20, y: 175.8, width: 161.44, height: 26.4, rotation: 0, align: "left", text: "Made in Mexico For", fontSize: 18, fontFamily: "Inter, sans-serif", fontWeight: "normal", autoScale: false, noWrap: true },
            { id: "el_logo", type: "image", zone: 0, x: 20, y: logoChoice === 'RareEarth' ? 193 : 202, width: logoChoice === 'RareEarth' ? 198 : 174, height: logoChoice === 'RareEarth' ? 47 : 30, rotation: 0, imageData: logoChoice === 'RareEarth' ? RareEarthLogoBase64 : ART_OF_DECOR_LOGO },
            { id: "el_barcode", type: "barcode", zone: 0, x: 18.48, y: 240.1, width: 368.16, height: 146.48, rotation: 0, barcodeData: "{{TAG ID}}", barcodeFormat: "CODE128", format: "CODE128", textFontSize: 22, textBold: true, showText: true }
        ]
    });

    const buildBatchJSONAsync = async (items: any[], workbookPrefix: string, activeLabelSize: string = '50x30', logoVariant: string = 'ArtOfDecor') => {
        const [wStr, hStr] = activeLabelSize.split('x');
        const width = parseInt(wStr) || 50;
        const height = parseInt(hStr) || 30;

        const baseRecords = await Promise.all(items.map(async item => {
            const d = item.normData;
            const c = item.codes;
            const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
            const retailStr = String(c.bookRetail || '0').padStart(4, '0');
            
            const wCm = parseFloat(d.widthCm) || 10;
            const hCm = parseFloat(d.heightCm) || 10;
            const dCm = parseFloat(d.lengthCm) || wCm;

            const axoBase64 = await generateAxonometricDataUrl(
                wCm, hCm, dCm,
                d.shape || '', d.itemType || d.type || d.shortDescription || d.description || '',
                '#111111', true
            );

            return {
                "TAG ID": c.bookBarcode || '',
                "DESCRIPTION": toTitleCase(`${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'Onyx Piece'),
                "COLOR MATERIAL": toTitleCase(`${d.color || ''} ${d.material || 'Onyx'}`.trim()),
                "SIZES": `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM${d.weightKg ? '  WT ' + d.weightKg + ' KG' : ''}`,
                "BOOK RETAIL": `${c.bookAqCode}-${bookv}${retailStr}`,
                // Label text tag (2026-10-17): TAG ID + USD retail + AQ code, e.g. EM8261MLX-1957MFF. The barcode and QR keep the plain TAG ID.
                "TAG CODE": `${c.bookBarcode || ''}-${c.bookRetail ?? ''}${c.bookAqCode || ''}`,
                "QUANTITY": quantities[String(item.row)] ?? (d.quantity || 1),
                "LANDED CODE": c.bookLandCode,
                "ACQ CODE": c.bookAqCode,
                "QR DATA": c.bookBarcode || '',
                "AXO_IMAGE": axoBase64
            };
        }));

        const templateData = baseRecords.flatMap(r =>
            Array.from({ length: (Number(r["QUANTITY"]) || 1) }, () => ({ ...r }))
        );

        return {
            ...(activeLabelSize === '50x50' ? ONYX_MASTER_TEMPLATE_50x50(width, height, logoVariant) : ONYX_MASTER_TEMPLATE_V4(width, height)),
            name: `Onyx_Batch_${new Date().toISOString().split('T')[0]}`,
            exportedAt: new Date().toISOString(),
            records: templateData,
            templateData
        };
    };

    // Request true 1-bit raster previews from the hidden same-origin designer print engine
    const requestDesignerPreviews = useCallback(async () => {
        if (!iframeRef.current?.contentWindow || selectedItems.length === 0) return;
        try {
            const batchProject = await buildBatchJSONAsync(selectedItems, workbookPrefix, activeLabelSize, logoVariant);
            iframeRef.current.contentWindow.postMessage(
                {
                    type: 'RENDER_BATCH_PREVIEWS',
                    payload: batchProject
                },
                window.location.origin
            );
        } catch (e) {
            console.warn('[LabelPrintStudio] requestDesignerPreviews error:', e);
        }
    }, [selectedItems, workbookPrefix, activeLabelSize, logoVariant]);

    useEffect(() => {
        requestDesignerPreviewsRef.current = requestDesignerPreviews;
    }, [requestDesignerPreviews]);

    // Checksum computation for print job
    const computeJobChecksum = async (batch: any): Promise<string> => {
        try {
            const bytes = new TextEncoder().encode(JSON.stringify(batch));
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch {
            return '';
        }
    };

    // Commit Print Job to Supabase & Local DJ Tracking
    const commitPrintJob = useCallback(async (detail: any, reason: string = 'designer reported PRINT_COMPLETE') => {
        const isVirtual = !!(detail?.isVirtual ?? (pendingPrintJobRef.current as any)?.isVirtual ?? (printerType === 'virtual'));
        const fallbackJobId = `${isVirtual ? 'VPJ' : 'PJ'}-${Date.now().toString(36).toUpperCase()}`;
        const job = pendingPrintJobRef.current || {
            ids: selectedItems.map((it: any) => it.row ?? it.data?.id ?? it.id).filter(Boolean).map(String),
            tagById: Object.fromEntries(selectedItems.map((it: any) => [String(it.row ?? it.data?.id ?? it.id), String(it.codes?.bookBarcode || '')])),
            checksum: '',
            jobId: fallbackJobId,
            isReprint: false,
            isVirtual,
        };
        pendingPrintJobRef.current = null;

        const printedTags: string[] = Array.isArray(detail?.printedTags) ? detail.printedTags : [];
        const labelCount: number = Number(detail?.totalRecords) || printedTags.length || job.ids.length;
        const stamp = detail?.finishedAt || new Date().toISOString();
        const isReprint = !!job.isReprint;

        // If virtual, ensure decoded labels are captured in virtual tray
        if (isVirtual && Array.isArray(detail?.decodedLabels) && detail.decodedLabels.length > 0) {
            setVirtualTray(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const additions: VirtualTrayItem[] = [];
                detail.decodedLabels.forEach((dl: any, idx: number) => {
                    if (dl && dl.dataUrl && !existingIds.has(dl.id)) {
                        const tag = printedTags[idx] || `LABEL-${idx + 1}`;
                        const matchingItem = selectedItems.find(it => (it.codes?.bookBarcode || '') === tag) || selectedItems[idx];
                        additions.push({
                            id: dl.id || `vt-${Date.now()}-${idx}`,
                            tagId: tag,
                            dataUrl: dl.dataUrl,
                            index: idx + 1,
                            timestamp: dl.timestamp || Date.now(),
                            item: matchingItem,
                            barcodeCheck: dl.barcodeCheck,
                        });
                    }
                });
                return [...additions, ...prev];
            });
        }

        // Virtual (simulated) prints never reach the database: no print_jobs rows, no tag stamping.
        if (isVirtual) {
            setLastPrintJob({ jobId: job.jobId, labelCount, itemCount: job.ids.length, at: stamp, isReprint });
            toast.success(`[VIRTUAL] Simulated ${labelCount} label${labelCount !== 1 ? 's' : ''} (inventory tags untouched)`);
            return;
        }

        const perTag = new Map<string, number>();
        printedTags.forEach(t => perTag.set(t, (perTag.get(t) || 0) + 1));

        try {
            const { error: jobErr } = await supabase.from('print_jobs').insert({
                id: job.jobId,
                checksum: job.checksum,
                printed_at: stamp,
                printed_by: user?.email || user?.name || null,
                label_count: labelCount,
                item_count: job.ids.length,
                is_reprint: isReprint,
                label_size: labelSizeRef.current,
                source: detail?.source || 'batch',
            });
            if (jobErr) console.warn('[LabelPrintStudio] print_jobs insert notice:', jobErr);

            const rows = job.ids.map((id: string) => {
                const tag = job.tagById?.[id] || '';
                return {
                    job_id: job.jobId,
                    inventory_id: id,
                    tag_id: tag,
                    labels_printed: perTag.get(tag) ?? 1,
                };
            });

            for (let i = 0; i < rows.length; i += 100) {
                const { error: itemErr } = await supabase.from('print_job_items').insert(rows.slice(i, i + 100));
                if (itemErr) console.warn('[LabelPrintStudio] print_job_items notice:', itemErr);
            }

            if (!isVirtual) {
                recordExport({
                    templateId: 'lbl-item-template-v4',
                    kind: 'label',
                    season: '826',
                    legacyPrintJobId: job.jobId,
                    getSnapshot: () => rows
                });

                if (!isReprint) {
                    for (let i = 0; i < job.ids.length; i += 50) {
                        await supabase.from('inventory').update({
                            print_date: stamp,
                            print_job_checksum: job.checksum,
                            print_job_id: job.jobId,
                            updated_at: stamp,
                        }).in('id', job.ids.slice(i, i + 50));
                    }
                }
            }

            setLastPrintJob({ jobId: job.jobId, labelCount, itemCount: job.ids.length, at: stamp, isReprint });
            if (isVirtual) {
                toast.success(`[VIRTUAL] Simulated ${labelCount} label${labelCount !== 1 ? 's' : ''} (inventory tags untouched)`);
                console.log(`[LabelPrintStudio] virtual print job ${job.jobId} recorded (${reason})`);
            } else {
                toast.success(`Logged ${labelCount} label${labelCount !== 1 ? 's' : ''} across ${job.ids.length} item${job.ids.length !== 1 ? 's' : ''}`);
                console.log(`[LabelPrintStudio] print job ${job.jobId} recorded (${reason})`);
            }
        } catch (e: any) {
            console.error('[LabelPrintStudio] commitPrintJob error:', e);
        }
    }, [user, selectedItems, printerType]);

    // Print All (through designer print engine)
    const handlePrintAll = async (isReprint = false) => {
        if (selectedItems.length === 0) {
            toast.error("No labels selected to print");
            return;
        }

        cancelPrintRef.current = false;

        const tid = toast.loading(tr("Generating dynamic 3D structures for labels..."));
        try {
            const batchProject = await buildBatchJSONAsync(selectedItems, workbookPrefix, activeLabelSize, logoVariant);
            try {
                localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
            } catch (storageError) {
                console.warn('LocalStorage quota exceeded. Relying purely on postMessage for iframe payload transfer.');
            }
            pendingBatchRef.current = batchProject;

            const tagById: Record<string, string> = {};
            selectedItems.forEach((it: any) => {
                const id = it.row ?? it.data?.id ?? it.id;
                if (id) tagById[String(id)] = String(it.codes?.bookBarcode || '');
            });
            const isVirtual = printerType === 'virtual';
            pendingPrintJobRef.current = {
                ids: selectedItems.map((it: any) => it.row ?? it.data?.id ?? it.id).filter(Boolean).map(String),
                tagById,
                checksum: await computeJobChecksum(batchProject),
                jobId: `${isVirtual ? 'VPJ' : 'PJ'}-${Date.now().toString(36).toUpperCase()}`,
                isReprint,
                isVirtual,
            };

            toast.success(tr("Batch Prepared! Launching Live Print Run"), { id: tid });

            // Initialize Live Batch Print Run state machine
            setIsLiveRunOpen(true);
            setRunStatus('running');
            setRunCurrentIndex(1);
            setRunTotalLabels(batchProject.templateData.length);
            setRunChunkIndex(1);
            setRunTotalChunks(Math.ceil(batchProject.templateData.length / 50));
            setRunDriverProgress(0);
            const tStart = Date.now();
            setBatchStartedAt(tStart);
            setChunkStartedAt(tStart);
            setLabelStartedAt(tStart);
            setDoneList([]);
            setFailedList([]);
            setCompletedDurations([]);

            setIsDesignerOpen(true);

            if (iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.postMessage(
                    {
                        type: 'SET_PRINTER',
                        payload: {
                            printerType,
                            isVirtual,
                            speedMultiplier: virtualSpeedMultiplier,
                            simulatePaperOut: virtualSimulatePaperOut,
                            simulateDisconnect: virtualSimulateDisconnect,
                        }
                    },
                    window.location.origin
                );
                iframeRef.current.contentWindow.postMessage(
                    { type: 'LOAD_DESIGN', payload: batchProject },
                    window.location.origin
                );
                const currentTemplateData = batchProject.templateData;
                setTimeout(() => {
                    iframeRef.current?.contentWindow?.postMessage(
                        { type: 'UPDATE_DATA', payload: { templateData: currentTemplateData } },
                        window.location.origin
                    );
                    iframeRef.current?.contentWindow?.postMessage(
                        { type: 'START_BATCH_PRINT' },
                        window.location.origin
                    );
                }, 300);
            }
        } catch (e: any) {
            console.error('[LabelPrintStudio] handlePrintAll failed:', e);
            toast.error(`Print setup failed: ${e?.message || 'unknown error'}`, { id: tid });
        }
    };

    // Control Handlers for Live Batch Print Run
    const handleResumeChunk = () => {
        iframeRef.current?.contentWindow?.postMessage({ type: 'PRINT_RESUME' }, window.location.origin);
        setRunStatus('running');
        setChunkStartedAt(Date.now());
    };

    const handleCancelRun = () => {
        cancelPrintRef.current = true;
        iframeRef.current?.contentWindow?.postMessage({ type: 'PRINT_CANCEL' }, window.location.origin);
        setRunStatus('cancelled');
    };

    const handleReprintFailed = () => {
        if (failedList.length === 0) return;
        setIsLiveRunOpen(false);
        handlePrintAll(true);
    };

    const handleReprintEntireBatch = () => {
        setIsLiveRunOpen(false);
        handlePrintAll(true);
    };

    // Backup XLSX Export
    const handleGenerateXLSX = async () => trackDocumentJob({
        templateId: 'fmt-label-wizard-xlsx',
        kind: 'xlsx',
        season: '826'
    }, async () => {
        setProgress(p => ({ ...p, xlsx: 10 }));
        try {
            const rows = selectedItems.map(item => {
                const d = item.normData;
                const c = item.codes;
                const desc = toTitleCase(`${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'Onyx Piece');
                const matColor = toTitleCase(`${d.material || 'Onyx'} ${d.color || ''}`.trim());
                const sizes = `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM`;
                const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
                const retailStr = String(c.bookRetail || '0').padStart(4, '0');
                const bookRetailTag = `${c.bookAqCode}-${bookv}${retailStr}`;
                const qrUrl = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${c.bookBarcode}`;
                const count = quantities[String(item.row)] ?? (d.quantity || 1);
                return [c.bookBarcode, `${c.bookBarcode || ''}-${c.bookRetail ?? ''}${c.bookAqCode || ''}`, desc, matColor, sizes, count, c.bookLandCode, c.bookAqCode, bookRetailTag, qrUrl];
            });

            const blob = await exportToXLSX(`Labels_${name}`, [{
                name: 'Packing List',
                data: [['TAGID', 'TAG CODE', 'DESCRIPTION', 'MATERIAL COLOR', 'SIZES', 'QUANTITY', 'LANDED CODE', 'ACQ CODE', 'BOOK RETAIL', 'QR URL'], ...rows]
            }], {}, 'blob');

            if (blob instanceof Blob) {
                setUrlSlot('xlsx', URL.createObjectURL(blob));
                setProgress(p => ({ ...p, xlsx: 100 }));
                toast.success(tr("Backup XLSX generated"));
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `Labels_${name}.xlsx`;
                a.click();
                return blob;
            } else {
                throw new Error('XLSX generation failed');
            }
        } catch (error: any) {
            toast.error(`XLSX failed: ${error.message}`);
            setProgress(p => ({ ...p, xlsx: -1 }));
        }
    });

    // Control PDF Export
    const handleGeneratePDF = async () => {
        setProgress(p => ({ ...p, pdf: 5 }));
        try {
            const manifestoItems: ManifestoItem[] = selectedItems.map((item, idx) => {
                const d = item.normData;
                const c = item.codes;
                const vendorPrefix = String(d.itemId || c.bookBarcode || '').split('-')[0].toUpperCase();
                return {
                    index: idx + 1,
                    vendorPrefix,
                    qty: quantities[String(item.row)] ?? (Number(d.quantity) || 1),
                    itemId: c.bookBarcode || '',
                    rowId: String(item.row),
                    name: `${d.shape || ''} ${d.shortDescription || ''}`.trim() || 'Artifact',
                    material: d.material || '',
                    color: d.color || '',
                    dims: [d.lengthCm, d.widthCm, d.heightCm].filter(Boolean).join('×'),
                    weightKg: parseFloat(d.weightKg) || 0,
                    costMxn: 0,
                    costUsd: 0,
                    imageUrls: collectExportImages(d),
                    tagColor: '#333',
                    dbItemCount: Number(d.quantity || 1)
                };
            });

            const blob = await exportCrateManifesto(manifestoItems, {
                dynamicId: name,
                crateId: `LBL-${Date.now()}`,
                crateDims: 'N/A',
                crateType: 'Labels Batch',
                fillPct: 100,
                exportedAt: new Date().toLocaleString(),
                customTitle: 'CONTROL PAGE MANIFESTO',
                excludeImages: false,
                excludeHeader: true,
                sortByTagDesc: true
            }, pct => setProgress(p => ({ ...p, pdf: 5 + Math.round(pct * 0.9) })), 'blob');

            if (blob instanceof Blob) {
                setUrlSlot('pdf', URL.createObjectURL(blob));
                setProgress(p => ({ ...p, pdf: 100 }));
                toast.success(tr("Control Page generated"));
            } else {
                throw new Error('PDF generation failed');
            }
        } catch (e: any) {
            console.error(e);
            setProgress(p => ({ ...p, pdf: -1 }));
            toast.error(tr("Control Page failed"));
        }
    };

    // Catalog PDF Export
    const handleGenerateCatalog = async () => {
        const startedAt = Date.now();
        setCatalogStatus({ label: tr("Preparing Catalog..."), error: null, startedAt, updatedAt: startedAt, bytes: 0, imagesTotal: 0, imagesFailed: 0 });
        setProgress(p => ({ ...p, catalog: 5 }));
        try {
            const ready = selectedItems.filter(i => isShopifyReady(i.normData));
            const notReady = selectedItems.filter(i => !isShopifyReady(i.normData));

            const jobs = [
                { key: 'catalogReady' as const, suffix: 'Shopify', label: tr("Shopify"), items: ready },
                { key: 'catalogNotReady' as const, suffix: 'Isometric', label: tr("Isometric"), items: notReady },
            ].filter(j => j.items.length > 0);

            if (jobs.length === 0) throw new Error(tr("No items selected"));

            const span = 95 / jobs.length;
            let base = 5;
            let totalBytes = 0;
            let imgTotal = 0;
            let imgFailed = 0;

            const jobResults: CatalogArtifact[][] = jobs.map(job => job.items.map(item => ({
                data: item.data,
                codes: item.codes,
                images: collectExportImages(item.normData),
                exportType: 'catalog' as const,
            })));

            beginImageSession();
            for (let ji = 0; ji < jobs.length; ji++) {
                const job = jobs[ji];
                const results = jobResults[ji];
                const jobBase = base;

                const blob = await exportCatalogPdf(results, {
                    title: `${name} — ${job.label}`,
                    method: 'grid',
                    logo: logoVariant,
                    exportType: 'catalog'
                }, (pct, stage) => {
                    setProgress(p => ({ ...p, catalog: Math.min(99, Math.round(jobBase + (pct / 100) * span)) }));
                    setCatalogStatus(s => ({
                        ...s,
                        label: `${job.label} (${job.items.length}) — ${stage || s.label}`,
                        updatedAt: Date.now(),
                    }));
                }, 'blob', (stats) => {
                    imgTotal += stats.imagesTotal;
                    imgFailed += stats.imagesFailed;
                    setCatalogStatus(s => ({ ...s, imagesTotal: imgTotal, imagesFailed: imgFailed }));
                    const nextResults = jobResults[ji + 1];
                    if (nextResults) void prewarmCatalogImages(nextResults, { method: 'grid', exportType: 'catalog' });
                });

                if (!(blob instanceof Blob)) throw new Error(`${job.label}: catalogue generation failed`);

                totalBytes += blob.size;
                setUrlSlot(job.key as 'catalogReady' | 'catalogNotReady', URL.createObjectURL(blob));
                base += span;
            }

            setProgress(p => ({ ...p, catalog: 100 }));
            toast.success(tr("Catalog generated successfully"));
        } catch (e: any) {
            console.error(e);
            setProgress(p => ({ ...p, catalog: -1 }));
            toast.error(tr("Catalog generation failed"));
        } finally {
            endImageSession();
        }
    };

    // Edit Label (Handoff to iframe designer)
    const handleOpenDesigner = async (targetItems?: any[]) => {
        const itemsToUse = (targetItems && targetItems.length > 0) ? targetItems : selectedItems;
        if (itemsToUse.length === 0) {
            toast.error("No labels selected to edit");
            return;
        }
        const tid = toast.loading(tr("Generating dynamic 3D structures for labels..."));
        try {
            const batchProject = await buildBatchJSONAsync(itemsToUse, workbookPrefix, activeLabelSize, logoVariant);
            try {
                localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
            } catch (storageError) {
                console.warn('LocalStorage quota exceeded. Relying purely on postMessage for iframe payload transfer.');
            }
            pendingBatchRef.current = batchProject;

            const tagById: Record<string, string> = {};
            itemsToUse.forEach((it: any) => {
                const id = it.row ?? it.data?.id ?? it.id;
                if (id) tagById[String(id)] = String(it.codes?.bookBarcode || '');
            });
            const isVirtual = printerType === 'virtual';
            pendingPrintJobRef.current = {
                ids: itemsToUse.map((it: any) => it.row ?? it.data?.id ?? it.id).filter(Boolean).map(String),
                tagById,
                checksum: await computeJobChecksum(batchProject),
                jobId: `${isVirtual ? 'VPJ' : 'PJ'}-${Date.now().toString(36).toUpperCase()}`,
                isReprint: false,
                isVirtual,
            };

            toast.success(tr("Batch Prepared! Launching Visual Designer"), { id: tid });
            setIsDesignerOpen(true);
            setIsDesignerUserActive(true);

            if (iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.postMessage(
                    {
                        type: 'SET_PRINTER',
                        payload: {
                            printerType,
                            isVirtual,
                            speedMultiplier: virtualSpeedMultiplier,
                            simulatePaperOut: virtualSimulatePaperOut,
                            simulateDisconnect: virtualSimulateDisconnect,
                        }
                    },
                    window.location.origin
                );
                iframeRef.current.contentWindow.postMessage(
                    { type: 'LOAD_DESIGN', payload: batchProject },
                    window.location.origin
                );
                const currentTemplateData = batchProject.templateData;
                setTimeout(() => {
                    iframeRef.current?.contentWindow?.postMessage(
                        { type: 'UPDATE_DATA', payload: { templateData: currentTemplateData } },
                        window.location.origin
                    );
                }, 300);
            }
            setTimeout(() => {
                designerOverlayRef.current?.focus();
            }, 100);
        } catch (e: any) {
            console.error('[LabelPrintStudio] handleOpenDesigner failed:', e);
            toast.error(`Designer setup failed: ${e?.message || 'unknown error'}`, { id: tid });
        }
    };

    const handleIframeLoad = () => {
        setIsDesignerIframeReady(true);
        sendPrinterConfigToIframe();
        requestDesignerPreviews();
        if (pendingBatchRef.current && iframeRef.current?.contentWindow) {
            const batch = pendingBatchRef.current;
            iframeRef.current.contentWindow.postMessage(
                { type: 'LOAD_DESIGN', payload: batch },
                window.location.origin
            );
            const currentTemplateData = batch.templateData;
            setTimeout(() => {
                iframeRef.current?.contentWindow?.postMessage(
                    { type: 'UPDATE_DATA', payload: { templateData: currentTemplateData } },
                    window.location.origin
                );
            }, 300);
        }
    };

    // Iframe designer message handler
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // only the same-origin designer frame may talk to the studio
            if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;

            if (event.data?.type === 'DESIGNER_READY') {
                setIsDesignerIframeReady(true);
                sendPrinterConfigToIframe();
                requestDesignerPreviews();
                if (pendingBatchRef.current && iframeRef.current?.contentWindow) {
                    const batch = pendingBatchRef.current;
                    iframeRef.current.contentWindow.postMessage(
                        { type: 'LOAD_DESIGN', payload: batch },
                        window.location.origin
                    );
                    const currentTemplateData = batch.templateData;
                    setTimeout(() => {
                        iframeRef.current?.contentWindow?.postMessage(
                            { type: 'UPDATE_DATA', payload: { templateData: currentTemplateData } },
                            window.location.origin
                        );
                        if (isLiveRunOpenRef.current) {
                            iframeRef.current?.contentWindow?.postMessage(
                                { type: 'START_BATCH_PRINT' },
                                window.location.origin
                            );
                        }
                    }, 300);
                    pendingBatchRef.current = null;
                }
            }

            if (event.data?.type === 'PRINT_RUN_START') {
                setIsLiveRunOpen(true);
                setRunStatus('running');
                const started = event.data.payload?.startedAt || Date.now();
                setBatchStartedAt(started);
                setChunkStartedAt(started);
                setLabelStartedAt(started);
                setRunTotalLabels(event.data.payload?.totalRows || labelInstancesRef.current.length);
                setRunCurrentIndex(1);
                setRunChunkIndex(1);
                setRunTotalChunks(Math.ceil((event.data.payload?.totalRows || labelInstancesRef.current.length) / 50));
                setRunDriverProgress(0);
                setDoneList([]);
                setFailedList([]);
                setCompletedDurations([]);
            }

            if (event.data?.type === 'PRINT_RUN_LABEL_START') {
                setRunStatus('running');
                setRunCurrentIndex(event.data.payload?.current || 1);
                setRunChunkIndex(event.data.payload?.chunkIndex || 1);
                setRunTotalChunks(event.data.payload?.totalChunks || 1);
                setLabelStartedAt(event.data.payload?.timestamp || Date.now());
                setRunDriverProgress(0);
            }

            if (event.data?.type === 'PRINT_RUN_DRIVER_PROGRESS') {
                setRunDriverProgress(event.data.payload?.driverProgress || 0);
            }

            if (event.data?.type === 'PRINT_RUN_LABEL_COMPLETE') {
                const p = event.data.payload;
                const completedAt = p?.completedAt || Date.now();
                const startT = labelStartedAtRef.current;
                const dur = startT ? Math.max(200, completedAt - startT) : 2200;
                setCompletedDurations(prev => [...prev, dur]);

                const curIdx = runCurrentIndexRef.current;
                const idx = (p?.rowIndex ?? (curIdx - 1));
                const insts = labelInstancesRef.current;
                const inst = insts[idx] || insts[0];
                const tagId = p?.tagId || inst?.item.codes?.bookBarcode || '';
                const shortChecksum = (pendingPrintJobRef.current?.checksum || 'dj1').slice(0, 6);

                if (p?.labelDataUrl) {
                    setVirtualTray(prev => [
                        {
                            id: `vt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            tagId,
                            dataUrl: p.labelDataUrl,
                            index: p?.current || (prev.length + 1),
                            timestamp: completedAt,
                            item: inst?.item,
                        },
                        ...prev
                    ]);
                }

                setDoneList(prev => [
                    {
                        tagId,
                        item: inst?.item,
                        index: p?.current || (prev.length + 1),
                        durationMs: dur,
                        checksum: shortChecksum,
                        completedAt: new Date(completedAt).toLocaleTimeString(),
                        dataUrl: p?.labelDataUrl,
                    },
                    ...prev
                ]);
            }

            if (event.data?.type === 'PRINT_RUN_CHUNK_PAUSE') {
                const isPaper = !!event.data.payload?.isOutOfPaper;
                setRunStatus(isPaper ? 'paused_paper' : 'paused_chunk');
                setRunChunkIndex(event.data.payload?.chunkIndex || 1);
                setRunTotalChunks(event.data.payload?.totalChunks || 1);
            }

            if (event.data?.type === 'PRINT_RUN_CHUNK_RESUME') {
                setRunStatus('running');
                setChunkStartedAt(Date.now());
            }

            if (event.data?.type === 'PRINT_RUN_CANCELLED') {
                setRunStatus('cancelled');
            }

            if (event.data?.type === 'PRINT_RUN_ERROR') {
                setRunStatus('error');
                setFailedList(prev => [...prev, {
                    tagId: event.data.payload?.tagId || 'Unknown',
                    error: event.data.payload?.error || 'Print failed',
                    index: event.data.payload?.rowIndex ?? -1
                }]);
            }

            if (event.data?.type === 'PRINT_COMPLETE' || event.data?.type === 'PRINT_DONE') {
                setRunStatus('complete');
                commitPrintJob(event.data.payload || {}, 'designer reported PRINT_COMPLETE');
            }

            if (event.data?.type === 'PREVIEW_RASTER_ITEM') {
                const { tag, dataUrl } = event.data.payload || {};
                if (tag && dataUrl) {
                    labelRasterCache.set(tag, dataUrl);
                    setDesignerRasters(prev => ({ ...prev, [tag]: dataUrl }));
                }
            }

            if (event.data?.type === 'PREVIEW_RASTERS_READY') {
                const rasters = event.data.payload?.rasters || {};
                for (const [tag, url] of Object.entries(rasters)) {
                    if (url) labelRasterCache.set(tag, url as string);
                }
                setDesignerRasters(prev => ({ ...prev, ...rasters }));
            }

            if (event.data?.type === 'CLOSE_WIZARD') {
                pendingPrintJobRef.current = null;
                setIsDesignerOpen(false);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [commitPrintJob, sendPrinterConfigToIframe, requestDesignerPreviews]);

    // Ping designer iframe on mount to announce parent presence
    useEffect(() => {
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'PING' }, window.location.origin);
        }
    }, []);

    // Refresh previews when batch configuration changes
    useEffect(() => {
        if (isDesignerIframeReady && selectedItems.length > 0) {
            requestDesignerPreviews();
        }
    }, [isDesignerIframeReady, selectedItems, activeLabelSize, logoVariant, workbookPrefix, requestDesignerPreviews]);

    useEffect(() => {
        if (isDesignerOpen && iframeRef.current?.contentWindow && !pendingBatchRef.current) {
            const timer = setTimeout(async () => {
                try {
                    const batchProject = await buildBatchJSONAsync(selectedItems, workbookPrefix, activeLabelSize, logoVariant);
                    try {
                        localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
                    } catch (storageError) {}
                    
                    iframeRef.current?.contentWindow?.postMessage(
                        { type: 'UPDATE_DATA', payload: { templateData: batchProject.templateData } },
                        window.location.origin
                    );
                } catch (e) {
                    console.error('Failed to update quantities in iframe', e);
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [quantities, isDesignerOpen, selectedItems, workbookPrefix, activeLabelSize, logoVariant]);

    // Self-test handler for absorbed Verify tab
    const handleRunSelfTest = async () => {
        setIsTesting(true);
        setTestResults(null);
        const results = await runDjSelfTest();
        setTestResults(results);
        setIsTesting(false);
    };

    // Verify handler for absorbed Verify tab
    const handleVerify = async (inputStr?: string) => {
        const input = (typeof inputStr === 'string' ? inputStr : verifyHash).trim();
        if (!input) return;
        setVerifyStatus('idle');
        setMatchedJobs(null);
        setJobVerifyStatuses({});

        if (input.startsWith('dj1:') || /^[a-fA-F0-9]{64}$/.test(input)) {
            const jobs = await findDocumentJobsByHash(input);
            setMatchedJobs(jobs || []);
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
        } catch {
            setDroppedHash(tr('Invalid JSON file or hash failure'));
        }
    };

    if (!isOpen && !isPrintCenterOpen) return null;

    const catalogDocs: PdfDocumentSource[] = [
        urls.catalogReady ? { key: 'catalogReady', label: tr("SHOPIFY"), filename: `Catalog_${name}_Shopify.pdf`, url: urls.catalogReady } : null,
        urls.catalogNotReady ? { key: 'catalogNotReady', label: tr("ISOMETRIC"), filename: `Catalog_${name}_Isometric.pdf`, url: urls.catalogNotReady } : null,
    ].filter(Boolean) as PdfDocumentSource[];

    const controlDocs: PdfDocumentSource[] = urls.pdf ? [{
        key: 'pdf', label: tr("CONTROL PAGE"), filename: `ControlPage_${name}.pdf`, url: urls.pdf
    }] : [];

    return createPortal(
        <>
            {/* PDF Review Modal */}
            <PdfPreview
                isOpen={previewTarget !== null}
                onClose={() => setPreviewTarget(null)}
                docs={previewTarget === 'catalog' ? catalogDocs : controlDocs}
                title={previewTarget === 'catalog' ? `${tr("CATALOG")} — ${name}` : `${tr("CONTROL PAGE")} — ${name}`}
            />

            {/* Overlay Container */}
            <div className="lps-overlay">
                {/* Backdrop Click Scrim (no duplicate blur; .lps-sheet carries the single 24px glass blur) */}
                <div className="lps-scrim" onClick={handleClose} />

                {/* Master Window Shell (Layer 1: Clear .liquid-surface) */}
                <div className="lps-sheet liquid-surface ui-root relative z-10">
                    
                    {/* Top Bar Chrome */}
                    <div className="lps-header relative z-10">
                        <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg liquid-panel lps-card flex items-center justify-center shrink-0 text-[var(--main-color,#7FBBFF)]">
                                <Printer size={16} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xs md:text-sm font-black tracking-wider uppercase truncate">
                                        PHOMEMO PRINT STUDIO
                                    </h2>
                                    <span className="hidden sm:inline-block px-1.5 py-0.2 rounded-full text-[9px] font-bold liquid-control uppercase tracking-wider lps-text-secondary">
                                        M110 / M120
                                    </span>
                                </div>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="lps-batch-input outline-none font-bold text-[11px] md:text-xs uppercase tracking-tight p-0 mt-0.5 max-w-[130px] sm:max-w-none truncate"
                                    placeholder="BATCH NAME"
                                />
                            </div>
                        </div>

                        {/* Center Readout & Mode Switchers (Desktop min-width: 821px) */}
                        <div className="hidden min-[821px]:flex items-center gap-2 lg:gap-3">
                            <div className="liquid-panel lps-readout flex items-center gap-3 px-2.5 py-1 text-[11px] font-bold mr-1 tabular-figures">
                                <div>
                                    <span className="lps-text-muted uppercase text-[8.5px] block leading-tight">TYPES</span>
                                    <span className="tabular-nums text-[var(--main-color,#7FBBFF)]">{selectedItems.length}</span>
                                </div>
                                <div className="w-px h-4 bg-[var(--lq-rim-subtle)]" />
                                <div>
                                    <span className="lps-text-muted uppercase text-[8.5px] block leading-tight">LABELS</span>
                                    <span className="tabular-nums text-[var(--main-color,#7FBBFF)]">{labelInstances.length}</span>
                                </div>
                            </div>

                            {/* Mode Tabs */}
                            <div className="liquid-panel lps-seg-group flex items-center gap-0.5 p-0.5">
                                <button
                                    onClick={() => setMode('studio')}
                                    className={`lps-tab-btn ${mode === 'studio' ? 'active' : ''}`}
                                >
                                    Batch Studio
                                </button>
                                <button
                                    onClick={() => setMode('history')}
                                    className={`lps-tab-btn ${mode === 'history' ? 'active' : ''}`}
                                >
                                    History
                                </button>
                                <button
                                    onClick={() => setMode('queue')}
                                    className={`lps-tab-btn ${mode === 'queue' ? 'active' : ''}`}
                                >
                                    Queue
                                </button>
                                <button
                                    onClick={() => setMode('verify')}
                                    className={`lps-tab-btn ${mode === 'verify' ? 'active' : ''}`}
                                >
                                    Verify
                                </button>
                                <button
                                    onClick={() => setMode('templates')}
                                    className={`lps-tab-btn ${mode === 'templates' ? 'active' : ''}`}
                                >
                                    Templates
                                </button>
                            </div>
                        </div>

                        {/* Top Right: Bluetooth Status & Close Button */}
                        <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
                            {/* Bluetooth status button / pill */}
                            <button
                                onClick={handleConnectPrinter}
                                disabled={bleState === 'connecting' || bleState === 'printing' || (printerType === 'bluetooth' && !isBluetoothSupported)}
                                className={`lps-status-pill liquid-control cursor-pointer min-h-[44px] px-2.5 sm:px-3 ${
                                    bleState === 'connected' ? (printerType === 'virtual' ? 'lps-tone-amber' : 'lps-tone-emerald') :
                                    bleState === 'connecting' ? 'lps-tone-blue animate-pulse' :
                                    bleState === 'printing' ? 'lps-tone-blue animate-pulse' :
                                    bleState === 'error' ? 'lps-tone-red' :
                                    (printerType === 'bluetooth' && !isBluetoothSupported) ? 'opacity-50 cursor-default' :
                                    ''
                                }`}
                                title={printerType === 'virtual' ? 'Virtual printer active' : (!isBluetoothSupported ? 'Web Bluetooth unavailable in this browser' : 'Click to pair Phomemo printer')}
                            >
                                {printerType === 'virtual' ? <Cpu size={14} /> : <Bluetooth size={14} />}
                                <span className="hidden sm:inline">
                                    {printerType === 'virtual' ? (
                                        <>Virtual M110 <span className="lps-virtual-badge py-0 px-1 text-[8px] ml-1">VIRTUAL</span></>
                                    ) : (
                                        bleState === 'connected' ? (deviceName || 'M110 Connected') :
                                        bleState === 'connecting' ? 'Pairing...' :
                                        bleState === 'printing' ? `Printing ${printProgress.current}/${printProgress.total}` :
                                        bleState === 'error' ? 'BLE Error' :
                                        bleState === 'unsupported' ? 'BLE Unavailable' :
                                        'Connect Phomemo'
                                    )}
                                </span>
                            </button>

                            {/* Close */}
                            <button
                                onClick={handleClose}
                                className="w-11 h-11 liquid-control rounded-full flex items-center justify-center cursor-pointer shrink-0"
                                aria-label="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Horizontally Scrollable Mode Tabs Segmented Control (<= 820px) */}
                    <div className="lps-mode-tabs-scroll">
                        <div className="liquid-panel lps-seg-group flex items-center gap-0.5 p-0.5 w-full">
                            <button
                                onClick={() => setMode('studio')}
                                className={`flex-1 lps-tab-btn min-h-[40px] px-3 ${mode === 'studio' ? 'active' : ''}`}
                            >
                                Batch Studio ({labelInstances.length})
                            </button>
                            <button
                                onClick={() => setMode('history')}
                                className={`flex-1 lps-tab-btn min-h-[40px] px-3 ${mode === 'history' ? 'active' : ''}`}
                            >
                                History
                            </button>
                            <button
                                onClick={() => setMode('queue')}
                                className={`flex-1 lps-tab-btn min-h-[40px] px-3 ${mode === 'queue' ? 'active' : ''}`}
                            >
                                Queue
                            </button>
                            <button
                                onClick={() => setMode('verify')}
                                className={`flex-1 lps-tab-btn min-h-[40px] px-3 ${mode === 'verify' ? 'active' : ''}`}
                            >
                                Verify
                            </button>
                            <button
                                onClick={() => setMode('templates')}
                                className={`flex-1 lps-tab-btn min-h-[40px] px-3 ${mode === 'templates' ? 'active' : ''}`}
                            >
                                Templates
                            </button>
                        </div>
                    </div>

                    {/* Body Area */}
                    <div className="flex-1 flex overflow-hidden min-h-0 relative z-10">
                        {/* ── MODE 1: BATCH STUDIO ── */}
                        {mode === 'studio' && (
                            <div className="lps-studio-container">
                                {/* Side Panel (Stacks above Preview on <= 820px, 340px sidebar on > 820px) */}
                                <div className="lps-studio-sidebar">
                                    
                                    {/* SECTION 1: Stock & Branding (Collapsible on mobile) */}
                                    <div className={`lps-collapsible-section ${collapsedSections.stock ? 'is-collapsed' : ''}`}>
                                        <button
                                            type="button"
                                            onClick={() => toggleSection('stock')}
                                            className="lps-section-header"
                                        >
                                            <span className="lps-section-header-title">
                                                <span>STOCK & BRANDING</span>
                                                <span className="lps-text-muted text-[10px] font-mono font-normal">
                                                    ({activeLabelSize} mm · {logoVariant === 'ArtOfDecor' ? 'Decor' : 'Rare Earth'})
                                                </span>
                                            </span>
                                            <ChevronDown size={14} className="lps-section-chevron" />
                                        </button>
                                        <div className="lps-collapsible-content">
                                            {/* 1. Label Size Selector — Small segmented control with tiny inline caption */}
                                            <div className="flex items-center justify-between gap-2 shrink-0">
                                                <span className="lps-mini-label">
                                                    STOCK
                                                </span>
                                                <div className="liquid-panel lps-seg-group flex gap-0.5 p-0.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleLabelSizeChange('50x30')}
                                                        className={`lps-tab-btn lps-seg-sm tabular-figures ${activeLabelSize === '50x30' ? 'active' : ''}`}
                                                    >
                                                        50 × 30 mm
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleLabelSizeChange('50x50')}
                                                        className={`lps-tab-btn lps-seg-sm tabular-figures ${activeLabelSize === '50x50' ? 'active' : ''}`}
                                                    >
                                                        50 × 50 mm
                                                    </button>
                                                </div>
                                            </div>

                                            {/* 2. Branding Logo Selector — Larger visual choice chips */}
                                            <div className="flex flex-col gap-1 shrink-0">
                                                <span className="lps-mini-label">
                                                    BRANDING LOGO
                                                </span>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setLogoVariant('ArtOfDecor')}
                                                        className={`lps-logo-chip liquid-control flex items-center justify-center cursor-pointer transition-all ${logoVariant === 'ArtOfDecor' ? 'is-active' : 'opacity-65 hover:opacity-100'}`}
                                                        title="Art of Decor"
                                                    >
                                                        <img src={`${import.meta.env.BASE_URL}ArtOfDecorLogo.png`} alt="Art of Decor" className="h-7 max-w-[125px] object-contain lps-logo-invert" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setLogoVariant('RareEarth')}
                                                        className={`lps-logo-chip liquid-control flex items-center justify-center cursor-pointer transition-all ${logoVariant === 'RareEarth' ? 'is-active' : 'opacity-65 hover:opacity-100'}`}
                                                        title="Rare Earth Gallery"
                                                    >
                                                        <img src={`${import.meta.env.BASE_URL}REG_Logo.png`} alt="Rare Earth Gallery" className="h-7 max-w-[125px] object-contain" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECTION 2: Printer Hardware & Virtual Output Tray */}
                                    <div className={`lps-collapsible-section ${collapsedSections.printer ? 'is-collapsed' : ''}`}>
                                        <button
                                            type="button"
                                            onClick={() => toggleSection('printer')}
                                            className="lps-section-header"
                                        >
                                            <span className="lps-section-header-title">
                                                <span>PRINTER HARDWARE</span>
                                                <span className={`text-[10px] font-bold ${printerType === 'virtual' ? 'text-amber-400' : bleState === 'connected' ? 'text-emerald-400' : 'lps-text-muted'}`}>
                                                    {printerType === 'virtual' ? 'VIRTUAL' : bleState === 'connected' ? 'CONNECTED' : 'DISCONNECTED'}
                                                </span>
                                            </span>
                                            <ChevronDown size={14} className="lps-section-chevron" />
                                        </button>
                                        <div className="lps-collapsible-content">
                                            {/* 3. Printer Hardware — Compact Choice (Bluetooth vs Virtual) + Status + Controls */}
                                            <div className="liquid-panel lps-card lps-hardware-row p-2.5 flex flex-col gap-2 shrink-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    {/* Segmented choice between Phomemo (Bluetooth) and Virtual printer */}
                                                    <div className="liquid-panel lps-seg-group flex items-center p-0.5 text-[11px] font-bold">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPrinterType('bluetooth')}
                                                            className={`lps-tab-btn py-1 px-2.5 text-[10.5px] cursor-pointer flex items-center gap-1 ${printerType === 'bluetooth' ? 'active' : ''}`}
                                                            title={!isBluetoothSupported ? 'Web Bluetooth unavailable on iOS Safari' : 'Print to physical Phomemo M110 over Bluetooth'}
                                                        >
                                                            <Bluetooth size={11} />
                                                            <span>Phomemo (Bluetooth)</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPrinterType('virtual')}
                                                            className={`lps-tab-btn py-1 px-2.5 text-[10.5px] cursor-pointer flex items-center gap-1 ${printerType === 'virtual' ? 'active' : ''}`}
                                                            title="Simulate print run in-memory without physical printer or paper"
                                                        >
                                                            <Cpu size={11} />
                                                            <span>Virtual printer</span>
                                                        </button>
                                                    </div>

                                                    {/* Clear VIRTUAL badge if virtual is active */}
                                                    {printerType === 'virtual' && (
                                                        <span className="lps-virtual-badge shrink-0" title="Virtual printer active — zero paper or inventory tags modified">
                                                            VIRTUAL
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Device Status & Connect Actions */}
                                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--lq-rim-subtle)]">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                                                            bleState === 'connected' ? (printerType === 'virtual' ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-emerald-400 shadow-[0_0_8px_#34d399]') :
                                                            bleState === 'connecting' ? 'bg-blue-400 animate-ping' :
                                                            bleState === 'printing' ? 'bg-cyan-400 animate-pulse' :
                                                            bleState === 'error' ? 'bg-rose-400' :
                                                            'bg-[var(--lq-ink-muted)]'
                                                        }`} />
                                                        <span className="text-xs font-bold truncate">
                                                            {printerType === 'virtual'
                                                                ? (deviceName || 'Virtual M110')
                                                                : (deviceName || (bleState === 'connected' ? 'Phomemo M110' : bleState === 'connecting' ? 'Pairing...' : bleState === 'printing' ? 'Printing...' : 'Phomemo M110'))}
                                                        </span>
                                                    </div>

                                                    {printerType === 'virtual' ? (
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <select
                                                                value={virtualSpeedMultiplier}
                                                                onChange={e => setVirtualSpeedMultiplier(parseFloat(e.target.value) || 1.0)}
                                                                className="lps-field-input py-0.5 px-1.5 text-[10px] font-bold cursor-pointer"
                                                                title="Simulation Speed"
                                                            >
                                                                <option value="1">1x (Real)</option>
                                                                <option value="2">2x Speed</option>
                                                                <option value="5">5x Speed</option>
                                                                <option value="20">Max Speed</option>
                                                            </select>
                                                            <button
                                                                type="button"
                                                                onClick={() => setVirtualSimulatePaperOut(p => !p)}
                                                                className={`lps-micro-btn liquid-control cursor-pointer text-[10px] ${virtualSimulatePaperOut ? 'lps-tone-red border-rose-400 text-rose-400' : ''}`}
                                                                title="Simulate paper out / cover open error"
                                                            >
                                                                Paper out: {virtualSimulatePaperOut ? 'ON' : 'OFF'}
                                                            </button>
                                                        </div>
                                                    ) : !isBluetoothSupported ? (
                                                        <span className="text-[10px] lps-text-muted font-bold uppercase shrink-0" title="iOS Safari lacks Web Bluetooth; switch to Virtual printer">
                                                            No BLE (Use Virtual)
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={handleConnectPrinter}
                                                            disabled={bleState === 'connecting' || bleState === 'printing'}
                                                            className={`lps-micro-btn liquid-control cursor-pointer shrink-0 gap-1 ${bleState === 'connected' ? 'lps-tone-emerald' : ''}`}
                                                            title={bleState === 'connected' ? 'Click to re-pair Phomemo' : 'Click to connect Phomemo via Bluetooth'}
                                                        >
                                                            <Bluetooth size={11} />
                                                            <span>{bleState === 'connected' ? 'Re-pair' : bleState === 'connecting' ? 'Pairing' : 'Connect'}</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {bleError && (
                                                <span className="text-[10px] text-red-400 font-bold truncate px-1 -mt-1">
                                                    {bleError}
                                                </span>
                                            )}

                                            {/* Printed Output Tray (Shows decoded 1-bit monochrome raster labels) */}
                                            {virtualTray.length > 0 && (
                                                <div className="lps-output-tray shrink-0">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="lps-mini-label mb-0">PRINTED OUTPUT TRAY</span>
                                                            <span className="lps-virtual-badge">{virtualTray.length}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setVirtualTray([])}
                                                            className="lps-micro-btn liquid-control cursor-pointer text-[10px] lps-text-muted hover:text-rose-400"
                                                            title="Clear all decoded labels from tray"
                                                        >
                                                            Clear tray
                                                        </button>
                                                    </div>
                                                    <div className="lps-tray-strip">
                                                        {virtualTray.map((label, idx) => (
                                                            <div
                                                                key={label.id || idx}
                                                                className="lps-tray-item group relative"
                                                                onClick={() => setTrayModalLabel(label)}
                                                                title={`Click to inspect #${label.index} (${label.tagId}) large`}
                                                            >
                                                                <img
                                                                    src={label.dataUrl}
                                                                    alt={`Label ${label.tagId}`}
                                                                    className="lps-tray-thumb h-12 w-auto"
                                                                />
                                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                    <Eye size={12} className="text-white" />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* SECTION 3: Batch Copies */}
                                    <div className={`lps-collapsible-section ${collapsedSections.copies ? 'is-collapsed' : ''}`}>
                                        <button
                                            type="button"
                                            onClick={() => toggleSection('copies')}
                                            className="lps-section-header"
                                        >
                                            <span className="lps-section-header-title">
                                                <span>BATCH COPIES</span>
                                                <span className="lps-text-muted text-[10px] font-mono font-normal">
                                                    ({selectedItems.length} items · {labelInstances.length} labels)
                                                </span>
                                            </span>
                                            <ChevronDown size={14} className="lps-section-chevron" />
                                        </button>
                                        <div className="lps-collapsible-content">
                                            {/* 4. Per-Item Quantity Steppers */}
                                            <div className="flex-1 flex flex-col gap-1.5 min-h-[120px] overflow-hidden">
                                                <div className="flex items-center justify-between gap-1 shrink-0">
                                                    <span className="lps-mini-label">
                                                        COPIES ({selectedItems.length})
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSetAllCopies(1)}
                                                            className="lps-micro-btn liquid-control cursor-pointer"
                                                            title="Set all items to 1 label copy"
                                                        >
                                                            Set all to 1
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSetAllCopies(2)}
                                                            className="lps-micro-btn liquid-control cursor-pointer"
                                                            title="Set all items to 2 label copies"
                                                        >
                                                            x2
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex-1 overflow-y-auto max-h-[300px] flex flex-col gap-1.5 pr-0.5">
                                                    {selectedItems.map(item => {
                                                        const rowKey = String(item.row);
                                                        const currentQty = quantities[rowKey] ?? (Number(item.normData?.quantity) > 0 ? Number(item.normData.quantity) : 1);
                                                        const tagRow = item.data ? { ...item.data, book_barcode: item.codes?.bookBarcode || item.data.book_barcode } : item;
                                                        const desc = item.normData?.shortDescription || item.normData?.itemType || item.normData?.type || '';

                                                        return (
                                                            <div key={item.row} className="liquid-panel lps-card lps-batch-row flex items-center justify-between gap-2 p-1.5 md:p-2 text-xs">
                                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                    <ItemTag
                                                                        item={tagRow}
                                                                        exchangeRate={exchangeRate}
                                                                        workbook={workbookPrefix}
                                                                    />
                                                                    <span className="text-[11px] lps-text-secondary truncate flex-1 min-w-0 font-medium" title={desc}>
                                                                        {toTitleCase(desc)}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1 shrink-0 tabular-figures">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setQuantities(q => ({ ...q, [rowKey]: Math.max(1, currentQty - 1) }))}
                                                                        className="lps-stepper-btn liquid-control"
                                                                        aria-label="Decrease copies"
                                                                    >
                                                                        -
                                                                    </button>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        max="99"
                                                                        value={currentQty || 1}
                                                                        onChange={e => {
                                                                            const val = parseInt(e.target.value, 10);
                                                                            setQuantities(q => ({ ...q, [rowKey]: isNaN(val) ? 1 : Math.max(1, Math.min(99, val)) }));
                                                                        }}
                                                                        className="lps-qty-input tabular-figures"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setQuantities(q => ({ ...q, [rowKey]: Math.min(99, currentQty + 1) }))}
                                                                        className="lps-stepper-btn liquid-control"
                                                                        aria-label="Increase copies"
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECTION 4: Document Exports */}
                                    <div className={`lps-collapsible-section ${collapsedSections.exports ? 'is-collapsed' : ''}`}>
                                        <button
                                            type="button"
                                            onClick={() => toggleSection('exports')}
                                            className="lps-section-header"
                                        >
                                            <span className="lps-section-header-title">
                                                <span>DOCUMENT EXPORTS</span>
                                            </span>
                                            <ChevronDown size={14} className="lps-section-chevron" />
                                        </button>
                                        <div className="lps-collapsible-content">
                                            {/* 5. Secondary Exports */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleGeneratePDF}
                                                    disabled={progress.pdf > 0 && progress.pdf < 100}
                                                    className="lps-export-btn liquid-control lps-tone-red cursor-pointer flex items-center justify-center gap-1.5"
                                                >
                                                    <FileText size={13} />
                                                    <span>Control PDF</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleGenerateCatalog}
                                                    disabled={progress.catalog > 0 && progress.catalog < 100}
                                                    className="lps-export-btn liquid-control lps-tone-blue cursor-pointer flex items-center justify-center gap-1.5"
                                                >
                                                    <BookOpen size={13} />
                                                    <span>Catalog PDF</span>
                                                </button>
                                            </div>
                                            {progress.pdf === 100 && urls.pdf && (
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewTarget('control')}
                                                    className="w-full lps-export-btn liquid-control lps-tone-red cursor-pointer flex items-center justify-center gap-1.5"
                                                >
                                                    <Eye size={12} /> Review Control PDF
                                                </button>
                                            )}
                                            {progress.catalog === 100 && (urls.catalogReady || urls.catalogNotReady) && (
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewTarget('catalog')}
                                                    className="w-full lps-export-btn liquid-control lps-tone-blue cursor-pointer flex items-center justify-center gap-1.5"
                                                >
                                                    <Eye size={12} /> Review Catalog PDF
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Live Batch Preview Grid (Stacks below Side Panel on <= 820px) */}
                                <div className="lps-studio-preview">
                                    <PreviewLabels
                                        items={selectedItems}
                                        quantities={quantities}
                                        activeLabelSize={activeLabelSize}
                                        logoVariant={logoVariant}
                                        showChrome={false}
                                        designerRasters={designerRasters}
                                        onLaunchIframe={(_indices, instances) => {
                                            const items = instances.map(inst => inst.item);
                                            handleOpenDesigner(items.length > 0 ? items : undefined);
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* ── MODE 2: ABSORBED PRINT CENTER (History / Queue / Verify / Templates) ── */}
                        {mode !== 'studio' && (
                            <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto min-h-0">
                                {/* Mobile Sub-Mode Switcher for Print Center */}
                                <div className="md:hidden liquid-panel lps-seg-group flex items-center gap-1 mb-4 shrink-0">
                                    {(['history', 'queue', 'verify', 'templates'] as const).map(sub => (
                                        <button
                                            key={sub}
                                            onClick={() => setMode(sub)}
                                            className={`flex-1 lps-tab-btn lps-touch-target ${mode === sub ? 'active' : ''}`}
                                        >
                                            {sub}
                                        </button>
                                    ))}
                                </div>

                                {mode === 'history' && (
                                    <div className="flex flex-col items-center w-full max-w-5xl mx-auto gap-4">
                                        <div className="w-full flex items-center justify-between border-b border-[var(--lq-rim-subtle)] pb-4">
                                            <h3 className="text-lg font-bold">Print Job History</h3>
                                            <select
                                                value={season}
                                                onChange={e => setSeason(e.target.value as '825' | '826')}
                                                className="lps-field-input lps-touch-target px-3 py-1.5 text-xs font-bold cursor-pointer"
                                            >
                                                <option value="826">Season 826</option>
                                                <option value="825">Season 825 (Legacy)</option>
                                            </select>
                                        </div>
                                        <PrintJobsPanel season={season} />
                                    </div>
                                )}

                                {mode === 'queue' && (
                                    <div className="w-full max-w-5xl mx-auto">
                                        <LocalQueueTabContent />
                                    </div>
                                )}

                                {mode === 'verify' && (
                                    <div className="flex flex-col items-center justify-start h-full max-w-xl mx-auto w-full gap-6">
                                        <div className="text-center lps-text-secondary">
                                            <Search className="w-12 h-12 mb-2 opacity-50 mx-auto" />
                                            <p className="text-sm">Paste a document job ID to verify its ledger entry.</p>
                                        </div>
                                        <div className="flex w-full gap-2">
                                            <input
                                                type="text"
                                                value={verifyHash}
                                                onChange={e => setVerifyHash(e.target.value)}
                                                placeholder="Document Job ID or Hash..."
                                                className="flex-1 lps-field-input lps-touch-target px-4 py-3 text-sm"
                                            />
                                            <button
                                                onClick={() => handleVerify()}
                                                className="px-6 py-3 lps-btn-primary lps-touch-target font-bold text-xs uppercase cursor-pointer"
                                            >
                                                Verify
                                            </button>
                                        </div>

                                        {matchedJobs !== null && (
                                            matchedJobs.length === 0 ? (
                                                <div className="p-4 liquid-panel lps-card text-amber-500 text-xs text-center w-full">
                                                    No matching jobs found.
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2 w-full max-h-64 overflow-y-auto">
                                                    {matchedJobs.map(job => (
                                                        <div key={job.id} className="p-4 liquid-panel lps-card flex justify-between items-center text-xs">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold">{job.job_ref || job.id}</span>
                                                                <span className="lps-text-muted">{job.template_id} - Season {job.season}</span>
                                                            </div>
                                                            <button
                                                                onClick={() => handleVerifyJobRow(job.id)}
                                                                className="px-3 py-1.5 liquid-control lps-touch-target font-bold cursor-pointer"
                                                            >
                                                                Verify
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        )}

                                        <div
                                            className={`liquid-panel lps-card flex flex-col items-center justify-center border-2 border-dashed p-6 w-full ${dragActive ? 'lps-tone-blue' : 'lps-text-secondary'}`}
                                            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                                            onDragLeave={() => setDragActive(false)}
                                            onDrop={handleDrop}
                                        >
                                            <UploadCloud className="w-8 h-8 mb-2 opacity-60" />
                                            <span className="text-xs">Or drop snapshot JSON here to calculate SHA-256</span>
                                            {droppedHash && (
                                                <div className="mt-3 p-2 liquid-control text-xs font-mono break-all">
                                                    {droppedHash}
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={handleRunSelfTest}
                                            disabled={isTesting}
                                            className="px-6 py-2.5 liquid-control lps-touch-target text-xs font-bold uppercase cursor-pointer"
                                        >
                                            {isTesting ? 'Running Self-Test...' : 'Run Self-Test'}
                                        </button>
                                        {testResults && (
                                            <div className="w-full flex flex-col gap-2 mt-2">
                                                {testResults.map((res, i) => (
                                                    <div key={i} className="flex justify-between p-2.5 liquid-panel lps-card text-xs">
                                                        <span>{res.name}</span>
                                                        <span className={res.ok ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                                                            {res.ok ? 'Passed' : 'Failed'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {mode === 'templates' && (
                                    <div className="w-full max-w-5xl mx-auto">
                                        <TemplatesTabContent />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* End-of-job completion banner */}
                    {lastPrintJob && (
                        <div className="px-6 py-3 border-t border-[var(--lq-rim-subtle)] liquid-panel rounded-none flex items-center justify-between shrink-0 z-10">
                            <div className="flex items-center gap-4 text-xs">
                                <span className="font-bold text-emerald-500">Printed {lastPrintJob.labelCount} labels ({lastPrintJob.itemCount} items)</span>
                                <span className="lps-text-muted font-mono">Job: {lastPrintJob.jobId}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handlePrintAll(true)}
                                    className="px-3 py-1.5 liquid-control lps-touch-target text-xs font-bold uppercase cursor-pointer"
                                >
                                    Reprint Batch
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Sticky Bottom Action Bar (Thumb-Zone) */}
                    {mode === 'studio' && (
                        <div className="lps-bottom-bar relative z-10">
                            {/* Primary Full-Width Print Button on Mobile (<= 820px) */}
                            <button
                                type="button"
                                onClick={() => handlePrintAll(false)}
                                disabled={bleState === 'printing' || labelInstances.length === 0}
                                className="w-full min-[821px]:flex-1 order-1 min-[821px]:order-3 lps-btn-primary min-h-[48px] min-[821px]:min-h-[40px] px-4 min-[821px]:px-6 font-black text-xs min-[821px]:text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                            >
                                {bleState === 'printing' ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                        <span>PRINTING {printProgress.current} OF {printProgress.total}...</span>
                                    </>
                                ) : (
                                    <>
                                        <Printer size={16} strokeWidth={2.5} />
                                        <span>
                                            {bleState === 'connected' ? `PRINT ALL (${labelInstances.length} LABELS)` : `CONNECT & PRINT (${labelInstances.length})`}
                                        </span>
                                    </>
                                )}
                            </button>

                            {/* Secondary Actions: Compact row on mobile, inline on desktop */}
                            <div className="flex items-center gap-2 order-2 min-[821px]:order-1 shrink-0 w-full min-[821px]:w-auto">
                                {/* EDIT LABEL Button */}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        triggerFocusRef.current = e.currentTarget;
                                        handleOpenDesigner();
                                    }}
                                    className="flex-1 min-[821px]:flex-initial lps-bar-btn liquid-control min-h-[44px] min-[821px]:min-h-[36px] px-3 md:px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                                    title="Open Visual Phomemo Label Editor"
                                >
                                    <Sliders size={14} />
                                    <span>EDIT LABEL</span>
                                </button>

                                {/* BACKUP XLSX Button */}
                                <button
                                    type="button"
                                    onClick={handleGenerateXLSX}
                                    disabled={progress.xlsx > 0 && progress.xlsx < 100}
                                    className="flex-1 min-[821px]:flex-initial lps-bar-btn liquid-control lps-tone-emerald min-h-[44px] min-[821px]:min-h-[36px] px-3 md:px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                                    title="Download Backup XLSX"
                                >
                                    <FileSpreadsheet size={14} />
                                    <span>BACKUP XLSX</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── LIVE BATCH PRINT RUN VIEW OVERLAY ── */}
                {isLiveRunOpen && (
                    <div className="lps-live-overlay">
                        {/* Backdrop Scrim */}
                        <div 
                            className="lps-scrim absolute inset-0 cursor-pointer"
                            onClick={() => { if (runStatus === 'complete' || runStatus === 'cancelled') setIsLiveRunOpen(false); }}
                        />

                        {/* Sheet Container with Touch Swipe Dismissal */}
                        <div 
                            className="lps-live-sheet liquid-panel ui-root"
                            onTouchStart={handleLiveTouchStart}
                            onTouchEnd={handleLiveTouchEnd}
                        >
                            {/* Grabber Handle for Mobile Full-Screen Sheet */}
                            <div className="lps-sheet-grabber" />

                            {/* Top Bar Header */}
                            <div className="lps-live-header">
                                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-lg liquid-panel flex items-center justify-center text-[var(--main-color,#7FBBFF)] shrink-0">
                                        <Printer size={16} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xs sm:text-sm font-black tracking-wider uppercase truncate">
                                                LIVE BATCH PRINT RUN
                                            </h2>
                                            {(printerType === 'virtual' || (pendingPrintJobRef.current as any)?.isVirtual) && (
                                                <span className="lps-virtual-badge is-live">VIRTUAL</span>
                                            )}
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                                runStatus === 'running' ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' :
                                                runStatus === 'paused_chunk' || runStatus === 'paused_paper' ? 'bg-amber-500/20 text-amber-400' :
                                                runStatus === 'complete' ? 'bg-emerald-500/20 text-emerald-400' :
                                                runStatus === 'cancelled' ? 'bg-zinc-500/20 text-zinc-400' :
                                                'bg-rose-500/20 text-rose-400'
                                            }`}>
                                                {runStatus === 'running' ? 'PRINTING' :
                                                 runStatus === 'paused_chunk' ? 'PAUSED · CHUNK COMPLETE' :
                                                 runStatus === 'paused_paper' ? 'OUT OF PAPER' :
                                                 runStatus === 'complete' ? 'COMPLETE' :
                                                 runStatus === 'cancelled' ? 'CANCELLED' :
                                                 'ERROR'}
                                            </span>
                                        </div>
                                        <span className="text-[11px] lps-text-secondary font-mono mt-0.5 truncate">
                                            {pendingPrintJobRef.current?.jobId || 'BATCH_JOB'} · {activeLabelSize} mm · {logoVariant}
                                        </span>
                                    </div>
                                </div>

                                {/* Top Right Header Controls */}
                                <div className="flex items-center gap-2">
                                    {runStatus === 'running' && (
                                        <button
                                            type="button"
                                            onClick={handleCancelRun}
                                            className="lps-btn-cancel min-h-[44px] px-3 text-xs cursor-pointer"
                                        >
                                            Cancel Run
                                        </button>
                                    )}
                                    {(runStatus === 'complete' || runStatus === 'cancelled' || runStatus === 'error') && (
                                        <button
                                            type="button"
                                            onClick={() => setIsLiveRunOpen(false)}
                                            className="w-11 h-11 liquid-control rounded-full flex items-center justify-center cursor-pointer text-[var(--lq-ink)] shrink-0"
                                            aria-label="Close Live Run"
                                        >
                                            <X size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Body: Two columns (Desktop) / Stacked (Mobile) */}
                            <div className="lps-live-body">
                                {/* Left Column: Large Preview of Currently Printing Label */}
                                <div className="lps-live-preview-pane">
                                    <div className="lps-live-card-frame w-full max-w-md">
                                        <div className="flex items-center justify-between w-full mb-3 px-1">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2.5 h-2.5 rounded-full ${runStatus === 'running' ? 'bg-emerald-400 animate-ping' : runStatus === 'complete' ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
                                                <span className="text-xs font-black uppercase tracking-wider text-[var(--lq-ink)]">
                                                    {runStatus === 'complete' ? 'BATCH COMPLETE' : `PRINTING #${runCurrentIndex} OF ${runTotalLabels}`}
                                                </span>
                                            </div>
                                            <span className="text-[11px] lps-text-muted font-mono">
                                                {currentActiveInstance ? `Copy #${currentActiveInstance.index}` : ''}
                                            </span>
                                        </div>

                                        {/* Large 1-Bit Pixelated Label Preview */}
                                        {currentActiveInstance && (
                                            <div 
                                                className="relative overflow-hidden bg-white rounded shadow-md border border-black/10"
                                                style={{
                                                    width: activeLabelSize === '50x50' ? LABEL_WIDTH_50x50 : LABEL_WIDTH_50x30,
                                                    height: activeLabelSize === '50x50' ? LABEL_HEIGHT_50x50 : LABEL_HEIGHT_50x30,
                                                    imageRendering: 'pixelated',
                                                }}
                                            >
                                                <PixelLabelView 
                                                    instance={currentActiveInstance}
                                                    activeLabelSize={activeLabelSize}
                                                    logoVariant={logoVariant}
                                                    axoSvg={axoCache[currentActiveInstance.item.codes?.bookBarcode || '']}
                                                    is1Bit={true}
                                                    dataUrl={designerRasters[currentActiveInstance.item.codes?.bookBarcode || '']}
                                                />
                                            </div>
                                        )}

                                        {/* Hardware M110 Driver Raster Transmission Bar */}
                                        <div className="w-full mt-3 flex flex-col gap-1">
                                            <div className="flex items-center justify-between text-[10px] font-mono lps-text-secondary">
                                                <span>M110 DRIVER TRANSMISSION</span>
                                                <span>{runDriverProgress}%</span>
                                            </div>
                                            <div className="lps-driver-bar-track">
                                                <div className="lps-driver-bar-fill" style={{ width: `${runDriverProgress}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Telemetry & Live Done List */}
                                <div className="lps-live-telemetry-pane">
                                    {/* Overall Progress Meter */}
                                    <div className="lps-progress-bar-wrap">
                                        <div className="flex items-center justify-between text-xs font-bold">
                                            <span className="uppercase tracking-wider">Overall Progress</span>
                                            <span className="font-mono text-[var(--main-color,#7FBBFF)]">{runPercent}%</span>
                                        </div>
                                        <div className="lps-progress-bar-track">
                                            <div className="lps-progress-bar-fill" style={{ width: `${runPercent}%` }} />
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] lps-text-muted font-mono mt-0.5">
                                            <span>{doneList.length} of {runTotalLabels} labels confirmed printed</span>
                                            <span>Chunk {runChunkIndex} of {runTotalChunks} (50 / chunk)</span>
                                        </div>
                                    </div>

                                    {/* Telemetry Metrics 4-Grid */}
                                    <div className="lps-telemetry-grid">
                                        <div className="lps-telemetry-cell">
                                            <span className="text-[9px] lps-text-muted uppercase font-black tracking-wider">BATCH TIME</span>
                                            <span className="text-xs font-mono font-bold">{fmtDuration(elapsedBatchMs)}</span>
                                        </div>
                                        <div className="lps-telemetry-cell">
                                            <span className="text-[9px] lps-text-muted uppercase font-black tracking-wider">CHUNK TIME</span>
                                            <span className="text-xs font-mono font-bold">{fmtDuration(elapsedChunkMs)}</span>
                                        </div>
                                        <div className="lps-telemetry-cell">
                                            <span className="text-[9px] lps-text-muted uppercase font-black tracking-wider">LABEL TIME</span>
                                            <span className="text-xs font-mono font-bold">{fmtDuration(elapsedLabelMs)}</span>
                                        </div>
                                        <div className="lps-telemetry-cell">
                                            <span className="text-[9px] lps-text-muted uppercase font-black tracking-wider">ETA</span>
                                            <span className="text-xs font-mono font-bold text-[var(--main-color,#7FBBFF)]">
                                                {runStatus === 'complete' ? '0s' : fmtDuration(etaMs)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Pause Alert Banner (if paused on chunk of 50 or paper) */}
                                    {(runStatus === 'paused_chunk' || runStatus === 'paused_paper') && (
                                        <div className="lps-pause-banner">
                                            <div className="flex items-center gap-2">
                                                <AlertCircle size={18} className="shrink-0" />
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-xs">
                                                        {runStatus === 'paused_paper' ? 'Out of Paper!' : `Chunk ${runChunkIndex} Complete (50 Labels)`}
                                                    </span>
                                                    <span className="text-[11px] opacity-80">
                                                        {runStatus === 'paused_paper' ? 'Load paper roll and resume print.' : 'Check roll and click to print next 50 labels.'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleResumeChunk}
                                                    className="lps-btn-resume"
                                                >
                                                    <Play size={12} fill="currentColor" />
                                                    <span>{runStatus === 'paused_paper' ? 'Resume Print' : 'Print Next 50'}</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Final Summary Card on Completion */}
                                    {runStatus === 'complete' && (
                                        <div className="lps-final-summary-card">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 size={20} className="text-emerald-400" />
                                                    <div>
                                                        <h4 className="text-sm font-bold text-emerald-400">Batch Print Complete</h4>
                                                        <span className="text-xs lps-text-muted">All physical labels reported successfully.</span>
                                                    </div>
                                                </div>
                                                <span className="lps-checksum-badge">
                                                    <ShieldCheck size={12} />
                                                    <span>VERIFIED {pendingPrintJobRef.current?.checksum?.slice(0, 8)}</span>
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2 text-xs">
                                                <div className="p-2 liquid-control rounded-lg flex flex-col">
                                                    <span className="text-[9px] lps-text-muted uppercase font-bold">TOTAL PRINTED</span>
                                                    <span className="text-sm font-black font-mono text-[var(--main-color,#7FBBFF)]">{doneList.length}</span>
                                                </div>
                                                <div className="p-2 liquid-control rounded-lg flex flex-col">
                                                    <span className="text-[9px] lps-text-muted uppercase font-bold">TOTAL DURATION</span>
                                                    <span className="text-sm font-black font-mono">{fmtDuration(elapsedBatchMs)}</span>
                                                </div>
                                                <div className="p-2 liquid-control rounded-lg flex flex-col">
                                                    <span className="text-[9px] lps-text-muted uppercase font-bold">JOB ID</span>
                                                    <span className="text-sm font-black font-mono truncate">{lastPrintJob?.jobId || pendingPrintJobRef.current?.jobId}</span>
                                                </div>
                                            </div>

                                            {/* Printed Output Tray in Live Completion Card */}
                                            {virtualTray.length > 0 && (
                                                <div className="pt-2 border-t border-[var(--lq-rim-subtle)] flex flex-col gap-1.5">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="font-bold lps-text-secondary uppercase text-[10px]">Printed Output Tray ({virtualTray.length})</span>
                                                        <span className="text-[10px] lps-text-muted">Click thumbnail to inspect large</span>
                                                    </div>
                                                    <div className="lps-tray-strip py-1">
                                                        {virtualTray.map((label, idx) => (
                                                            <div
                                                                key={label.id || idx}
                                                                className="lps-tray-item group relative"
                                                                onClick={() => setTrayModalLabel(label)}
                                                                title={`Click to inspect #${label.index} (${label.tagId}) large`}
                                                            >
                                                                <img
                                                                    src={label.dataUrl}
                                                                    alt={`Label ${label.tagId}`}
                                                                    className="lps-tray-thumb h-12 w-auto"
                                                                />
                                                                {label.barcodeCheck && (
                                                                    <span className={`absolute top-0.5 left-0.5 px-1 py-0.2 rounded text-[7.5px] font-black uppercase font-mono tracking-wider shadow ${
                                                                        label.barcodeCheck.passed ? 'bg-sky-500 text-black' : 'bg-rose-500 text-white'
                                                                    }`}>
                                                                        {label.barcodeCheck.passed ? `${label.barcodeCheck.moduleWidth}DOT` : 'ERR'}
                                                                    </span>
                                                                )}
                                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                    <Eye size={12} className="text-white" />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-2 pt-1">
                                                {failedList.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={handleReprintFailed}
                                                        className="px-3 py-1.5 rounded-lg liquid-control text-xs font-bold text-rose-400 hover:bg-rose-500/10 cursor-pointer flex items-center gap-1.5"
                                                    >
                                                        <RotateCcw size={13} />
                                                        <span>Reprint Failed ({failedList.length})</span>
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={handleReprintEntireBatch}
                                                    className="px-3 py-1.5 rounded-lg liquid-control text-xs font-bold uppercase cursor-pointer flex items-center gap-1.5"
                                                >
                                                    <RotateCcw size={13} />
                                                    <span>Reprint Batch</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsLiveRunOpen(false)}
                                                    className="ml-auto px-5 py-1.5 rounded-lg lps-btn-primary text-xs font-bold uppercase cursor-pointer"
                                                >
                                                    Done
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Live Done List Container */}
                                    <div className="lps-live-done-box flex-1 min-h-[160px]">
                                        <div className="px-3 py-2 border-b border-[var(--lq-rim-subtle)] flex items-center justify-between text-[11px] font-bold shrink-0">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 size={13} className="text-emerald-400" />
                                                <span className="uppercase tracking-wider">Done List ({doneList.length})</span>
                                            </div>
                                            <span className="text-[10px] lps-text-muted font-mono">Latest first</span>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1">
                                            {doneList.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-full text-center p-6 lps-text-muted text-xs">
                                                    <Clock size={20} className="mb-1 opacity-40 animate-spin" />
                                                    <span>Awaiting physical label confirmation from driver...</span>
                                                </div>
                                            ) : (
                                                doneList.map((entry, idx) => (
                                                    <div key={`${entry.tagId}-${entry.index}-${idx}`} className="lps-done-item-row liquid-control rounded-lg">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="text-[10px] font-mono font-bold text-[var(--lq-ink-muted)] w-5">
                                                                #{entry.index}
                                                            </span>
                                                            <ItemTag 
                                                                item={entry.item}
                                                                exchangeRate={exchangeRate}
                                                                workbook={workbookPrefix}
                                                                size="md"
                                                            />
                                                            {entry.dataUrl && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setTrayModalLabel({
                                                                        id: `done-${entry.index}`,
                                                                        tagId: entry.tagId,
                                                                        dataUrl: entry.dataUrl!,
                                                                        index: entry.index,
                                                                        timestamp: Date.now(),
                                                                        item: entry.item,
                                                                    })}
                                                                    className="lps-tray-item shrink-0 h-6 w-auto overflow-hidden rounded border border-black/10 cursor-pointer"
                                                                    title={`Inspect decoded 1-bit label #${entry.index}`}
                                                                >
                                                                    <img src={entry.dataUrl} alt="Thumb" className="h-full w-auto object-contain image-rendering-pixelated" />
                                                                </button>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-[10px] font-mono lps-text-secondary">
                                                                +{fmtDuration(entry.durationMs)}
                                                            </span>
                                                            <span className="lps-checksum-badge">
                                                                <Check size={10} strokeWidth={3} />
                                                                <span>{entry.checksum}</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── DESIGNER IFRAME MODAL OVERLAY ── */}
                <div 
                    ref={designerOverlayRef}
                    tabIndex={-1}
                    className={`lps-designer-overlay fixed inset-0 flex flex-col liquid-surface rounded-none outline-none ${
                        isDesignerUserActive 
                            ? 'opacity-100 pointer-events-auto z-[100050]' 
                            : 'opacity-0 pointer-events-none -z-10 is-hidden'
                    }`}
                >
                    <div className="lps-header px-6 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleCloseDesigner}
                                className="lps-touch-target px-3 py-1.5 liquid-control text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                            >
                                <ArrowLeft size={16} />
                                Back to Batch Studio
                            </button>
                            <span className="text-sm font-bold">Phomemo Visual Designer</span>
                        </div>
                        <button
                            onClick={handleCloseDesigner}
                            className="lps-touch-target liquid-control rounded-full flex items-center justify-center cursor-pointer"
                            aria-label="Close Visual Designer"
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <div className="flex-1 w-full h-full relative">
                        <iframe
                            ref={iframeRef}
                            src={`${import.meta.env.BASE_URL}phomemo-designer/index.html?theme=${theme}`}
                            className="w-full h-full border-none bg-transparent"
                            title="Phomemo Designer"
                            allow="bluetooth"
                            onLoad={handleIframeLoad}
                        />
                    </div>
                </div>

                {/* ── VIRTUAL TRAY LABEL INSPECTION MODAL ── */}
                {trayModalLabel && (
                    <div className="lps-tray-modal">
                        <div className="lps-tray-modal-scrim" onClick={() => setTrayModalLabel(null)} />
                        <div 
                            className="lps-tray-modal-card"
                            onTouchStart={handleTrayTouchStart}
                            onTouchEnd={handleTrayTouchEnd}
                        >
                            {/* Sheet Grabber for Mobile Full-Screen Sheet */}
                            <div className="lps-sheet-grabber" />

                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="lps-virtual-badge shrink-0">VIRTUAL</span>
                                    <span className="text-xs font-bold tabular-figures font-mono truncate">{trayModalLabel.tagId}</span>
                                    <span className="text-[11px] lps-text-muted shrink-0">#{trayModalLabel.index}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            triggerFocusRef.current = e.currentTarget;
                                            const targetItem = trayModalLabel.item || selectedItems.find(it => (it.codes?.bookBarcode || '') === trayModalLabel.tagId) || selectedItems[0];
                                            handleOpenDesigner(targetItem ? [targetItem] : undefined);
                                        }}
                                        className="lps-micro-btn liquid-control cursor-pointer flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-bold"
                                        title="Edit this label in Visual Designer"
                                    >
                                        <Sliders size={13} />
                                        <span className="hidden sm:inline">Edit in Designer</span>
                                    </button>
                                    <a
                                        href={trayModalLabel.dataUrl}
                                        download={`virtual-label-${trayModalLabel.tagId || 'print'}.png`}
                                        className="lps-micro-btn liquid-control cursor-pointer flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-bold"
                                        title="Download 1-bit monochrome PNG"
                                    >
                                        <Download size={13} />
                                        <span className="hidden sm:inline">Download PNG</span>
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => setTrayModalLabel(null)}
                                        className="w-11 h-11 liquid-control rounded-full flex items-center justify-center cursor-pointer shrink-0"
                                        aria-label="Close"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* Thermal Scanline Integer Module Diagnostics Panel */}
                            {trayModalLabel.barcodeCheck && (
                                <div className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1.5 ${
                                    trayModalLabel.barcodeCheck.passed 
                                        ? 'bg-sky-950/30 border-sky-500/40 text-sky-300' 
                                        : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                                }`}>
                                    <div className="flex items-center justify-between font-bold">
                                        <span className="flex items-center gap-1.5 font-mono text-[11px]">
                                            <span className={`w-2 h-2 rounded-full ${trayModalLabel.barcodeCheck.passed ? 'bg-sky-400' : 'bg-rose-400'}`} />
                                            THERMAL SCANLINE INTEGER MODULE CHECK: {trayModalLabel.barcodeCheck.passed ? 'PASS (100% Integer Dots)' : 'FAIL'}
                                        </span>
                                        <span className="font-mono text-[10px] opacity-80">
                                            {trayModalLabel.barcodeCheck.barCount} bars on raster line {trayModalLabel.barcodeCheck.scanline}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono pt-1 border-t border-current/20">
                                        <div><span className="opacity-70">MODULE:</span> {trayModalLabel.barcodeCheck.moduleWidth} dots ({trayModalLabel.barcodeCheck.moduleWidth * 0.125} mm)</div>
                                        <div><span className="opacity-70">CHECKED BARS:</span> {trayModalLabel.barcodeCheck.barCount}</div>
                                        <div><span className="opacity-70">NON-INTEGER BARS:</span> {trayModalLabel.barcodeCheck.nonMultipleBars.length}</div>
                                        <div><span className="opacity-70">HEAD RASTER:</span> 384 dots (48 bytes)</div>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-center p-4 bg-white/5 rounded-lg border border-[var(--lq-rim-subtle)] overflow-auto max-h-[70vh]">
                                <img
                                    src={trayModalLabel.dataUrl}
                                    alt={`Decoded Label ${trayModalLabel.tagId}`}
                                    className="max-h-[60vh] w-auto shadow-lg"
                                    style={{ imageRendering: 'pixelated' }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>,
        document.body
    );
};
