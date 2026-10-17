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
    const handleConnectBluetooth = async (): Promise<boolean> => {
        if (!isBluetoothSupported) {
            toast.error("Web Bluetooth unsupported on iOS Safari. Use Chrome, Edge, or Bluefy on iOS.");
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
                const connected = await handleConnectBluetooth();
                if (!connected) return;
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
    const handleOpenDesigner = () => {
        const batchProject = {
            name: `Onyx_Batch_${new Date().toISOString().split('T')[0]}`,
            exportedAt: new Date().toISOString(),
            labelSize: { width: activeLabelSize === '50x50' ? 50 : 50, height: activeLabelSize === '50x50' ? 50 : 30 },
            records: labelInstances.map(inst => ({
                "TAG ID": String(inst.item.codes?.bookBarcode || ''),
                "DESCRIPTION": `${inst.item.normData?.shape || ''} ${inst.item.normData?.itemType || inst.item.normData?.type || inst.item.normData?.shortDescription || ''}`.trim() || 'Onyx Piece',
                "COLOR MATERIAL": `${inst.item.normData?.color || ''} ${inst.item.normData?.material || 'Onyx'}`.trim(),
                "SIZES": `${inst.item.normData?.widthCm || 0}*${inst.item.normData?.lengthCm ?? inst.item.normData?.widthCm ?? 0}*${inst.item.normData?.heightCm || 0} CM`,
                "BOOK RETAIL": `${inst.item.codes?.bookAqCode || ''}-${String(inst.item.normData?.workbook || '326').replace(/v/gi, '')}${String(inst.item.codes?.bookRetail || '0').padStart(4, '0')}`,
                "QUANTITY": 1,
                "QR DATA": String(inst.item.codes?.bookBarcode || ''),
                "AXO_IMAGE": axoCache[String(inst.item.codes?.bookBarcode || '')] || ''
            }))
        };
        try { localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject)); } catch {}
        pendingBatchRef.current = batchProject;
        setIsDesignerOpen(true);
    };

    // Iframe designer message handler
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'DESIGNER_READY' && pendingBatchRef.current && iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.postMessage({ type: 'ONYX_LOAD_BATCH', payload: pendingBatchRef.current }, '*');
                iframeRef.current.contentWindow.postMessage({ type: 'LOAD_DESIGN', payload: { templateData: pendingBatchRef.current.records, labelSize: pendingBatchRef.current.labelSize } }, '*');
            }
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
    }, [commitPrintJob, selectedItems, activeLabelSize, labelInstances, axoCache]);

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
                <div className="lps-sheet liquid-surface relative z-10">
                    
                    {/* Top Bar Chrome */}
                    <div className="lps-header relative z-10">
                        <div className="flex items-center gap-3 md:gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-xl liquid-panel lps-card flex items-center justify-center shrink-0 text-[var(--main-color,#7FBBFF)]">
                                <Printer size={20} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm md:text-base font-black tracking-wider uppercase truncate">
                                        PHOMEMO PRINT STUDIO
                                    </h2>
                                    <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold liquid-control uppercase tracking-widest lps-text-secondary">
                                        M110 / M120
                                    </span>
                                </div>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="lps-batch-input outline-none font-bold text-xs md:text-sm uppercase tracking-tight p-0 mt-0.5"
                                    placeholder="BATCH NAME"
                                />
                            </div>
                        </div>

                        {/* Center Readout & Mode Switchers (Desktop) */}
                        <div className="hidden md:flex items-center gap-2 lg:gap-3">
                            <div className="liquid-panel lps-readout flex items-center gap-4 px-3 py-1.5 text-xs font-bold mr-2 tabular-figures">
                                <div>
                                    <span className="lps-text-muted uppercase text-[9px] block">TYPES</span>
                                    <span className="tabular-nums text-[var(--main-color,#7FBBFF)]">{selectedItems.length}</span>
                                </div>
                                <div className="w-px h-5 bg-[var(--lq-rim-subtle)]" />
                                <div>
                                    <span className="lps-text-muted uppercase text-[9px] block">LABELS</span>
                                    <span className="tabular-nums text-[var(--main-color,#7FBBFF)]">{labelInstances.length}</span>
                                </div>
                            </div>

                            {/* Mode Tabs */}
                            <div className="liquid-panel lps-seg-group flex items-center gap-0.5">
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
                                className={`lps-status-pill liquid-control lps-touch-target cursor-pointer ${
                                    bleState === 'connected' ? 'lps-tone-emerald' :
                                    bleState === 'connecting' ? 'lps-tone-blue animate-pulse' :
                                    bleState === 'printing' ? 'lps-tone-blue animate-pulse' :
                                    bleState === 'error' ? 'lps-tone-red' :
                                    bleState === 'unsupported' ? 'opacity-50 cursor-default' :
                                    ''
                                }`}
                                title={!isBluetoothSupported ? 'Web Bluetooth unavailable in this browser' : 'Click to pair Phomemo printer'}
                            >
                                <Bluetooth size={14} />
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
                                className="lps-touch-target liquid-control rounded-full cursor-pointer"
                                aria-label="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Mobile Navigation Segmented Switcher (< 768px) */}
                    <div className="md:hidden lps-mobile-nav flex items-center justify-around shrink-0 z-10">
                        <button
                            onClick={() => { setMode('studio'); setMobileTab('preview'); }}
                            className={`flex-1 lps-tab-btn lps-touch-target ${mode === 'studio' && mobileTab === 'preview' ? 'active' : ''}`}
                        >
                            Preview ({labelInstances.length})
                        </button>
                        <button
                            onClick={() => { setMode('studio'); setMobileTab('controls'); }}
                            className={`flex-1 lps-tab-btn lps-touch-target ${mode === 'studio' && mobileTab === 'controls' ? 'active' : ''}`}
                        >
                            Controls & Sizes
                        </button>
                        <button
                            onClick={() => { setMode(mode === 'studio' ? 'history' : mode); setMobileTab('center'); }}
                            className={`flex-1 lps-tab-btn lps-touch-target ${mode !== 'studio' || mobileTab === 'center' ? 'active' : ''}`}
                        >
                            Print Center
                        </button>
                    </div>

                    {/* Body Area */}
                    <div className="flex-1 flex overflow-hidden min-h-0 relative z-10">
                        {/* ── MODE 1: BATCH STUDIO ── */}
                        {mode === 'studio' && (
                            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
                                {/* Left Column: Control Pad (Desktop fixed 360px / Mobile conditionally rendered) */}
                                <div className={`lps-sidebar liquid-panel rounded-none border-y-0 border-l-0 w-full md:w-[360px] flex flex-col shrink-0 overflow-y-auto p-4 md:p-5 gap-5 ${mobileTab === 'controls' ? 'flex' : 'hidden md:flex'}`}>
                                    
                                    {/* 1. Label Size Selector */}
                                    <div className="flex flex-col gap-2">
                                        <label className="lps-section-label">
                                            LABEL SIZE (STOCK)
                                        </label>
                                        <div className="liquid-panel lps-seg-group flex gap-1">
                                            <button
                                                onClick={() => handleLabelSizeChange('50x30')}
                                                className={`flex-1 lps-tab-btn lps-touch-target tabular-figures ${activeLabelSize === '50x30' ? 'active' : ''}`}
                                            >
                                                50 × 30 mm
                                            </button>
                                            <button
                                                onClick={() => handleLabelSizeChange('50x50')}
                                                className={`flex-1 lps-tab-btn lps-touch-target tabular-figures ${activeLabelSize === '50x50' ? 'active' : ''}`}
                                            >
                                                50 × 50 mm
                                            </button>
                                        </div>
                                    </div>

                                    {/* 2. Branding Logo Selector */}
                                    <div className="flex flex-col gap-2">
                                        <label className="lps-section-label">
                                            BRANDING LOGO
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => setLogoVariant('ArtOfDecor')}
                                                className={`lps-touch-target p-3 liquid-control flex items-center justify-center transition-all cursor-pointer ${logoVariant === 'ArtOfDecor' ? 'is-active' : 'opacity-65 hover:opacity-100'}`}
                                            >
                                                <img src={`${import.meta.env.BASE_URL}ArtOfDecorLogo.png`} alt="Art of Decor" className="h-6 object-contain lps-logo-invert" />
                                            </button>
                                            <button
                                                onClick={() => setLogoVariant('RareEarth')}
                                                className={`lps-touch-target p-3 liquid-control flex items-center justify-center transition-all cursor-pointer ${logoVariant === 'RareEarth' ? 'is-active' : 'opacity-65 hover:opacity-100'}`}
                                            >
                                                <img src={`${import.meta.env.BASE_URL}REG_Logo.png`} alt="Rare Earth Gallery" className="h-6 object-contain" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* 3. Bluetooth Connection Card */}
                                    <div className="liquid-panel lps-card p-4 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <span className="lps-section-label">
                                                PRINTER HARDWARE
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-2 h-2 rounded-full ${bleState === 'connected' ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : bleState === 'connecting' ? 'bg-blue-400 animate-ping' : bleState === 'printing' ? 'bg-cyan-400 animate-pulse' : 'bg-[var(--lq-ink-muted)]'}`} />
                                                <span className="text-[10px] font-bold uppercase tracking-wider lps-text-secondary">
                                                    {bleState}
                                                </span>
                                            </div>
                                        </div>

                                        {!isBluetoothSupported ? (
                                            <div className="p-3 rounded-xl liquid-control flex items-start gap-2 text-xs leading-relaxed lps-text-secondary">
                                                <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-500" />
                                                <span>
                                                    Direct Bluetooth requires Chrome, Edge, or Bluefy on iOS. You can still preview labels, edit designs, or export Backup XLSX & PDF.
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={handleConnectBluetooth}
                                                    disabled={bleState === 'connecting' || bleState === 'printing'}
                                                    className={`w-full lps-touch-target py-2.5 px-4 liquid-control text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${bleState === 'connected' ? 'lps-tone-emerald' : ''}`}
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
                                            <span className="lps-section-label">
                                                BATCH COPIES ({selectedItems.length})
                                            </span>
                                            <button
                                                onClick={() => {
                                                    const ones: Record<string, number> = {};
                                                    selectedItems.forEach(i => { ones[String(i.row)] = 1; });
                                                    setQuantities(ones);
                                                }}
                                                className="liquid-control px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                                            >
                                                Set All to 1
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 max-h-[220px]">
                                            {selectedItems.map(item => {
                                                const rowKey = String(item.row);
                                                const currentQty = quantities[rowKey] ?? (Number(item.normData.quantity) || 1);
                                                return (
                                                    <div key={item.row} className="liquid-panel lps-card flex items-center justify-between p-2.5 text-xs">
                                                        <div className="flex flex-col min-w-0 mr-2">
                                                            <span className="font-bold truncate">{item.codes?.bookBarcode}</span>
                                                            <span className="text-[10px] lps-text-secondary truncate">{item.normData.shortDescription || item.normData.type}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 shrink-0 tabular-figures">
                                                            <button
                                                                onClick={() => setQuantities(q => ({ ...q, [rowKey]: Math.max(1, currentQty - 1) }))}
                                                                className="w-8 h-8 liquid-control flex items-center justify-center font-bold cursor-pointer"
                                                                aria-label="Decrease copies"
                                                            >
                                                                -
                                                            </button>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="99"
                                                                value={currentQty}
                                                                onChange={e => setQuantities(q => ({ ...q, [rowKey]: parseInt(e.target.value) || 1 }))}
                                                                className="w-10 lps-qty-input text-center font-bold outline-none tabular-figures"
                                                            />
                                                            <button
                                                                onClick={() => setQuantities(q => ({ ...q, [rowKey]: Math.min(99, currentQty + 1) }))}
                                                                className="w-8 h-8 liquid-control flex items-center justify-center font-bold cursor-pointer"
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

                                    {/* 5. Secondary Exports */}
                                    <div className="flex flex-col gap-2 pt-3 border-t border-[var(--lq-rim-subtle)]">
                                        <span className="lps-section-label">
                                            SECONDARY EXPORTS
                                        </span>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={handleGeneratePDF}
                                                disabled={progress.pdf > 0 && progress.pdf < 100}
                                                className="lps-touch-target py-2.5 px-3 liquid-control lps-tone-red text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                                            >
                                                <FileText size={14} />
                                                Control PDF
                                            </button>
                                            <button
                                                onClick={handleGenerateCatalog}
                                                disabled={progress.catalog > 0 && progress.catalog < 100}
                                                className="lps-touch-target py-2.5 px-3 liquid-control lps-tone-blue text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                                            >
                                                <BookOpen size={14} />
                                                Catalog PDF
                                            </button>
                                        </div>
                                        {progress.pdf === 100 && urls.pdf && (
                                            <button
                                                onClick={() => setPreviewTarget('control')}
                                                className="w-full lps-touch-target py-1.5 text-[10px] font-black uppercase tracking-widest liquid-control lps-tone-red flex items-center justify-center gap-1.5 cursor-pointer"
                                            >
                                                <Eye size={12} /> Review Control PDF
                                            </button>
                                        )}
                                        {progress.catalog === 100 && (urls.catalogReady || urls.catalogNotReady) && (
                                            <button
                                                onClick={() => setPreviewTarget('catalog')}
                                                className="w-full lps-touch-target py-1.5 text-[10px] font-black uppercase tracking-widest liquid-control lps-tone-blue flex items-center justify-center gap-1.5 cursor-pointer"
                                            >
                                                <Eye size={12} /> Review Catalog PDF
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Right Column: Live Batch Preview Grid */}
                                <div className={`lps-preview-stage flex-1 flex flex-col min-h-0 bg-transparent relative overflow-hidden ${mobileTab === 'preview' ? 'flex' : 'hidden md:flex'}`}>
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
                            <div className="flex items-center gap-2 md:gap-3 w-full">
                                {/* EDIT LABEL Button */}
                                <button
                                    onClick={handleOpenDesigner}
                                    className="lps-touch-target liquid-control px-4 md:px-6 text-xs md:text-sm font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shrink-0"
                                    title="Open Visual Phomemo Label Editor"
                                >
                                    <Sliders size={16} />
                                    <span>EDIT LABEL</span>
                                </button>

                                {/* BACKUP XLSX Button */}
                                <button
                                    onClick={handleGenerateXLSX}
                                    disabled={progress.xlsx > 0 && progress.xlsx < 100}
                                    className="lps-touch-target liquid-control lps-tone-emerald px-4 md:px-5 text-xs md:text-sm font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shrink-0"
                                    title="Download Backup XLSX"
                                >
                                    <FileSpreadsheet size={16} />
                                    <span className="hidden sm:inline">BACKUP</span> XLSX
                                </button>

                                {/* PRINT ALL Primary CTA */}
                                <button
                                    onClick={() => handlePrintAll(false)}
                                    disabled={bleState === 'printing' || labelInstances.length === 0}
                                    className="flex-1 lps-touch-target lps-btn-primary min-h-[48px] px-6 font-black text-sm md:text-base uppercase tracking-wider flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
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
                    <div className="fixed inset-0 z-[100010] flex flex-col liquid-surface rounded-none">
                        <div className="lps-header px-6 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setIsDesignerOpen(false)}
                                    className="lps-touch-target px-3 py-1.5 liquid-control text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                                >
                                    <ArrowLeft size={16} />
                                    Back to Batch Studio
                                </button>
                                <span className="text-sm font-bold">Phomemo Visual Designer</span>
                            </div>
                            <button
                                onClick={() => setIsDesignerOpen(false)}
                                className="lps-touch-target liquid-control rounded-full flex items-center justify-center cursor-pointer"
                                aria-label="Close Visual Designer"
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
