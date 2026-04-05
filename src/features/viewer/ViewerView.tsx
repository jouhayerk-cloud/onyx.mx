import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAtom } from 'jotai';
import { Loader2, Search, Package, Ruler, Scale, X, Maximize2, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react';
import { viewerSearchQueryAtom, exchangeRateAtom, workbookVersionAtom } from '../../lib/atoms';
import { resolveArtifact, ResolvedArtifact } from '../../lib/artifactUtils';
import { OnyxLogo } from '../../components/OnyxLogo';
import { vendors } from '../../lib/consts';

// ── Condensed Viewer Card ─────────────────────────────────────────────────────
const ViewerCard: React.FC<{ 
    item: ResolvedArtifact; 
    onOpenFull: () => void;
}> = ({ item, onOpenFull }) => {
    const data = item.data;
    const codes = item.codes;
    const vendorCode = (codes.bookBardcode || '').substring(0, 2).toUpperCase();
    const vendorColor = (vendors as any)[vendorCode]?.color || '#6BCEBB';
    
    const imageUrl = item.images[0] || null;
    const typeLabel = [data.shape, data.shortDescription].filter(Boolean).join(' ') || 'Stone Artifact';
    const materialLabel = [data.color, data.material].filter(Boolean).join(' ') || 'Natural Stone';

    const dimStr = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×');

    return (
        <div 
            className="group relative flex flex-col bg-white/5 border border-white/10 rounded-3xl overflow-hidden hover:border-white/20 transition-all hover:translate-y--1 cursor-pointer"
            onClick={onOpenFull}
        >
            {/* Image Section */}
            <div className="aspect-square bg-black/40 relative overflow-hidden">
                {imageUrl ? (
                    <img src={imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={typeLabel} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-10">
                        <Package size={48} strokeWidth={1} />
                    </div>
                )}
                {/* Vendor Badge */}
                <div className="absolute top-4 left-4 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight text-black shadow-2xl" style={{ backgroundColor: vendorColor }}>
                    {codes.bookBardcode}
                </div>
            </div>

            {/* Content Section */}
            <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-black text-white uppercase tracking-tighter truncate">{typeLabel}</h3>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">{materialLabel}</p>
                </div>

                {/* Micro Specs */}
                <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                    {codes.bookAqCode && (
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">AQ {codes.bookAqCode}</span>
                    )}
                    {codes.bookLandCode && (
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">LD {codes.bookLandCode}</span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-black text-white/60">{data.quantity || 1}</span>
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Items</span>
                    </div>
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
        <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-white/20 overflow-y-auto">
            {/* Header / Search Marquee */}
            <div className={`transition-all duration-700 ${isInitial && results.length === 0 ? 'min-h-screen flex flex-col items-center justify-center' : 'pt-20 pb-12'}`}>
                <div className="max-w-4xl mx-auto w-full px-6 flex flex-col gap-12">
                    {/* Logo & Title */}
                    <div className={`flex flex-col items-center gap-6 transition-all duration-700 ${isInitial ? 'scale-110' : 'scale-90 opacity-60'}`}>
                        <OnyxLogo width={48} height={48} />
                        <div className="text-center">
                            <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter leading-none italic">Viewer</h1>
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.6em] mt-3 ml-2">Clean Search Module v1.80.0</p>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-white/20 group-focus-within:text-white transition-colors">
                            <Search size={24} strokeWidth={2.5} />
                        </div>
                        <input
                            type="text"
                            value={query}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            placeholder="INPUT BARCODES SEPARATED BY SPACE..."
                            className="w-full h-24 sm:h-32 px-20 bg-white/5 border-2 border-white/10 rounded-[40px] text-xl sm:text-3xl font-black uppercase tracking-tight placeholder:text-white/10 focus:border-white/40 focus:bg-white/10 transition-all outline-none"
                        />
                        {loading && (
                            <div className="absolute inset-y-0 right-10 flex items-center">
                                <Loader2 size={32} className="animate-spin text-white/20" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Results Grid */}
            {!isInitial && (
                <div className="max-w-[1600px] mx-auto px-6 pb-24">
                    {results.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
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
            )}

            <style>{`
                :root { color-scheme: dark; }
                .overflow-y-auto::-webkit-scrollbar { width: 0px; }
            `}</style>
        </div>
    );
};
