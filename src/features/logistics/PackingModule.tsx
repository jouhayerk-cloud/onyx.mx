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
    Box,
    Filter,
    CheckSquare,
    Square,
    ExternalLink,
    Search,
    X,
    FileSpreadsheet,
    Smartphone
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';

/* ─── Premium Components ─── */

const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`bg-white/3 backdrop-blur-3xl border border-white/8 rounded-4xl overflow-hidden ${className}`}>
        {children}
    </div>
);

const SectionTitle = ({ children, subtitle }: { children: string, subtitle?: string }) => (
    <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">{children}</h2>
        {subtitle && <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.4em]">{subtitle}</p>}
    </div>
);

/* ─── Main Module ─── */

export const PackingModule: React.FC = () => {
    const db = useDatabase();
    const [inventory, setInventory] = useAtom(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    const globalSearchTerm = useAtomValue(TOP_BAR_SEARCH_ATOM);
    const deferredSearch = React.useDeferredValue(globalSearchTerm);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExportingXLSX, setIsExportingXLSX] = useState(false);
    const [isReviewMode, setIsReviewMode] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [labelSize, setLabelSize] = useState<'40x30' | '50x30' | '50x80'>('50x30');
    const [isConfigExpanded, setIsConfigExpanded] = useState(false);
    const [vendorFilter, setVendorFilter] = useState<string | null>(null);

    const [isConnectingBLE, setIsConnectingBLE] = useState(false);

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
        try {
            const searchTerm = String(deferredSearch || '').toLowerCase().trim();

            return inventory.map(item => {
                const normData = normalizeInventoryData(item?.data || {});
                const codes = calculateCodesAndPrices(normData, exchangeRate, workbookPrefix);
                const baseImg = normData.generatedPngUrl || (normData.mediaUrls ? String(normData.mediaUrls).split(',')[0].trim() : null);
                
                return { 
                    ...item, 
                    codes, 
                    normData, 
                    imageUrl: getCleanImageUrl(baseImg) 
                };
            }).filter(item => {
                const { normData, codes } = item;
                if (!normData || !codes) return false;
                
                // Search filter
                if (searchTerm) {
                    const searchStr = [
                        normData.itemId,
                        normData.itemNumber,
                        normData.description,
                        normData.shape,
                        normData.itemType,
                        codes.bookBardcode
                    ].map(v => String(v || '').toLowerCase()).join(' ');

                    if (!searchStr.includes(searchTerm)) return false;
                }

                // Vendor filter
                if (vendorFilter) {
                    const vendorCode = String(codes.bookBardcode || '').substring(0, 2);
                    if (vendorCode !== vendorFilter) return false;
                }

                return true;
            });
        } catch (e) {
            console.error("Critical processedItems error:", e);
            return [];
        }
    }, [inventory, deferredSearch, exchangeRate, workbookPrefix, vendorFilter]);

    const availableVendors = useMemo(() => {
        const vendorSet = new Set<string>();
        inventory.forEach(item => {
            const codes = calculateCodesAndPrices(normalizeInventoryData(item.data), exchangeRate, workbookPrefix);
            const code = String(codes.bookBardcode || '').substring(0, 2);
            if (code && (vendors as any)[code]) vendorSet.add(code);
        });
        return Array.from(vendorSet).sort();
    }, [inventory, exchangeRate, workbookPrefix]);

    const toggleSelect = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedIds(newSet);
    };

    const selectAll = () => {
        if (selectedIds.size === processedItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(processedItems.map(i => String(i.row))));
        }
    };

    const handleBLEConnect = async () => {
        setIsConnectingBLE(true);
        try {
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

    const handleExportXLSX = async () => {
        if (isExportingXLSX || selectedIds.size === 0) return;
        setIsExportingXLSX(true);
        const tid = toast.loading('Generating Export Artifact...');
        
        try {
            const itemsToExport = processedItems.filter(item => selectedIds.has(String(item.row)));
            
            const rows = itemsToExport.map(item => {
                const d = item.normData;
                const c = item.codes;
                
                // Combined Description: SHAPE TYPE (shape description)
                const combinedDesc = `${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE';
                
                // Combined Material Color
                const combinedMatColor = `${d.material || 'ONYX'} ${d.color || ''}`.trim();
                
                // Combined Sizes: W*L*H CM
                const combinedSizes = `${d.widthCm || 0}*${d.lengthCm || 0}*${d.heightCm || 0} CM`;
                
                // Book Retail (Combined): ACQCODE-BOOKv(326)RETAIL_USD (Example: HX-3260389)
                const bookv = String(d.workbook || workbookPrefix || '326').replace(/v/gi, '');
                const retailStr = String(c.bookRetail || '0').padStart(4, '0');
                const combinedRetail = `${c.bookAqCode}-${bookv}${retailStr}`;
                
                const qrUrl = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${c.bookBardcode}`;
                
                return [
                    c.bookBardcode,
                    combinedDesc,
                    combinedMatColor,
                    combinedSizes,
                    d.quantity || 1,
                    c.bookLandCode,
                    c.bookAqCode,
                    combinedRetail,
                    qrUrl
                ];
            });

            const sheets = [{
                name: 'Packing List',
                data: [
                    ['TAGID', 'DESCRIPTION', 'MATERIAL COLOR', 'SIZES', 'QUANTITY', 'LANDED CODE', 'ACQ CODE', 'BOOK RETAIL', 'QR URL'],
                    ...rows
                ]
            }];

            await exportToXLSX(`Packing_List_${new Date().toISOString().split('T')[0]}`, sheets);
            toast.success('XLSX generated successfully', { id: tid });
        } catch (error: any) {
            console.error(error);
            toast.error(`Export failed: ${error.message}`, { id: tid });
        } finally {
            setIsExportingXLSX(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden relative">
            {/* Minimalist Top Nav */}
            <nav className="z-40 px-6 py-4 flex items-center justify-between bg-black/60 backdrop-blur-2xl border-b border-white/5 sticky top-0">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-(--main-color)/10 border border-(--main-color)/20 flex items-center justify-center text-(--main-color)">
                        <Package size={20} />
                    </div>
                    <SectionTitle subtitle="Logistics Hub">Packing</SectionTitle>
                </div>

                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setIsReviewMode(!isReviewMode)} 
                        className={`hidden md:flex px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${isReviewMode ? 'bg-white text-black shadow-2xl scale-105' : 'bg-white/5 border border-white/10 text-white/40 hover:text-white'}`}
                    >
                        {isReviewMode ? 'Exit Review' : 'Label Preview'}
                    </button>
                    
                    <button 
                        onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                        className={`p-3 rounded-2xl transition-all ${isConfigExpanded ? 'bg-(--main-color) text-black shadow-lg shadow-(--main-color)/20' : 'bg-white/5 border border-white/10 text-white/40 hover:text-white'}`}
                    >
                        <Settings2 size={18} />
                    </button>
                </div>
            </nav>

            {/* Config Drawer / Filters */}
            <div className={`z-30 px-6 py-4 bg-black/40 backdrop-blur-3xl border-b border-white/5 transition-all duration-500 overflow-hidden ${isConfigExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 py-0 border-none'}`}>
                 <div className="flex flex-col gap-6">
                    {/* Multi-Select & Selection Actions */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button onClick={selectAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-all">
                                {selectedIds.size === processedItems.length ? <CheckSquare size={14} className="text-(--main-color)" /> : <Square size={14} />}
                                {selectedIds.size === processedItems.length ? 'Deselect All' : 'Select Visible'}
                            </button>
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] px-2">{selectedIds.size} Selected</span>
                        </div>

                        <div className="flex items-center gap-2">
                             <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}>
                                <Grid size={16} />
                            </button>
                            <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}>
                                <List size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Vendor Filter Palette */}
                    <div className="flex flex-col gap-3">
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] flex items-center gap-2 italic">
                            <Filter size={10} /> Segment by Vendor
                        </span>
                        <div className="flex flex-wrap gap-2">
                            <button 
                                onClick={() => setVendorFilter(null)}
                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${!vendorFilter ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40'}`}
                            >
                                All Vendors
                            </button>
                            {availableVendors.map(v => (
                                <button 
                                    key={v}
                                    onClick={() => setVendorFilter(v)}
                                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border flex items-center gap-2 ${vendorFilter === v ? 'bg-(--main-color) text-black border-(--main-color)' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'}`}
                                >
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: (vendors as any)[v]?.color || '#FFF' }} />
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="w-full h-px bg-white/5" />

                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex items-center gap-3 bg-white/5 p-1.5 rounded-2xl border border-white/10">
                            <select
                                value={labelSize}
                                onChange={(e) => setLabelSize(e.target.value as any)}
                                className="bg-transparent px-4 py-1.5 text-[10px] font-black text-white outline-none uppercase tracking-widest cursor-pointer"
                            >
                                <option value="40x30">40x30 Pocket</option>
                                <option value="50x30">50x30 Industrial</option>
                                <option value="50x80">50x80 Elite Wide</option>
                            </select>
                        </div>

                        <div className="flex grow gap-3 h-12">
                            <button 
                                onClick={handleBLEConnect} 
                                className="aspect-square rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:text-(--main-color) hover:border-(--main-color)/40 transition-all"
                            >
                                <Bluetooth size={16} className={isConnectingBLE ? 'animate-pulse text-(--main-color)' : ''} />
                            </button>
                            
                            <button 
                                onClick={handleExportXLSX} 
                                disabled={selectedIds.size === 0 || isExportingXLSX}
                                className="grow md:grow-0 px-6 rounded-2xl bg-white/5 border border-white/10 text-white/60 font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-20"
                            >
                                {isExportingXLSX ? <Activity size={14} className="animate-spin text-(--main-color)" /> : <FileSpreadsheet size={16} />}
                                Export XLSX
                            </button>

                            <button 
                                onClick={downloadLabels} 
                                disabled={selectedIds.size === 0 || isGenerating} 
                                className="grow md:grow-0 px-8 rounded-2xl bg-(--main-color) text-black font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-xl shadow-(--main-color)/20 disabled:opacity-20"
                            >
                                {isGenerating ? <Activity size={14} className="animate-spin" /> : <Printer size={16} />}
                                Batch Print
                            </button>
                        </div>
                    </div>
                 </div>
            </div>

            {/* Scroll Area / Workspace */}
            <main className="flex-1 overflow-y-auto px-6 py-8 custom-scrollbar relative z-10 flex flex-col">
                {isReviewMode ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 justify-items-center">
                        {selectedIds.size === 0 ? (
                            <div className="col-span-full py-40 flex flex-col items-center justify-center opacity-20 gap-6 text-center">
                                <Smartphone size={80} strokeWidth={1} />
                                <div className="flex flex-col gap-2">
                                    <span className="text-sm font-black uppercase tracking-[0.4em]">Review Context: Void</span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Select items to preview physical artifacts</span>
                                </div>
                            </div>
                        ) : (
                            processedItems.filter(i => selectedIds.has(String(i.row))).map(item => (
                                <div key={item.row} className="relative group w-full max-w-sm">
                                    <div className="bg-white rounded-4xl overflow-hidden shadow-3xl transform transition-all duration-700 border-4 border-white/10 ring-1 ring-black/40">
                                        <PhomemoSheetTemplate item={item} size={labelSize} />
                                    </div>
                                    <div className="absolute top-6 -right-2 p-3 bg-black/80 backdrop-blur-3xl border border-white/10 rounded-2xl flex flex-col gap-1 shadow-2xl">
                                        <span className="text-[8px] font-black text-(--main-color) uppercase tracking-[0.2em]">Active Layout</span>
                                        <span className="text-[10px] font-black text-white tracking-widest">{labelSize}MM</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6": "flex flex-col gap-3"}>
                        {processedItems.length === 0 ? (
                            <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-30 gap-4 text-center">
                                <div className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center">
                                    <Search size={24} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-black uppercase tracking-[0.2em]">No Matches Found</span>
                                    <span className="text-[9px] font-bold opacity-60">Try adjusting your filters or search term</span>
                                </div>
                            </div>
                        ) : (
                            processedItems.map(item => (
                                viewMode === 'grid' ? 
                                <LogisticsCard key={item.row} item={item} isSelected={selectedIds.has(String(item.row))} onToggle={(e: any) => toggleSelect(String(item.row), e)} /> :
                                <LogisticsRow key={item.row} item={item} isSelected={selectedIds.has(String(item.row))} onToggle={(e: any) => toggleSelect(String(item.row), e)} />
                            ))
                        )}
                    </div>
                )}
            </main>

            {/* Render Scratchpad for html2canvas (Hidden) */}
            <div className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none overflow-visible" style={{ width: '4000px', height: '4000px' }}>
                {processedItems.filter(i => selectedIds.has(String(i.row))).map(item => (
                    <PhomemoSheetTemplate key={item.row} item={item} size={labelSize} />
                ))}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color); }
                .shadow-3xl { shadow: 0 50px 100px -20px rgba(0, 0, 0, 0.7); }
            `}</style>
        </div>
    );
};

/* ─── Premium Card / Row ─── */

const LogisticsCard = ({ item, isSelected, onToggle }: any) => {
    const vendorCode = (item.codes.bookBardcode || '').split('-')[0];
    const vendorColor = (vendors as any)[vendorCode]?.color || 'transparent';

    return (
        <div onClick={onToggle} className={`group relative bg-white/2 border rounded-4xl p-4 transition-all duration-500 cursor-pointer overflow-hidden ${isSelected ? 'border-(--main-color) bg-(--main-color)/10 scale-[1.02] shadow-2xl shadow-(--main-color)/5' : 'border-white/5 hover:bg-white/5 hover:border-white/20'}`}>
            <div className="aspect-square rounded-3xl overflow-hidden bg-black/40 mb-4 relative">
                {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover grayscale brightness-75 group-hover:grayscale-0 group-hover:brightness-100 group-hover:scale-110 transition-all duration-1000" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><Package size={40} /></div>}
                <div className="absolute top-3 right-3">
                    <div className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all ${isSelected ? 'bg-(--main-color) border-(--main-color) shadow-lg' : 'bg-black/40 border-white/20'}`}>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-black" strokeWidth={3} />}
                    </div>
                </div>
                {/* Vendor Ribbon */}
                <div className="absolute top-0 left-0 w-8 h-8 flex items-center justify-center" style={{ backgroundColor: vendorColor }}>
                    <span className="text-[10px] font-black text-black mix-blend-difference">{vendorCode}</span>
                </div>
            </div>
            
            <div className="flex flex-col gap-3">
                <div className="flex flex-col">
                    <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">{item.codes.bookBardcode}</span>
                    <h3 className="text-[11px] font-black text-white/70 uppercase tracking-widest line-clamp-1 group-hover:text-white transition-colors">
                        {item.normData.description || `${item.normData.shape || ''} ${item.normData.itemType || item.normData.type || ''}`.trim() || 'ONYX PIECE'}
                    </h3>
                </div>
                
                <div className="w-full h-px bg-white/5" />
                
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-tighter italic">{item.normData.widthCm}x{item.normData.heightCm}cm</span>
                    <span className="text-sm font-black text-white font-mono tracking-tighter">${item.codes.bookRetail}</span>
                </div>
            </div>
        </div>
    );
};

const LogisticsRow = ({ item, isSelected, onToggle }: any) => {
    const vendorCode = (item.codes.bookBardcode || '').split('-')[0];
    const vendorColor = (vendors as any)[vendorCode]?.color || 'transparent';

    return (
        <div onClick={onToggle} className={`flex items-center gap-6 p-3 rounded-2xl border transition-all cursor-pointer ${isSelected ? 'bg-(--main-color)/10 border-(--main-color)/30' : 'bg-white/2 border-white/5 hover:bg-white/5'}`}>
            <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${isSelected ? 'bg-(--main-color) border-(--main-color)' : 'border-white/10'}`}>{isSelected && <CheckCircle2 className="w-4 h-4 text-black" strokeWidth={3} />}</div>
            
            <div className="w-12 h-12 rounded-xl bg-black/40 shrink-0 overflow-hidden border border-white/10 relative">
                {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" /> : <Package className="w-full h-full p-3 opacity-10" />}
                <div className="absolute bottom-0 left-0 w-full h-1" style={{ backgroundColor: vendorColor }} />
            </div>

            <div className="flex-1 grid grid-cols-12 gap-6 items-center">
                <div className="col-span-3 flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest leading-none mb-1">ID Artifact</span>
                    <span className="text-[11px] font-black text-white uppercase tracking-tight line-clamp-1">{item.normData.itemId}</span>
                </div>
                <div className="col-span-6 flex flex-col">
                    <span className="text-[11px] font-medium text-white/60 uppercase tracking-wide line-clamp-1 italic">{item.normData.description}</span>
                    <span className="text-[8px] font-black text-(--main-color)/40 uppercase tracking-[0.2em] mt-0.5">{item.codes.bookBardcode}</span>
                </div>
                <div className="col-span-3 flex flex-col items-end">
                    <span className="text-sm font-black text-white font-mono tracking-tighter italic">${item.codes.bookRetail}</span>
                </div>
            </div>
        </div>
    );
};

/* ─── FIXED LABEL TEMPLATE (Pixel-Perfect Architecture) ─── */

const PhomemoSheetTemplate: React.FC<{ item: any, size: string }> = ({ item, size }) => {
    const d = item.normData;
    const tagId = item.codes?.bookBardcode || 'ONYX-VOID';
    const tagUrl = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${tagId}`;

    const [wStr, hStr] = (size || '50x30').split('x');
    const widthMm = parseFloat(wStr) || 50;
    const heightMm = parseFloat(hStr) || 30;

    const baseW = 600;
    const baseH = Math.round((heightMm / widthMm) * baseW);
    
    // Vendor Theming
    const vendorCode = tagId.substring(0, 2);
    const vendorColor = (vendors as any)[vendorCode]?.color || '#000';
    const sidebarWidth = Math.round(baseW * 0.12);

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
            {/* Sidebar (Made in Mexico branding) */}
            <div style={{
                width: '60px',
                height: '100%',
                backgroundColor: '#00A8E8',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            }}>
                <div style={{
                    transform: 'rotate(-90deg)',
                    whiteSpace: 'nowrap',
                    fontSize: '28px',
                    fontWeight: 900,
                    letterSpacing: '0.4em',
                    color: '#FFF',
                    mixBlendMode: 'difference',
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
                {/* ID & Dims (High-Visibility Header) - Adjusted Sizes */}
                <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginBottom: '4px'
                }}>
                    <span style={{ fontSize: '28px', fontStyle: 'italic', fontWeight: 800, letterSpacing: '-0.02em', opacity: 0.6 }}>{tagId}</span>
                    <span style={{ fontSize: '28px', fontWeight: 800, opacity: 0.8, letterSpacing: '0.05em' }}>{dims}</span>
                </div>

                {/* Primary Description Title (Combines Shape/Type/ShortDesc) */}
                <div style={{
                    width: '100%',
                    marginBottom: '10px',
                    height: '160px', // Fixed height for middle section
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    <div style={{
                        color: '#000',
                        fontSize: '44px', // Optimized size
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        lineHeight: 1.1,
                        letterSpacing: '-0.02em',
                        width: '100%',
                        wordBreak: 'break-word',
                        display: '-webkit-box',
                        WebkitLineClamp: '3', // Allow up to 3 lines
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                    }}>
                        {`${d.shape || ''} ${d.itemType || d.type || d.shortDescription || d.description || ''}`.trim() || 'ONYX PIECE'}
                    </div>
                </div>

                {/* Product Metadata (Material, Specs & QR) */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    marginBottom: '30px', 
                    height: '140px'
                }}>
                    <div style={{ flex: 1, paddingRight: '10px' }}>
                        <div style={{ fontSize: '26px', fontWeight: 800, textTransform: 'uppercase', color: '#000', marginBottom: '6px', lineHeight: 1.2 }}>
                            {d.material || 'ONYX'} · {d.color || 'NATURAL'}
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: 800, color: '#000', opacity: 0.5 }}>
                            MASS: {d.weightKg || '--'}KG
                        </div>
                    </div>
                    
                    {/* Online Tag QR */}
                    <div style={{
                        width: '120px',
                        height: '120px',
                        padding: '8px',
                        border: '4px solid #000',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#FFF'
                    }}>
                        <QRCodeSVG value={tagUrl} size={104} level="H" />
                    </div>
                </div>

                {/* Industrial Barcode & Trace Code (Bottom Half Focus) */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    borderTop: '2px dashed #000',
                    paddingTop: '40px'
                }}>
                    <div style={{ transform: 'scale(1.4)', marginBottom: '40px' }}>
                        <Barcode
                            value={tagId}
                            width={2.2}
                            height={120} // Increased height for bottom-half focus
                            displayValue={false}
                            margin={0}
                            background="transparent"
                            lineColor="#000"
                        />
                    </div>
                    <div style={{
                        fontSize: '34px',
                        fontWeight: 900,
                        letterSpacing: '0.45em',
                        textTransform: 'uppercase',
                        borderTop: '5px solid #000',
                        paddingTop: '12px',
                        width: '100%',
                        textAlign: 'center'
                    }}>
                        {spacedTagId}
                    </div>
                </div>
            </div>
            
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet" />
        </div>
    );
};
