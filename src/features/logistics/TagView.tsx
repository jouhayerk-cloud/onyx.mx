import React, { useMemo, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { inventoryAtom, exchangeRateAtom, workbookVersionAtom } from '../../lib/atoms';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import { Package, Ruler, Weight, Tag as TagIcon, ArrowLeft, Share2, Loader2, Sparkles, ChevronLeft, ChevronRight, Info } from 'lucide-react';

interface TagViewProps {
    tagId: string;
    onBack?: () => void;
}

export const TagView: React.FC<TagViewProps> = ({ tagId, onBack }) => {
    const inventory = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    
    const [fetchedItem, setFetchedItem] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    useEffect(() => {
        const fetchStandalone = async () => {
            if (!tagId) return;
            setLoading(true);
            try {
                // 1. Direct match by column
                const { data: directData } = await supabase.from('inventory').select('*').eq('book_barcode', tagId).maybeSingle();
                if (directData) { setFetchedItem({ data: directData }); return; }

                // 2. Parse Fallback
                const match = tagId.match(/^([A-Z]{2})([0-9]{3})([0-9]+)([A-Z]+)$/i);
                if (match) {
                    const [_, vendorPrefix, wbStr, itemNumStr] = match;
                    const { data: parsedData } = await supabase.from('inventory').select('*')
                        .or(`workbook.eq.${wbStr},workbook.eq.V${wbStr},workbook.eq.v${wbStr}`)
                        .eq('item_number', parseInt(itemNumStr, 10));

                    const found = parsedData?.find(d => String(d.item_id || d.itemId || d.id || '').toUpperCase().startsWith(vendorPrefix.toUpperCase()));
                    if (found) { setFetchedItem({ data: found }); return; }
                }

                // 3. Fallback to production
                const { data: prodData } = await supabase.from('production').select('*').eq('tag_id', tagId).maybeSingle();
                if (prodData) setFetchedItem({ data: prodData, source: 'production' });
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchStandalone();
    }, [tagId]);

    const item = useMemo(() => {
        if (!fetchedItem) return null;
        const data = normalizeInventoryData(fetchedItem.data);
        const codes = calculateCodesAndPrices(data, exchangeRate || 20, workbookPrefix || '326');
        
        // Extract all possible images
        const images: string[] = [];
        if (data.generatedPngUrl) images.push(data.generatedPngUrl);
        if (data.mediaUrls) String(data.mediaUrls).split(',').forEach(u => images.push(u.trim()));
        if (data.generatedImageUrls) String(data.generatedImageUrls).split(',').forEach(u => images.push(u.trim()));
        
        const uniqueImages = Array.from(new Set(images.filter(Boolean))).map(url => getCleanImageUrl(url));

        return { ...fetchedItem, data, codes, images: uniqueImages };
    }, [fetchedItem, exchangeRate, workbookPrefix]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white gap-4">
            <Loader2 className="animate-spin text-black/20" size={40} />
            <span className="text-[10px] font-black text-black/40 uppercase tracking-[0.4em]">Resolving Artifact</span>
        </div>
    );

    if (!item) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white p-12 text-center gap-8">
            <div className="w-24 h-24 rounded-full bg-black/5 flex items-center justify-center text-black/20"><Package size={48} strokeWidth={1} /></div>
            <div className="flex flex-col gap-3">
                <h1 className="text-3xl font-black text-black uppercase tracking-tighter">Trace Lost</h1>
                <p className="text-sm text-black/40 font-bold uppercase tracking-widest max-w-xs">{tagId} trace could not be resolved.</p>
            </div>
            {onBack && <button onClick={onBack} className="px-10 py-4 rounded-full bg-black text-white font-black uppercase tracking-widest text-[10px]">Back to Workspace</button>}
        </div>
    );

    const vendorCode = tagId.substring(0, 2);
    const vendorColor = (vendors as any)[vendorCode]?.color || '#000';
    const hasMultipleImages = item.images.length > 1;

    return (
        <div className="flex flex-col min-h-screen bg-[#FDFDFD] text-black overflow-y-auto overflow-x-hidden selection:bg-black selection:text-white">
            {/* Fullscreen Hero Gallery */}
            <div className="relative w-screen aspect-square md:aspect-video bg-white overflow-hidden group">
                {item.images.length > 0 ? (
                    <img 
                        src={item.images[currentImageIndex]} 
                        alt={tagId} 
                        className="w-full h-full object-cover transition-all duration-700" 
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/5"><Package size={100} strokeWidth={0.5} className="opacity-10" /></div>
                )}

                {/* Overlays */}
                <div className="absolute inset-x-0 top-0 p-8 flex items-center justify-between z-10">
                    <button onClick={onBack} className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-md border border-black/5 flex items-center justify-center text-black shadow-sm transition-all hover:scale-110 active:scale-95">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="px-6 py-2 rounded-full bg-white/80 backdrop-blur-md border border-black/5 text-[11px] font-black uppercase tracking-[0.2em] shadow-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: vendorColor }} />
                        {tagId}
                    </div>
                </div>

                {hasMultipleImages && (
                    <div className="absolute inset-y-0 inset-x-0 flex items-center justify-between px-6 pointer-events-none">
                        <button 
                            onClick={() => setCurrentImageIndex(prev => (prev === 0 ? item.images.length - 1 : prev - 1))}
                            className="w-14 h-14 rounded-full bg-white/20 hover:bg-white/80 backdrop-blur-md border border-white/20 pointer-events-auto flex items-center justify-center text-black/40 hover:text-black transition-all"
                        >
                            <ChevronLeft size={32} />
                        </button>
                        <button 
                            onClick={() => setCurrentImageIndex(prev => (prev === item.images.length - 1 ? 0 : prev + 1))}
                            className="w-14 h-14 rounded-full bg-white/20 hover:bg-white/80 backdrop-blur-md border border-white/20 pointer-events-auto flex items-center justify-center text-black/40 hover:text-black transition-all"
                        >
                            <ChevronRight size={32} />
                        </button>
                    </div>
                )}

                {hasMultipleImages && (
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-2">
                        {item.images.map((_, idx) => (
                            <div key={idx} className={`h-1.5 transition-all rounded-full ${idx === currentImageIndex ? 'w-8 bg-white' : 'w-2 bg-white/40'}`} />
                        ))}
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="flex-1 max-w-2xl mx-auto w-full p-8 md:p-16 flex flex-col gap-16 pb-32">
                {/* Large Responsive Header */}
                <div className="flex flex-col gap-8">
                    <div className="flex flex-col gap-2">
                         <div className="flex items-center gap-3">
                            <span 
                                className="text-[12px] font-black uppercase tracking-[0.4em] px-4 py-1.5 rounded-full"
                                style={{ backgroundColor: `${vendorColor}15`, color: vendorColor }}
                            >
                                {vendorCode} AUTHENTIC
                            </span>
                            <span className="text-[12px] font-black text-black/10 uppercase tracking-[0.4em]">Verified Piece</span>
                        </div>
                        <h1 className="text-6xl md:text-8xl font-black text-black uppercase tracking-tighter italic leading-none">{item.data.itemId || 'CRYSTAL'}</h1>
                        <p className="text-2xl md:text-3xl font-bold text-black/30 uppercase leading-snug tracking-tight italic">{item.data.description || 'ONYX PIECE'}</p>
                    </div>

                    {/* Quick Specs Pill */}
                    <div className="flex flex-wrap gap-4">
                        <div className="px-6 py-3 bg-black/5 border border-black/5 rounded-full flex items-center gap-3">
                            <TagIcon size={14} />
                            <span className="text-[11px] font-black uppercase tracking-widest">{item.data.category || item.data.itemType || 'Decorative'}</span>
                        </div>
                        <div className="px-6 py-3 bg-black/5 border border-black/5 rounded-full flex items-center gap-3">
                            <Sparkles size={14} />
                            <span className="text-[11px] font-black uppercase tracking-widest">{item.data.material || 'Onyx'}</span>
                        </div>
                    </div>
                </div>

                {/* Primary Specs Grid (Light High Contrast) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="flex flex-col gap-6">
                        <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-black/20 ml-1">Composition</h3>
                        <div className="grid gap-6">
                            <div className="flex justify-between items-baseline border-b border-black/5 pb-4">
                                <span className="text-[11px] font-black text-black/40 uppercase tracking-widest">Weight</span>
                                <span className="text-3xl font-black tracking-tighter">{item.data.weightKg || '0.0'}<span className="text-xs opacity-30 ml-1">KG</span></span>
                            </div>
                            <div className="flex justify-between items-baseline border-b border-black/5 pb-4">
                                <span className="text-[11px] font-black text-black/40 uppercase tracking-widest">Dimensions</span>
                                <span className="text-3xl font-black tracking-tighter">{item.data.widthCm || 0}×{item.data.heightCm || 0}<span className="text-xs opacity-30 ml-1">CM</span></span>
                            </div>
                             <div className="flex justify-between items-baseline border-b border-black/5 pb-4">
                                <span className="text-[11px] font-black text-black/40 uppercase tracking-widest">Material</span>
                                <span className="text-xl font-bold uppercase">{item.data.material || 'Onyx'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-6">
                        <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-black/20 ml-1">Internal Reference</h3>
                        <div className="bg-black text-white p-8 rounded-[3rem] flex flex-col gap-10">
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Acquisition Code</span>
                                <span className="text-4xl font-black font-mono tracking-widest">{item.codes.bookAqCode}</span>
                            </div>
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Landed Code</span>
                                <span className="text-4xl font-black font-mono tracking-widest">{item.codes.bookLandCode}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Retail MSRP Section (Premium Focus) */}
                {item.codes.bookRetail && (
                   <div className="bg-white border-4 border-black p-12 rounded-[4rem] text-center flex flex-col gap-6 shadow-2xl shadow-black/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 text-black/5 group-hover:text-black/10 transition-colors">
                            <Sparkles size={120} />
                        </div>
                        <span className="text-[12px] font-black uppercase tracking-[0.6em] text-black/30 italic">Certified Artifact Value</span>
                        <div className="flex items-baseline justify-center gap-3">
                            <span className="text-8xl md:text-9xl font-black tracking-tighter">{item.codes.bookRetail}</span>
                            <span className="text-xl font-black text-black/30">USD</span>
                        </div>
                        <p className="text-[10px] font-medium text-black/40 uppercase tracking-[0.3em] font-mono">Global Certificate of Origin & Authenticity</p>
                   </div>
                )}
            </div>

            {/* Bottom Contact (Minimal fixed bar) */}
            <div className="fixed bottom-0 left-0 right-0 p-6 z-50 pointer-events-none">
                <div className="max-w-md mx-auto pointer-events-auto">
                    <button className="w-full bg-black text-white h-20 rounded-[2.5rem] font-black uppercase tracking-[0.4em] text-xs shadow-2xl hover:scale-[0.98] transition-all flex items-center justify-center gap-4">
                        <Sparkles size={20} className="text-[#00A8E8]" />
                        Inquire Piece Details
                    </button>
                </div>
            </div>

            <style>{`
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: #FDFDFD; }
                ::-webkit-scrollbar-thumb { background: #000; border-radius: 10px; }
            `}</style>
        </div>
    );
};
