import { useAtom, useAtomValue } from 'jotai';
import { inventoryAtom, exchangeRateAtom, workbookVersionAtom, TOP_BAR_SEARCH_ATOM } from '../../lib/atoms';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import html2canvas from 'html2canvas';
import { exportToXLSX } from '../../lib/xlsxUtils';
import toast from 'react-hot-toast';
import { 
    Package, 
    CheckCircle2, 
    Printer, 
    Grid, 
    List, 
    ChevronRight, 
    QrCode, 
    ClipboardList, 
    Info, 
    Settings2, 
    Download, 
    Layers,
    Bluetooth,
    Activity,
    Box
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';

/* ─── Premium Components ─── */

const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`bg-white/[0.03] backdrop-blur-3xl border border-white/[0.08] rounded-[2rem] overflow-hidden ${className}`}>
        {children}
    </div>
);

const SectionTitle = ({ children, subtitle }: { children: string, subtitle?: string }) => (
    <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">{children}</h2>
        {subtitle && <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em]">{subtitle}</p>}
    </div>
);

/* ─── Main Module ─── */

export const PackingModule: React.FC = () => {
    const db = useDatabase();
    const [inventory, setInventory] = useAtom(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    const globalSearchTerm = useAtomValue(TOP_BAR_SEARCH_ATOM);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [isReviewMode, setIsReviewMode] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [labelSize, setLabelSize] = useState<'40x30' | '50x30' | '50x80'>('50x30');
    const [isConfigExpanded, setIsConfigExpanded] = useState(true);

    const [isConnectingBLE, setIsConnectingBLE] = useState(false);
    const [connectedDevice, setConnectedDevice] = useState<any>(null);

    useEffect(() => {
        if (!db) return;
        const subs = [
            db.inventory.find({ selector: { status: { $ne: 'Pending Deletion' } } }).$.subscribe(d => {
                const mapped = d.map(x => ({ ...x.toJSON(), source: 'inventory', row: x.id, data: normalizeInventoryData(x.toJSON()) }));
                setInventory(prev => {
                    const filtered = prev.filter(p => (p as any).source !== 'inventory');
                    return [...filtered, ...mapped] as any;
                });
            }),
            db.production.find().$.subscribe(d => {
                const mapped = d.map(x => ({ ...x.toJSON(), source: 'production', row: x.id, data: normalizeInventoryData(x.toJSON()) }));
                setInventory(prev => {
                    const filtered = prev.filter(p => (p as any).source !== 'production');
                    return [...filtered, ...mapped] as any;
                });
            }),
        ];
        return () => subs.forEach(s => s.unsubscribe());
    }, [db, setInventory]);

    const processedItems = useMemo(() => {
        return inventory.filter(item => {
            const data = normalizeInventoryData(item.data);
            if (globalSearchTerm) {
                const term = globalSearchTerm.toLowerCase().trim();
                const calculated = calculateCodesAndPrices(data, exchangeRate, workbookPrefix);
                return (
                    (data.itemId || '').toLowerCase().includes(term) ||
                    (data.itemNumber || '').toLowerCase().includes(term) ||
                    (data.description || '').toLowerCase().includes(term) ||
                    (calculated.bookBardcode || '').toLowerCase().includes(term)
                );
            }
            return true;
        }).map(item => {
            const codes = calculateCodesAndPrices(item.data, exchangeRate, workbookPrefix);
            const normData = normalizeInventoryData(item.data);
            const baseImg = normData.generatedPngUrl || (normData.mediaUrls ? String(normData.mediaUrls).split(',')[0].trim() : null);
            return { ...item, codes, normData, imageUrl: getCleanImageUrl(baseImg) };
        });
    }, [inventory, globalSearchTerm, exchangeRate, workbookPrefix]);

    const toggleSelect = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleBLEConnect = async () => {
        setIsConnectingBLE(true);
        try {
            // Future implementation based on vivier/phomemo-tools
            // const device = await (navigator as any).bluetooth.requestDevice({ filters: [{ namePrefix: 'M110' }] });
            toast.error("BLE printing requires secure HTTPS context and browser support.");
        } catch (e) {
            toast.error("Bluetooth connection failed.");
        } finally {
            setIsConnectingBLE(false);
        }
    };

    const downloadLabels = async () => {
        if (selectedIds.size === 0) return toast.error('Select items first');
        setIsGenerating(true);
        const tid = toast.loading('Exporting High-Fidelity Artifacts...');
        try {
            const items = processedItems.filter(d => selectedIds.has(String(d.row)));
            for (const item of items) {
                const element = document.getElementById(`phomemo-sheet-${item.row}`);
                if (element) {
                    const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
                    const link = document.createElement('a');
                    link.download = `OnyxLabel_${item.normData.itemId}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                    await new Promise(r => setTimeout(r, 400));
                }
            }
            toast.success(`${items.length} stickers saved`, { id: tid });
        } catch (e) { toast.error('Render failed', { id: tid }); }
        finally { setIsGenerating(true); setTimeout(() => setIsGenerating(false), 500); }
    };

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden relative">
            {/* Header / Config Control */}
            <header className="z-30 px-10 py-8 flex items-center justify-between bg-black/40 backdrop-blur-3xl border-b border-white/5">
                <SectionTitle subtitle="Inventory Packing & Tagging">Logistics Hub</SectionTitle>
                
                <div className="flex items-center gap-6">
                    <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
                        <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' : 'text-white/30 hover:text-white'}`}>
                            <Grid size={18} />
                        </button>
                        <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' : 'text-white/30 hover:text-white'}`}>
                            <List size={18} />
                        </button>
                    </div>

                    <button 
                        onClick={() => setIsReviewMode(!isReviewMode)} 
                        className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all ${isReviewMode ? 'bg-white text-black shadow-2xl scale-105' : 'bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10'}`}
                    >
                        {isReviewMode ? 'Exit Review' : 'Label Preview'}
                    </button>

                    <button onClick={handleBLEConnect} className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:text-(--main-color) hover:border-(--main-color)/40 transition-all">
                        <Bluetooth size={20} className={isConnectingBLE ? 'animate-pulse text-(--main-color)' : ''} />
                    </button>
                </div>
            </header>

            {/* Config Drawer */}
            <div className={`z-20 px-10 py-6 bg-black/20 border-b border-white/5 transition-all duration-500 origin-top ${isConfigExpanded ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0 py-0 border-none'}`}>
                 <div className="flex items-end gap-12">
                    <div className="flex flex-col gap-3 min-w-[280px]">
                        <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] flex items-center gap-2">
                            <Layers size={12} /> Paper Architecture
                        </span>
                        <select
                            value={labelSize}
                            onChange={(e) => setLabelSize(e.target.value as any)}
                            className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-[10px] font-black text-white outline-none focus:border-(--main-color)/50 transition-all uppercase tracking-widest cursor-pointer"
                        >
                            <option value="40x30">40mm x 30m (Pocket)</option>
                            <option value="50x30">50mm x 30mm (Industrial)</option>
                            <option value="50x80">50mm x 80mm (Elite Wide)</option>
                        </select>
                    </div>

                    <div className="flex gap-4">
                        <button onClick={downloadLabels} disabled={selectedIds.size === 0 || isGenerating} className="h-14 px-10 rounded-full bg-(--main-color) text-black font-black uppercase tracking-[0.2em] text-[11px] flex items-center gap-4 hover:scale-105 transition-all shadow-2xl shadow-(--main-color)/20 disabled:opacity-20">
                            {isGenerating ? <Activity className="animate-spin" /> : <Printer size={18} />}
                            Print Batch
                        </button>
                        <button onClick={() => {}} className="h-14 px-8 rounded-full bg-white/5 border border-white/10 text-white/40 font-black uppercase tracking-[0.15em] text-[10px] flex items-center gap-3 hover:text-white hover:bg-white/10 transition-all">
                            <Download size={16} /> Export XLSX
                        </button>
                    </div>

                    <div className="ml-auto bg-white/5 rounded-[2rem] p-4 flex items-center gap-4 border border-white/5">
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Active Pipeline</span>
                            <span className="text-xl font-black text-white font-mono leading-none tracking-tighter">{processedItems.length} <span className="text-[10px] text-white/20">Artifacts</span></span>
                        </div>
                        <div className="w-px h-8 bg-white/10" />
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-(--main-color)/40 uppercase tracking-widest">Selected</span>
                            <span className="text-xl font-black text-(--main-color) font-mono leading-none tracking-tighter">{selectedIds.size}</span>
                        </div>
                    </div>
                 </div>
            </div>

            {/* Scroll Area */}
            <main className="flex-1 overflow-y-auto px-10 py-12 custom-scrollbar relative z-10">
                {isReviewMode ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-16 justify-items-center">
                        {selectedIds.size === 0 ? (
                            <div className="col-span-full py-40 flex flex-col items-center justify-center opacity-20 gap-6 text-center">
                                <Box size={100} strokeWidth={0.5} />
                                <span className="text-sm font-black uppercase tracking-[0.4em]">No artifacts selected for review</span>
                            </div>
                        ) : (
                            processedItems.filter(i => selectedIds.has(String(i.row))).map(item => (
                                <div key={item.row} className="relative group perspective-1000">
                                    <div className="bg-white rounded-3xl overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)] transform group-hover:rotate-y-12 group-hover:scale-105 transition-all duration-700 border-4 border-white/20">
                                        <PhomemoSheetTemplate item={item} size={labelSize} />
                                    </div>
                                    <div className="absolute top-10 -right-4 p-4 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-2xl flex flex-col gap-1 shadow-3xl">
                                        <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Type</span>
                                        <span className="text-xs font-black text-white tracking-widest">{labelSize}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-8": "flex flex-col gap-3"}>
                        {processedItems.map(item => (
                            viewMode === 'grid' ? 
                            <LogisticsCard key={item.row} item={item} isSelected={selectedIds.has(String(item.row))} onToggle={(e: any) => toggleSelect(String(item.row), e)} /> :
                            <LogisticsRow key={item.row} item={item} isSelected={selectedIds.has(String(item.row))} onToggle={(e: any) => toggleSelect(String(item.row), e)} />
                        ))}
                    </div>
                )}
            </main>

            {/* Render Scratchpad for html2canvas */}
            <div className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none overflow-visible" style={{ width: '4000px', height: '4000px' }}>
                {processedItems.filter(i => selectedIds.has(String(i.row))).map(item => (
                    <PhomemoSheetTemplate key={item.row} item={item} size={labelSize} />
                ))}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color); }
                .rotate-y-12 { transform: rotateY(12deg); }
                .perspective-1000 { perspective: 1000px; }
            `}</style>
        </div>
    );
};

/* ─── Premium Card / Row ─── */

const LogisticsCard = ({ item, isSelected, onToggle }: any) => (
    <div onClick={onToggle} className={`group relative bg-white/[0.03] border rounded-[2.5rem] p-6 transition-all duration-500 cursor-pointer overflow-hidden ${isSelected ? 'border-(--main-color) bg-(--main-color)/10 scale-105 shadow-2xl shadow-(--main-color)/10 ring-1 ring-(--main-color)/20' : 'border-white/5 hover:bg-white/[0.06] hover:border-white/20'}`}>
        <div className="aspect-[3/4] rounded-[2rem] overflow-hidden bg-black/40 mb-6 relative group">
            {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover grayscale brightness-50 group-hover:grayscale-0 group-hover:brightness-100 group-hover:scale-110 transition-all duration-[2s]" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={48} /></div>}
            <div className="absolute top-4 right-4">
                <div className={`w-10 h-10 rounded-2xl border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-(--main-color) border-(--main-color)' : 'bg-black/40 border-white/20 shadow-2xl'}`}>
                    {isSelected && <CheckCircle2 className="w-6 h-6 text-black" strokeWidth={3} />}
                </div>
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-1">
                <span className="text-[9px] font-black text-(--main-color) bg-black/60 px-3 py-1 rounded-full uppercase tracking-[0.2em] w-fit shadow-2xl">{item.codes.bookBardcode}</span>
                <span className="text-[14px] font-black text-white italic tracking-tighter truncate uppercase">{item.normData.itemId}</span>
            </div>
        </div>
        <div className="flex flex-col gap-4">
            <h3 className="text-xs font-black text-white/50 uppercase tracking-widest line-clamp-2 leading-relaxed group-hover:text-white transition-colors">{item.normData.description}</h3>
            <div className="w-full h-px bg-white/5" />
            <div className="flex items-center justify-between">
                 <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Dimension</span>
                    <span className="text-[10px] font-bold text-white/60 uppercase">{item.normData.widthCm}x{item.normData.heightCm}cm</span>
                 </div>
                 <span className="text-lg font-black text-white font-mono tracking-tighter italic">${item.codes.bookRetail} <span className="text-[9px] font-normal not-italic opacity-30">USD</span></span>
            </div>
        </div>
    </div>
);

const LogisticsRow = ({ item, isSelected, onToggle }: any) => (
    <div onClick={onToggle} className={`flex items-center gap-8 p-4 rounded-3xl border transition-all cursor-pointer backdrop-blur-md ${isSelected ? 'bg-(--main-color)/10 border-(--main-color)/30 shadow-3xl' : 'bg-white/2 border-white/5 hover:bg-white/5'}`}>
        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-(--main-color) border-(--main-color)' : 'border-white/10'}`}>{isSelected && <CheckCircle2 className="w-4 h-4 text-black" strokeWidth={3} />}</div>
        <div className="w-16 h-16 rounded-2xl bg-black/40 shrink-0 overflow-hidden border border-white/10 relative group">
            {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" /> : <Package className="w-full h-full p-4 opacity-10" />}
        </div>
        <div className="flex-1 grid grid-cols-12 gap-8 items-center text-left">
            <div className="col-span-2 flex flex-col">
                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Tag Trace</span>
                <span className="text-[11px] font-black text-(--main-color) font-mono tracking-widest">{item.codes.bookBardcode}</span>
            </div>
            <div className="col-span-5 flex flex-col">
                <span className="text-[14px] font-black text-white uppercase tracking-tight line-clamp-1">{item.normData.description}</span>
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-0.5">{item.normData.itemId} • {item.normData.material}</span>
            </div>
            <div className="col-span-2 flex flex-col">
                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Metric</span>
                <span className="text-[11px] font-bold text-white/60 tracking-widest">{item.normData.widthCm}X{item.normData.heightCm} CM • {item.normData.weightKg}KG</span>
            </div>
            <div className="col-span-3 flex flex-col items-end">
                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">MSRP Artifact</span>
                <span className="text-xl font-black text-white font-mono tracking-tighter">${item.codes.bookRetail} <span className="text-[10px] font-normal tracking-normal opacity-30">USD</span></span>
            </div>
        </div>
    </div>
);

/* ─── FIXED LABEL TEMPLATE (Pixel-Perfect Architecture) ─── */

const PhomemoSheetTemplate: React.FC<{ item: any, size: string }> = ({ item, size }) => {
    const d = item.normData;
    const tagId = item.codes?.bookBardcode || 'ONYX-VOID';

    const [wStr, hStr] = (size || '50x30').split('x');
    const widthMm = parseFloat(wStr) || 50;
    const heightMm = parseFloat(hStr) || 30;

    // Fixed internal resolution for consistent rendering (Approx 300DPI scale)
    const baseW = 600;
    const baseH = Math.round((heightMm / widthMm) * baseW);
    
    // Sidebar Architecture
    const sidebarWidth = Math.round(baseW * 0.12); // ~12% width
    const contentWidth = baseW - sidebarWidth;

    const dims = `${d.widthCm || 0}X${d.lengthCm || 0}X${d.heightCm || 0} CM`.toUpperCase();
    const spacedTagId = tagId.split('').join('  ');

    return (
        <div id={`phomemo-sheet-${item.row}`}
            style={{
                width: `${baseW}px`,
                height: `${baseH}px`,
                backgroundColor: '#FFF',
                display: 'flex',
                color: '#000',
                overflow: 'hidden',
                position: 'relative',
                fontFamily: 'Outfit, "DM Sans", system-ui, sans-serif',
                WebkitFontSmoothing: 'antialiased'
            }}
        >
            {/* Sidebar: Industrial Trace */}
            <div style={{
                width: `${sidebarWidth}px`,
                height: '100%',
                backgroundColor: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                <div style={{
                    transform: 'rotate(-90deg)',
                    whiteSpace: 'nowrap',
                    fontSize: '32px',
                    fontWeight: 900,
                    letterSpacing: '0.4em',
                    color: '#FFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    MADE IN MEXICO
                </div>
            </div>

            {/* Content: Premium Artifact Labeling */}
            <div style={{
                flex: 1,
                padding: '24px 32px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
            }}>
                {/* ID & Dims (High-Visibility Header) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginBottom: '10px'
                }}>
                    <span style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.02em' }}>{d.itemId}</span>
                    <span style={{ fontSize: '24px', fontWeight: 600, opacity: 0.7 }}>{dims}</span>
                </div>

                {/* Industrial Description Block (Inverted) */}
                <div style={{
                    backgroundColor: '#000',
                    width: '100%',
                    padding: '16px 20px',
                    marginBottom: '8px'
                }}>
                    <div style={{
                        color: '#FFF',
                        fontSize: '48px',
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        lineHeight: 1,
                        letterSpacing: '-0.01em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical'
                    }}>
                        {d.description || 'ONYX PIECE'}
                    </div>
                </div>

                {/* Specification Line */}
                <div style={{ 
                    fontSize: '36px', 
                    fontWeight: 700, 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em',
                    color: '#000',
                    lineHeight: 1,
                    marginBottom: '10px'
                }}>
                    {d.material || 'ONYX'} • {d.color || 'NATURAL'}
                </div>

                {/* Industrial Barcode & Trace Code */}
                <div style={{
                    marginTop: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: '100%'
                }}>
                    <Barcode
                        value={tagId}
                        width={2.8}
                        height={90}
                        displayValue={false}
                        margin={0}
                        background="transparent"
                        lineColor="#000"
                    />
                    <div style={{
                        fontSize: '26px',
                        fontWeight: 900,
                        marginTop: '12px',
                        letterSpacing: '0.35em',
                        textTransform: 'uppercase',
                        borderTop: '2px solid #000',
                        paddingTop: '6px',
                        width: '100%',
                        textAlign: 'center'
                    }}>
                        {spacedTagId}
                    </div>
                </div>
            </div>
            
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;800;900&display=swap" rel="stylesheet" />
        </div>
    );
};
