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
    CheckCircle2, ChevronRight, ChevronLeft, Zap, AlertCircle, Eye,
    RefreshCw, Layers, Sparkles, Cpu, History, Search, UploadCloud,
    Sliders, Smartphone, Check, ArrowLeft, ShieldAlert, Activity, BookOpen
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
import { M110Driver } from '../../utils/PhomemoM110';
import {
    buildItemLabelSpec,
    renderLabelToCanvas,
    ItemLabelOptions
} from './renderers/labelRenderer';
import { recordExport, trackDocumentJob, getRecentTracked, TrackedJob } from './jobTracking';
import { PdfPreview, PdfDocumentSource } from '../../components/PdfPreview';
import { PreviewLabels } from '../../components/PreviewLabels';
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
import './labelPrintStudio.css';

type StudioMode = 'studio' | 'history' | 'queue' | 'verify' | 'templates';
type MobileTab = 'preview' | 'controls' | 'center';
type BleStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'printing' | 'error';

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

    // Bluetooth Driver State Machine
    const isBluetoothSupported = typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
    const driverRef = useRef<M110Driver>(new M110Driver());
    const [bleState, setBleState] = useState<BleStatus>(isBluetoothSupported ? 'disconnected' : 'unsupported');
    const [deviceName, setDeviceName] = useState<string | null>(null);
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

    // Designer Iframe Refs
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const pendingBatchRef = useRef<any>(null);

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

    // Check BLE support on mount
    useEffect(() => {
        if (!isBluetoothSupported) {
            setBleState('unsupported');
        } else if (driverRef.current.isConnected()) {
            setBleState('connected');
        }
    }, [isBluetoothSupported]);

    // Close handler
    const handleClose = () => {
        setIsOpen(false);
        setIsPrintCenterOpen(false);
        setIsDesignerOpen(false);
    };

    // Bluetooth Connect
    const handleConnectBluetooth = async () => {
        if (!isBluetoothSupported) {
            toast.error("Web Bluetooth is not supported in this browser.");
            return;
        }
        setBleState('connecting');
        setBleError(null);
        try {
            const name = await driverRef.current.connect();
            setDeviceName(name || 'Phomemo M110');
            setBleState('connected');
            toast.success(`Paired with ${name || 'Phomemo M110'}`);
        } catch (e: any) {
            console.error('Bluetooth connection failed:', e);
            setBleState('error');
            setBleError(e?.message || 'Bluetooth pairing failed');
            toast.error(e?.message || 'Bluetooth connection failed');
        }
    };

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
    const commitPrintJob = useCallback(async (detail: {
        jobId: string;
        checksum: string;
        ids: string[];
        tagById: Record<string, string>;
        printedTags: string[];
        labelCount: number;
        isReprint: boolean;
        labelSize: string;
        source?: string;
    }) => {
        const { jobId, checksum, ids, tagById, printedTags, labelCount, isReprint, labelSize, source } = detail;
        const stamp = new Date().toISOString();

        const perTag = new Map<string, number>();
        printedTags.forEach(t => perTag.set(t, (perTag.get(t) || 0) + 1));

        try {
            const { error: jobErr } = await supabase.from('print_jobs').insert({
                id: jobId,
                checksum,
                printed_at: stamp,
                printed_by: user?.email || user?.name || null,
                label_count: labelCount,
                item_count: ids.length,
                is_reprint: isReprint,
                label_size: labelSize,
                source: source || 'batch',
            });
            if (jobErr) console.warn('[LabelPrintStudio] print_jobs insert notice:', jobErr);

            const rows = ids.map((id: string) => {
                const tag = tagById?.[id] || '';
                return {
                    job_id: jobId,
                    inventory_id: id,
                    tag_id: tag,
                    labels_printed: perTag.get(tag) ?? 1,
                };
            });

            for (let i = 0; i < rows.length; i += 100) {
                const { error: itemErr } = await supabase.from('print_job_items').insert(rows.slice(i, i + 100));
                if (itemErr) console.warn('[LabelPrintStudio] print_job_items notice:', itemErr);
            }

            recordExport({
                templateId: 'lbl-item-template-v4',
                kind: 'label',
                season: '826',
                legacyPrintJobId: jobId,
                getSnapshot: () => rows
            });

            if (!isReprint) {
                for (let i = 0; i < ids.length; i += 50) {
                    await supabase.from('inventory').update({
                        print_date: stamp,
                        print_job_checksum: checksum,
                        print_job_id: jobId,
                        updated_at: stamp,
                    }).in('id', ids.slice(i, i + 50));
                }
            }

            setLastPrintJob({ jobId, labelCount, itemCount: ids.length, at: stamp, isReprint });
            toast.success(`Logged ${labelCount} label${labelCount !== 1 ? 's' : ''} across ${ids.length} item${ids.length !== 1 ? 's' : ''}`);
        } catch (e: any) {
            console.error('[LabelPrintStudio] commitPrintJob error:', e);
        }
    }, [user]);

    // Helper to render label to Canvas
    const renderLabelInstanceToCanvas = async (item: any, size: '50x30' | '50x50', logo: 'ArtOfDecor' | 'RareEarth', axoDataUrl?: string) => {
        let axoImg: HTMLImageElement | undefined = undefined;
        if (axoDataUrl) {
            try {
                axoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = axoDataUrl;
                });
            } catch {
                // skip
            }
        }

        let logoImg: HTMLImageElement | undefined = undefined;
        if (size === '50x50') {
            try {
                logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = logo === 'RareEarth' ? RareEarthLogoBase64 : ART_OF_DECOR_LOGO;
                });
            } catch {
                // skip
            }
        }

        const tag = item.codes?.bookBarcode || '';
        const options: ItemLabelOptions = {
            tagId: tag,
            qrData: tag,
            axoImage: axoImg,
            labelSize: size,
            logoVariant: logo,
            logoImage: logoImg
        };

        const spec = buildItemLabelSpec(item, options);
        return renderLabelToCanvas(spec);
    };

    // Direct Print All
    const handlePrintAll = async (isReprint = false) => {
        if (labelInstances.length === 0) {
            toast.error("No labels selected to print");
            return;
        }

        if (!isBluetoothSupported) {
            toast.error("Direct Bluetooth requires Chrome, Edge, or Bluefy on iOS. Generating Backup XLSX instead.");
            handleGenerateXLSX();
            return;
        }

        if (!driverRef.current.isConnected()) {
            try {
                await handleConnectBluetooth();
            } catch {
                return;
            }
        }

        if (!driverRef.current.isConnected()) {
            toast.error("Please connect your Phomemo printer first");
            return;
        }

        setBleState('printing');
        setPrintProgress({ current: 0, total: labelInstances.length });
        cancelPrintRef.current = false;

        const tagById: Record<string, string> = {};
        selectedItems.forEach((it: any) => {
            const id = it.row ?? it.data?.id ?? it.id;
            if (id) tagById[String(id)] = String(it.codes?.bookBarcode || '');
        });

        const printedTags: string[] = [];
        const jobId = `PJ-${Date.now().toString(36).toUpperCase()}`;

        try {
            for (let i = 0; i < labelInstances.length; i++) {
                if (cancelPrintRef.current) {
                    ((toast as any).info || toast)(`Printing paused after ${i} labels`);
                    break;
                }
                setPrintProgress({ current: i + 1, total: labelInstances.length });
                const inst = labelInstances[i];
                const item = inst.item;
                const tag = String(item.codes?.bookBarcode || '');

                const canvas = await renderLabelInstanceToCanvas(item, activeLabelSize, logoVariant, axoCache[tag]);
                await driverRef.current.printCanvas(canvas);
                printedTags.push(tag);
            }

            if (printedTags.length > 0) {
                const checksum = await computeJobChecksum({
                    jobId,
                    tags: printedTags,
                    size: activeLabelSize,
                    at: new Date().toISOString()
                });

                await commitPrintJob({
                    jobId,
                    checksum,
                    ids: selectedItems.map((it: any) => it.row ?? it.data?.id ?? it.id).filter(Boolean).map(String),
                    tagById,
                    printedTags,
                    labelCount: printedTags.length,
                    isReprint,
                    labelSize: activeLabelSize,
                    source: 'batch'
                });
                setBleState('connected');
                toast.success(`Printed ${printedTags.length} labels successfully!`);
            }
        } catch (err: any) {
            console.error('[LabelPrintStudio] Direct print streaming error:', err);
            setBleState('error');
            setBleError(err?.message || 'Print streaming failed');
            toast.error(`Printing error: ${err?.message || 'Printer disconnected'}`);
        } finally {
            setPrintProgress({ current: 0, total: 0 });
        }
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
                return [c.bookBarcode, desc, matColor, sizes, count, c.bookLandCode, c.bookAqCode, bookRetailTag, qrUrl];
            });

            const blob = await exportToXLSX(`Labels_${name}`, [{
                name: 'Packing List',
                data: [['TAGID', 'DESCRIPTION', 'MATERIAL COLOR', 'SIZES', 'QUANTITY', 'LANDED CODE', 'ACQ CODE', 'BOOK RETAIL', 'QR URL'], ...rows]
            }], {}, 'blob');

            if (blob instanceof Blob) {
                setUrlSlot('xlsx', URL.createObjectURL(blob));
                setProgress(p => ({ ...p, xlsx: 100 }));
                toast.success(tr("Backup XLSX generated"));
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `Labels_${name}.xlsx`;
                a.click();
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
    const handleOpenDesigner = () => {
        setIsDesignerOpen(true);
    };

    // Iframe designer message handler
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'PRINT_COMPLETE' || event.data?.type === 'PRINT_DONE') {
                const printedTags = Array.isArray(event.data.payload?.printedTags) ? event.data.payload.printedTags : [];
                const tagById: Record<string, string> = {};
                selectedItems.forEach((it: any) => {
                    const id = it.row ?? it.data?.id ?? it.id;
                    if (id) tagById[String(id)] = String(it.codes?.bookBarcode || '');
                });

                commitPrintJob({
                    jobId: `PJ-${Date.now().toString(36).toUpperCase()}`,
                    checksum: '',
                    ids: selectedItems.map((it: any) => it.row ?? it.data?.id ?? it.id).filter(Boolean).map(String),
                    tagById,
                    printedTags,
                    labelCount: printedTags.length || selectedItems.length,
                    isReprint: false,
                    labelSize: activeLabelSize,
                    source: 'designer'
                });
            }
            if (event.data?.type === 'CLOSE_WIZARD') {
                setIsDesignerOpen(false);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [commitPrintJob, selectedItems, activeLabelSize]);

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
                {/* Backdrop Click */}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-3xl" onClick={handleClose} />

                {/* Master Window Shell (Liquid Panel) */}
                <div className="lps-sheet liquid-panel relative z-10 text-[var(--lq-ink,var(--text-color,#fff))]">
                    
                    {/* Top Bar (Liquid Surface) */}
                    <div className="lps-header liquid-surface relative">
                        <div className="flex items-center gap-3 md:gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-[var(--main-color,#7FBBFF)] text-black flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(var(--main-color-rgb,127,187,255),0.4)]">
                                <Printer size={20} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm md:text-base font-black tracking-wider uppercase truncate">
                                        PHOMEMO PRINT STUDIO
                                    </h2>
                                    <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 uppercase tracking-widest text-[var(--secondary-text-color)]">
                                        M110 / M120
                                    </span>
                                </div>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="bg-transparent border-none outline-none font-bold text-xs md:text-sm text-[var(--main-color,#7FBBFF)] uppercase tracking-tight p-0 mt-0.5"
                                    placeholder="BATCH NAME"
                                />
                            </div>
                        </div>

                        {/* Center Readout & Mode Switchers (Desktop) */}
                        <div className="hidden md:flex items-center gap-2 lg:gap-3">
                            <div className="flex items-center gap-4 px-3 py-1.5 rounded-xl border border-[var(--border-color,rgba(255,255,255,0.1))] bg-black/20 text-xs font-bold mr-2">
                                <div>
                                    <span className="opacity-40 uppercase text-[9px] block">TYPES</span>
                                    <span className="tabular-nums text-[var(--main-color,#7FBBFF)]">{selectedItems.length}</span>
                                </div>
                                <div className="w-px h-5 bg-white/10" />
                                <div>
                                    <span className="opacity-40 uppercase text-[9px] block">LABELS</span>
                                    <span className="tabular-nums text-[var(--main-color,#7FBBFF)]">{labelInstances.length}</span>
                                </div>
                            </div>

                            {/* Mode Tabs */}
                            <div className="flex items-center p-1 rounded-xl bg-black/30 border border-white/5">
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
                        <div className="flex items-center gap-2 md:gap-3 shrink-0">
                            {/* Bluetooth status button / pill */}
                            <button
                                onClick={handleConnectBluetooth}
                                disabled={bleState === 'connecting' || bleState === 'printing' || !isBluetoothSupported}
                                className={`lps-status-pill liquid-control lps-touch-target cursor-pointer border ${
                                    bleState === 'connected' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' :
                                    bleState === 'connecting' ? 'border-blue-500/50 bg-blue-500/10 text-blue-400 animate-pulse' :
                                    bleState === 'printing' ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400 animate-pulse' :
                                    bleState === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-400' :
                                    bleState === 'unsupported' ? 'border-white/10 bg-white/5 text-white/40 cursor-default' :
                                    'border-white/20 bg-white/5 text-white/70 hover:bg-white/10'
                                }`}
                                title={!isBluetoothSupported ? 'Web Bluetooth unavailable in this browser' : 'Click to pair Phomemo printer'}
                            >
                                <Bluetooth size={14} className={bleState === 'connected' ? 'text-emerald-400' : ''} />
                                <span className="hidden sm:inline">
                                    {bleState === 'connected' ? (deviceName || 'M110 Connected') :
                                     bleState === 'connecting' ? 'Pairing...' :
                                     bleState === 'printing' ? `Printing ${printProgress.current}/${printProgress.total}` :
                                     bleState === 'error' ? 'BLE Error' :
                                     bleState === 'unsupported' ? 'BLE Unavailable' :
                                     'Connect Phomemo'}
                                </span>
                            </button>

                            {/* Close */}
                            <button
                                onClick={handleClose}
                                className="lps-touch-target rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Mobile Navigation Segmented Switcher (< 768px) */}
                    <div className="md:hidden flex items-center justify-around border-b border-[var(--border-color,rgba(255,255,255,0.1))] bg-black/40 p-2 shrink-0">
                        <button
                            onClick={() => { setMode('studio'); setMobileTab('preview'); }}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${mode === 'studio' && mobileTab === 'preview' ? 'bg-[var(--main-color)] text-black' : 'text-white/60'}`}
                        >
                            Preview ({labelInstances.length})
                        </button>
                        <button
                            onClick={() => { setMode('studio'); setMobileTab('controls'); }}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${mode === 'studio' && mobileTab === 'controls' ? 'bg-[var(--main-color)] text-black' : 'text-white/60'}`}
                        >
                            Controls & Sizes
                        </button>
                        <button
                            onClick={() => { setMode(mode === 'studio' ? 'history' : mode); setMobileTab('center'); }}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${mode !== 'studio' || mobileTab === 'center' ? 'bg-[var(--main-color)] text-black' : 'text-white/60'}`}
                        >
                            Print Center
                        </button>
                    </div>

                    {/* Body Area */}
                    <div className="flex-1 flex overflow-hidden min-h-0 relative">
                        {/* ── MODE 1: BATCH STUDIO ── */}
                        {mode === 'studio' && (
                            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
                                {/* Left Column: Control Pad (Desktop fixed 360px / Mobile conditionally rendered) */}
                                <div className={`w-full md:w-[360px] md:border-r border-[var(--border-color,rgba(255,255,255,0.1))] flex flex-col shrink-0 overflow-y-auto p-4 md:p-6 gap-6 bg-black/20 ${mobileTab === 'controls' || window.innerWidth >= 768 ? 'flex' : 'hidden md:flex'}`}>
                                    
                                    {/* 1. Label Size Selector */}
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--secondary-text-color,rgba(255,255,255,0.5))]">
                                            LABEL SIZE (STOCK)
                                        </label>
                                        <div className="flex bg-black/40 border border-white/10 rounded-xl p-1 gap-1">
                                            <button
                                                onClick={() => handleLabelSizeChange('50x30')}
                                                className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeLabelSize === '50x30' ? 'bg-[var(--main-color,#7FBBFF)] text-black shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                                            >
                                                50 × 30 mm
                                            </button>
                                            <button
                                                onClick={() => handleLabelSizeChange('50x50')}
                                                className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeLabelSize === '50x50' ? 'bg-[var(--main-color,#7FBBFF)] text-black shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                                            >
                                                50 × 50 mm
                                            </button>
                                        </div>
                                    </div>

                                    {/* 2. Branding Logo Selector */}
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--secondary-text-color,rgba(255,255,255,0.5))]">
                                            BRANDING LOGO
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => setLogoVariant('ArtOfDecor')}
                                                className={`p-3 rounded-xl border flex items-center justify-center transition-all ${logoVariant === 'ArtOfDecor' ? 'border-[var(--main-color)] bg-[var(--main-color)]/10 shadow-[0_0_10px_rgba(var(--main-color-rgb),0.2)]' : 'border-white/10 bg-black/30 opacity-50 hover:opacity-100'}`}
                                            >
                                                <img src={`${import.meta.env.BASE_URL}ArtOfDecorLogo.png`} alt="Art of Decor" className="h-6 object-contain invert" />
                                            </button>
                                            <button
                                                onClick={() => setLogoVariant('RareEarth')}
                                                className={`p-3 rounded-xl border flex items-center justify-center transition-all ${logoVariant === 'RareEarth' ? 'border-[var(--main-color)] bg-[var(--main-color)]/10 shadow-[0_0_10px_rgba(var(--main-color-rgb),0.2)]' : 'border-white/10 bg-black/30 opacity-50 hover:opacity-100'}`}
                                            >
                                                <img src={`${import.meta.env.BASE_URL}REG_Logo.png`} alt="Rare Earth Gallery" className="h-6 object-contain" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* 3. Bluetooth Connection Card */}
                                    <div className="p-4 rounded-2xl border border-[var(--border-color,rgba(255,255,255,0.1))] bg-black/30 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--secondary-text-color,rgba(255,255,255,0.5))]">
                                                PRINTER HARDWARE
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-2 h-2 rounded-full ${bleState === 'connected' ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : bleState === 'connecting' ? 'bg-blue-400 animate-ping' : bleState === 'printing' ? 'bg-cyan-400 animate-pulse' : 'bg-white/30'}`} />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                                                    {bleState}
                                                </span>
                                            </div>
                                        </div>

                                        {!isBluetoothSupported ? (
                                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed flex items-start gap-2">
                                                <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-400" />
                                                <span>
                                                    Direct Bluetooth requires Chrome, Edge, or Bluefy on iOS. You can still preview labels, edit designs, or export Backup XLSX & PDF.
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={handleConnectBluetooth}
                                                    disabled={bleState === 'connecting' || bleState === 'printing'}
                                                    className="w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 disabled:opacity-50"
                                                >
                                                    <Bluetooth size={16} />
                                                    {bleState === 'connected' ? `Re-pair (${deviceName || 'Phomemo'})` : 'Connect Bluetooth'}
                                                </button>
                                                {bleError && (
                                                    <span className="text-[10px] text-red-400 font-bold truncate">
                                                        {bleError}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* 4. Per-Item Quantity Steppers */}
                                    <div className="flex-1 flex flex-col gap-2 min-h-[160px]">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--secondary-text-color,rgba(255,255,255,0.5))]">
                                                BATCH COPIES ({selectedItems.length})
                                            </span>
                                            <button
                                                onClick={() => {
                                                    const ones: Record<string, number> = {};
                                                    selectedItems.forEach(i => { ones[String(i.row)] = 1; });
                                                    setQuantities(ones);
                                                }}
                                                className="text-[9px] font-bold text-[var(--main-color)] hover:underline uppercase"
                                            >
                                                Set All to 1
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 max-h-[220px]">
                                            {selectedItems.map(item => {
                                                const rowKey = String(item.row);
                                                const currentQty = quantities[rowKey] ?? (Number(item.normData.quantity) || 1);
                                                return (
                                                    <div key={item.row} className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5 text-xs">
                                                        <div className="flex flex-col min-w-0 mr-2">
                                                            <span className="font-bold truncate text-white">{item.codes?.bookBarcode}</span>
                                                            <span className="text-[10px] text-white/50 truncate">{item.normData.shortDescription || item.normData.type}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <button
                                                                onClick={() => setQuantities(q => ({ ...q, [rowKey]: Math.max(1, currentQty - 1) }))}
                                                                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center font-bold"
                                                            >
                                                                -
                                                            </button>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="99"
                                                                value={currentQty}
                                                                onChange={e => setQuantities(q => ({ ...q, [rowKey]: parseInt(e.target.value) || 1 }))}
                                                                className="w-10 bg-transparent text-center font-bold text-white border-none outline-none"
                                                            />
                                                            <button
                                                                onClick={() => setQuantities(q => ({ ...q, [rowKey]: Math.min(99, currentQty + 1) }))}
                                                                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center font-bold"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* 5. Secondary Exports */}
                                    <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--secondary-text-color,rgba(255,255,255,0.5))]">
                                            SECONDARY EXPORTS
                                        </span>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={handleGeneratePDF}
                                                disabled={progress.pdf > 0 && progress.pdf < 100}
                                                className="py-2.5 px-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                                            >
                                                <FileText size={14} />
                                                Control PDF
                                            </button>
                                            <button
                                                onClick={handleGenerateCatalog}
                                                disabled={progress.catalog > 0 && progress.catalog < 100}
                                                className="py-2.5 px-3 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                                            >
                                                <BookOpen size={14} />
                                                Catalog PDF
                                            </button>
                                        </div>
                                        {progress.pdf === 100 && urls.pdf && (
                                            <button
                                                onClick={() => setPreviewTarget('control')}
                                                className="w-full py-1.5 text-[10px] font-black uppercase tracking-widest text-red-300 bg-red-500/20 rounded-lg flex items-center justify-center gap-1.5"
                                            >
                                                <Eye size={12} /> Review Control PDF
                                            </button>
                                        )}
                                        {progress.catalog === 100 && (urls.catalogReady || urls.catalogNotReady) && (
                                            <button
                                                onClick={() => setPreviewTarget('catalog')}
                                                className="w-full py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-300 bg-blue-500/20 rounded-lg flex items-center justify-center gap-1.5"
                                            >
                                                <Eye size={12} /> Review Catalog PDF
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Right Column: Live Batch Preview Grid */}
                                <div className={`flex-1 flex flex-col min-h-0 bg-transparent relative overflow-hidden ${mobileTab === 'preview' || window.innerWidth >= 768 ? 'flex' : 'hidden md:flex'}`}>
                                    <PreviewLabels
                                        items={selectedItems}
                                        quantities={quantities}
                                        activeLabelSize={activeLabelSize}
                                        logoVariant={logoVariant}
                                        showChrome={false}
                                    />
                                </div>
                            </div>
                        )}

                        {/* ── MODE 2: ABSORBED PRINT CENTER (History / Queue / Verify / Templates) ── */}
                        {mode !== 'studio' && (
                            <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto min-h-0">
                                {mode === 'history' && (
                                    <div className="flex flex-col items-center w-full max-w-5xl mx-auto gap-4">
                                        <div className="w-full flex items-center justify-between border-b border-white/10 pb-4">
                                            <h3 className="text-lg font-bold">Print Job History</h3>
                                            <select
                                                value={season}
                                                onChange={e => setSeason(e.target.value as '825' | '826')}
                                                className="bg-black/50 border border-white/20 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
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
                                        <div className="text-center text-white/50">
                                            <Search className="w-12 h-12 mb-2 opacity-50 mx-auto" />
                                            <p className="text-sm">Paste a document job ID to verify its ledger entry.</p>
                                        </div>
                                        <div className="flex w-full gap-2">
                                            <input
                                                type="text"
                                                value={verifyHash}
                                                onChange={e => setVerifyHash(e.target.value)}
                                                placeholder="Document Job ID or Hash..."
                                                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
                                            />
                                            <button
                                                onClick={() => handleVerify()}
                                                className="px-6 py-3 bg-[var(--main-color)] text-black rounded-xl font-bold text-xs uppercase"
                                            >
                                                Verify
                                            </button>
                                        </div>

                                        {matchedJobs !== null && (
                                            matchedJobs.length === 0 ? (
                                                <div className="p-4 rounded-xl bg-yellow-500/10 text-yellow-400 text-xs text-center w-full">
                                                    No matching jobs found.
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2 w-full max-h-64 overflow-y-auto">
                                                    {matchedJobs.map(job => (
                                                        <div key={job.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex justify-between items-center text-xs">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold">{job.job_ref || job.id}</span>
                                                                <span className="text-white/40">{job.template_id} - Season {job.season}</span>
                                                            </div>
                                                            <button
                                                                onClick={() => handleVerifyJobRow(job.id)}
                                                                className="px-3 py-1 bg-white/10 rounded font-bold"
                                                            >
                                                                Verify
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        )}

                                        <div
                                            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 w-full ${dragActive ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-white/10 bg-black/30 text-white/40'}`}
                                            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                                            onDragLeave={() => setDragActive(false)}
                                            onDrop={handleDrop}
                                        >
                                            <UploadCloud className="w-8 h-8 mb-2 opacity-50" />
                                            <span className="text-xs">Or drop snapshot JSON here to calculate SHA-256</span>
                                            {droppedHash && (
                                                <div className="mt-3 p-2 bg-black/60 rounded text-xs font-mono break-all text-white/80">
                                                    {droppedHash}
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={handleRunSelfTest}
                                            disabled={isTesting}
                                            className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold uppercase transition-all"
                                        >
                                            {isTesting ? 'Running Self-Test...' : 'Run Self-Test'}
                                        </button>
                                        {testResults && (
                                            <div className="w-full flex flex-col gap-2 mt-2">
                                                {testResults.map((res, i) => (
                                                    <div key={i} className="flex justify-between p-2 rounded-lg bg-black/30 text-xs">
                                                        <span>{res.name}</span>
                                                        <span className={res.ok ? 'text-emerald-400' : 'text-red-400'}>
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
                        <div className="px-6 py-3 border-t border-white/10 bg-emerald-500/10 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-4 text-xs">
                                <span className="font-bold text-emerald-400">Printed {lastPrintJob.labelCount} labels ({lastPrintJob.itemCount} items)</span>
                                <span className="text-white/40 font-mono">Job: {lastPrintJob.jobId}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handlePrintAll(true)}
                                    className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg uppercase"
                                >
                                    Reprint Batch
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Sticky Bottom Action Bar (Thumb-Zone) */}
                    {mode === 'studio' && (
                        <div className="lps-bottom-bar liquid-surface relative">
                            <div className="flex items-center gap-2 md:gap-3 w-full">
                                {/* EDIT LABEL Button */}
                                <button
                                    onClick={handleOpenDesigner}
                                    className="lps-touch-target liquid-control px-4 md:px-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs md:text-sm font-bold uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shrink-0"
                                    title="Open Visual Phomemo Label Editor"
                                >
                                    <Sliders size={16} />
                                    <span>EDIT LABEL</span>
                                </button>

                                {/* BACKUP XLSX Button */}
                                <button
                                    onClick={handleGenerateXLSX}
                                    disabled={progress.xlsx > 0 && progress.xlsx < 100}
                                    className="lps-touch-target liquid-control px-4 md:px-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs md:text-sm font-bold uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shrink-0"
                                    title="Download Backup XLSX"
                                >
                                    <FileSpreadsheet size={16} />
                                    <span className="hidden sm:inline">BACKUP</span> XLSX
                                </button>

                                {/* PRINT ALL Primary CTA */}
                                <button
                                    onClick={() => handlePrintAll(false)}
                                    disabled={bleState === 'printing' || labelInstances.length === 0}
                                    className="flex-1 lps-touch-target min-h-[48px] px-6 rounded-xl bg-[var(--main-color,#7FBBFF)] hover:shadow-[0_0_30px_rgba(var(--main-color-rgb,127,187,255),0.6)] active:scale-98 transition-all text-black font-black text-sm md:text-base uppercase tracking-wider flex items-center justify-center gap-3 disabled:opacity-50"
                                >
                                    {bleState === 'printing' ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                            <span>PRINTING {printProgress.current} OF {printProgress.total}...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Printer size={18} strokeWidth={2.5} />
                                            <span>
                                                {bleState === 'connected' ? `PRINT ALL (${labelInstances.length} LABELS)` : `CONNECT & PRINT (${labelInstances.length})`}
                                            </span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── DESIGNER IFRAME MODAL OVERLAY ── */}
                {isDesignerOpen && (
                    <div className="fixed inset-0 z-[100010] flex flex-col bg-black">
                        <div className="h-14 bg-black/90 border-b border-white/10 px-6 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setIsDesignerOpen(false)}
                                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-bold uppercase flex items-center gap-1.5 hover:bg-white/20 transition-all"
                                >
                                    <ArrowLeft size={16} />
                                    Back to Batch Studio
                                </button>
                                <span className="text-sm font-bold text-white/80">Phomemo Visual Designer</span>
                            </div>
                            <button
                                onClick={() => setIsDesignerOpen(false)}
                                className="w-8 h-8 rounded-full bg-white/10 text-white/60 hover:text-white flex items-center justify-center"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex-1 w-full h-full relative">
                            <iframe
                                ref={iframeRef}
                                src={`/phomemo-designer/index.html?v=${selectedItems.length}&theme=${theme}`}
                                className="w-full h-full border-none bg-transparent"
                                title="Phomemo Designer"
                                allow="bluetooth"
                            />
                        </div>
                    </div>
                )}
            </div>
        </>,
        document.body
    );
};
