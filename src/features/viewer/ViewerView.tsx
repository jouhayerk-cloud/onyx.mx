import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAtom } from 'jotai';
import { viewerSearchQueryAtom, exchangeRateAtom, workbookVersionAtom } from '../../lib/atoms';
import { resolveArtifact, ResolvedArtifact } from '../../lib/artifactUtils';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { OnyxLogo } from '../../components/OnyxLogo';
import { vendors } from '../../lib/consts';
import { Video, Maximize2, Loader2, Search, Package } from 'lucide-react';

// ── Condensed Viewer Card ─────────────────────────────────────────────────────
const ViewerCard: React.FC<{ 
    item: ResolvedArtifact; 
    onOpenFull: () => void;
}> = ({ item, onOpenFull }) => {
    const norm = item.data;
    const codes = item.codes;
    const vendorCode = (codes.bookBardcode || '').substring(0, 2).toUpperCase();
    const vendorColor = (vendors as any)[vendorCode]?.color || '#6BCEBB';
    
    // Status colors and icons
    const accentColor = '#38bdf8'; // Default to a professional blue
    
    const displayUrlsArr = item.images.slice(0, 24);
    const materialLabel = [norm.color, norm.material].filter(Boolean).join(' ') || 'Natural Stone';
    const typeLabel = [norm.shape, norm.shortDescription].filter(Boolean).join(' ') || 'Stone Artifact';

    return (
        <div 
            className="group flex flex-col rounded-[40px] overflow-hidden bg-white/2 border border-white/5 hover:border-white/10 transition-all shadow-xl cursor-pointer"
            onClick={onOpenFull}
        >
            {/* Image Grid Section - Matches Inventory Gallery Card Grid Logic */}
            <div className="relative w-full bg-black/20 overflow-hidden">
                {item.images.length > 0 ? (
                    <div className="aspect-square relative">
                         <img src={getCleanImageUrl(item.images[0])} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" alt={typeLabel} />
                         {/* Vendor Badge */}
                         <div className="absolute top-6 left-6 z-10 flex flex-col gap-3">
                             <div className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-xl bg-black/60 border border-white/10 flex items-center gap-2" style={{ color: vendorColor, borderColor: vendorColor + '40' }}>
                                 {codes.bookBardcode}
                             </div>
                             {/* AQ / LD Micro Tags */}
                             <div className="flex items-center gap-2">
                                 {codes.bookAqCode && <div className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-xl bg-black/40 border border-white/5 text-white/40">{codes.bookAqCode}</div>}
                                 {codes.bookLandCode && <div className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-xl bg-black/40 border border-white/5 text-white/40">{codes.bookLandCode}</div>}
                             </div>
                         </div>
                    </div>
                ) : (
                    <div className="aspect-square flex items-center justify-center opacity-10">
                        <Package size={48} strokeWidth={1} />
                    </div>
                )}
            </div>

            {/* Premium Metadata Section - Matches TagView / Gallery Design */}
            <div className="p-8 flex flex-col gap-1 w-full">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter leading-tight truncate pr-4">{typeLabel}</h3>
                    <span className="text-lg font-mono font-black text-white/40 shrink-0">x{norm.quantity || 1}</span>
                </div>
                <div className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em] mt-2 mb-4 truncate">{materialLabel}</div>
                
                <div className="flex items-center justify-between pt-6 border-t border-white/5 mt-4">
                    <div className="flex items-center gap-6">
                       <div className="flex flex-col">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Dimensions</span>
                            <span className="text-xs font-black text-white/60 font-mono">
                                {[norm.lengthCm, norm.widthCm, norm.heightCm].filter(Boolean).join('×') || 'ND'} CM
                            </span>
                       </div>
                       <div className="flex flex-col border-l border-white/10 pl-6">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Net Weight</span>
                            <span className="text-xs font-black text-white/60 font-mono">{norm.weightKg || 'ND'} KG</span>
                       </div>
                    </div>
                    <Maximize2 size={16} className="text-white/10 group-hover:text-white/40 transition-all shrink-0" />
                </div>
            </div>
        </div>
    );
};

// ── Main Viewer Module ───────────────────────────────────────────────────────
export const ViewerView: React.FC<{ onOpenArtifact?: (id: string) => void }> = ({ onOpenArtifact }) => {
    const [query, setQuery] = useAtom(viewerSearchQueryAtom);
    const [exchangeRate] = useAtom(exchangeRateAtom);
    const [wbPrefix] = useAtom(workbookVersionAtom);

    const [results, setResults] = useState<ResolvedArtifact[]>([]);
    const [loading, setLoading] = useState(false);
    const [isInitial, setIsInitial] = useState(true);

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
            console.error("Batch search error:", err);
        } finally {
            setLoading(false);
        }
    }, [exchangeRate, wbPrefix]);

    // Initial search on load if query exists
    useEffect(() => {
        if (query) performSearch(query);
    }, []);

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') performSearch(query);
    };

    return (
        <div className="h-full flex flex-col bg-[#050505] text-white selection:bg-white/20 overflow-hidden relative">
            {/* Header / Search Marquee - Fixed at top */}
            <div className={`shrink-0 transition-all duration-700 ${isInitial && results.length === 0 ? 'h-full flex flex-col items-center justify-center' : 'pt-8 pb-8'}`}>
                <div className="max-w-4xl mx-auto w-full px-6 flex flex-col gap-12">
                    {/* Logo & Title - Hidden when results active */}
                    {(isInitial && results.length === 0) && (
                        <div className={`flex flex-col items-center gap-6 transition-all duration-700 scale-110`}>
                            <OnyxLogo width={48} height={48} />
                        </div>
                    )}

                    {/* Search Bar - Shrinks when results active */}
                    <div className="relative group">
                        <div className={`absolute inset-y-0 left-8 flex items-center pointer-events-none text-white/20 group-focus-within:text-white transition-all ${!isInitial ? 'scale-75 translate-x--2' : ''}`}>
                            <Search size={28} strokeWidth={2.5} />
                        </div>
                        <input
                            type="text"
                            value={query}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            placeholder="INPUT BARCODES SEPARATED BY SPACE..."
                            className={`w-full transition-all duration-700 bg-white/2 border border-white/10 rounded-full font-black uppercase tracking-tight placeholder:text-white/5 focus:border-white/20 focus:bg-white/5 outline-none shadow-2xl ${
                                isInitial && results.length === 0 
                                ? 'h-24 sm:h-32 px-24 text-xl sm:text-3xl' 
                                : 'h-16 px-16 text-base sm:text-lg'
                            }`}
                        />
                        {loading && (
                            <div className="absolute inset-y-0 right-10 flex items-center">
                                <Loader2 size={24} className="animate-spin text-white/20" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Results Grid - Scrollable Section */}
            {!isInitial && (
                <div className="flex-1 overflow-y-auto px-6 pb-24 custom-scrollbar">
                    <div className="max-w-[1600px] mx-auto w-full">
                        {results.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                {results.map((item, idx) => (
                                    <ViewerCard 
                                        key={`${item.data.id}-${idx}`} 
                                        item={item} 
                                        onOpenFull={() => onOpenArtifact?.(item.data.book_barcode || item.data.tag_id)} 
                                    />
                                ))}
                            </div>
                        ) : !loading && (
                            <div className="flex flex-col items-center justify-center py-32 gap-6 opacity-40">
                                <Package size={64} strokeWidth={0.5} />
                                <p className="text-xs font-black uppercase tracking-widest text-center">No matching artifacts detected in this sector</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                :root { color-scheme: dark; }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { 
                    background: rgba(255, 255, 255, 0.1); 
                    border-radius: 10px; 
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { 
                    background: rgba(255, 255, 255, 0.2); 
                }
            `}} />
        </div>
    );
};
