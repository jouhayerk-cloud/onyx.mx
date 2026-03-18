import React, { useMemo, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { inventoryAtom, exchangeRateAtom, workbookVersionAtom } from '../../lib/atoms';
import { calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import { Package, Ruler, Weight, Tag as TagIcon, ArrowLeft, Share2, Loader2, Sparkles } from 'lucide-react';

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

    useEffect(() => {
        const findLocal = () => {
             return inventory.find(i => {
                const data = normalizeInventoryData(i.data);
                const codes = calculateCodesAndPrices(data, exchangeRate, workbookPrefix);
                return codes.bookBardcode === tagId;
            });
        };

        const localMatch = findLocal();
        if (localMatch) {
            setFetchedItem(localMatch);
            setLoading(false);
            return;
        }

        // Standalone Fetch from Supabase
        const fetchStandalone = async () => {
            setLoading(true);
            try {
                // Since tagId (barcode) is composite, we first query by prefix or guess the ID
                // Better approach: query inventory table where book_barcode matches tagId
                // Note: book_barcode might not be stored, so we might need to search or reconstruct
                // Actually, let's try searching for the barcode in the database if possible
                // OR search by item_id (which is part of the barcode)
                
                const { data, error } = await supabase
                    .from('inventory')
                    .select('*')
                    .eq('book_barcode', tagId)
                    .maybeSingle();

                if (data) {
                    setFetchedItem({ data });
                } else {
                    // Try production if not in inventory
                    const { data: prodData } = await supabase
                        .from('production')
                        .select('*')
                        .eq('tag_id', tagId)
                        .maybeSingle();
                    
                    if (prodData) setFetchedItem({ data: prodData, source: 'production' });
                }
            } catch (err) {
                console.error("Standalone fetch failed", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStandalone();
    }, [inventory, tagId, exchangeRate, workbookPrefix]);

    const item = useMemo(() => {
        if (!fetchedItem) return null;
        
        const data = normalizeInventoryData(fetchedItem.data);
        const codes = calculateCodesAndPrices(data, exchangeRate || 20, workbookPrefix || 'V1'); // Fallbacks for public view
        const baseImg = data.generatedPngUrl || (data.mediaUrls ? String(data.mediaUrls).split(',')[0].trim() : null);
        
        return {
            ...fetchedItem,
            data,
            codes,
            imageUrl: getCleanImageUrl(baseImg)
        };
    }, [fetchedItem, exchangeRate, workbookPrefix]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black gap-4">
                <Loader2 className="animate-spin text-(--main-color)" size={40} />
                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Resolving Artifact</span>
            </div>
        );
    }

    if (!item) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-6 animate-in fade-in duration-700">
                <div className="w-20 h-20 rounded-[2.5rem] bg-white/5 border border-white/10 flex items-center justify-center text-white/20">
                    <Package size={40} strokeWidth={1} />
                </div>
                <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-black text-white uppercase tracking-tighter italic">Artifact Not Found</h1>
                    <p className="text-sm text-white/40 font-bold uppercase tracking-widest max-w-xs">{tagId} trace could not be resolved in the current workspace.</p>
                </div>
                {onBack && (
                    <button onClick={onBack} className="mt-4 px-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/60 font-black uppercase tracking-widest text-[10px] hover:text-white transition-all">
                        Return to Logistics
                    </button>
                )}
            </div>
        );
    }

    const vendorCode = tagId.substring(0, 2);
    const vendorColor = (vendors as any)[vendorCode]?.color || '#FFF';

    return (
        <div className="flex flex-col min-h-screen bg-black text-white overflow-y-auto custom-scrollbar">
            {/* Minimal Header */}
            <div className="px-6 py-6 flex items-center justify-between sticky top-0 z-50 bg-black/80 backdrop-blur-3xl border-b border-white/5">
               {onBack ? (
                 <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all">
                    <ArrowLeft size={20} />
                 </button>
               ) : <div className="w-12" />}
               
               <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-(--main-color) uppercase tracking-[0.4em] leading-none mb-1">Authentic Crystal</span>
                    <span className="text-xs font-black text-white tracking-[0.2em] font-mono leading-none">{tagId}</span>
               </div>

               <button className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60">
                 <Share2 size={18} />
               </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col p-6 gap-8 max-w-lg mx-auto w-full pb-24">
                {/* Hero Image */}
                <div className="aspect-square w-full rounded-[3rem] overflow-hidden border border-white/10 bg-white/5 shadow-2xl relative">
                    {item.imageUrl ? (
                        <img src={item.imageUrl} alt={tagId} className="w-full h-full object-contain p-2" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-10">
                            <Package size={100} strokeWidth={0.5} />
                        </div>
                    )}
                    
                    <div className="absolute top-6 left-6 px-5 py-2 rounded-full border border-white/20 backdrop-blur-3xl flex items-center gap-3 bg-black/60" style={{ borderColor: `${vendorColor}44` }}>
                        <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: vendorColor, boxShadow: `0 0 15px ${vendorColor}` }} />
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{vendorCode} Origin</span>
                    </div>
                </div>

                {/* Info Hierarchy */}
                <div className="flex flex-col gap-10">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <div className="px-3 py-1 bg-white/10 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-white/60">
                                {item.data.shape || 'Natural'}
                            </div>
                            <div className="px-3 py-1 bg-white/10 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-white/60">
                                {item.data.material || 'ONYX'}
                            </div>
                        </div>
                        <h1 className="text-5xl font-black text-white uppercase italic tracking-tighter leading-none">{item.data.itemId}</h1>
                        <p className="text-xl font-medium text-white/50 uppercase leading-snug italic tracking-tight">{item.data.description}</p>
                    </div>

                    {/* Specs Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 border border-white/5 p-6 rounded-[2.5rem] flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-white/40">
                                <Ruler size={14} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Dimensions</span>
                            </div>
                            <span className="text-2xl font-black text-white font-mono tracking-tighter">
                                {item.data.widthCm}×{item.data.heightCm} <span className="text-xs opacity-30">CM</span>
                            </span>
                        </div>

                        <div className="bg-white/5 border border-white/5 p-6 rounded-[2.5rem] flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-white/40">
                                <Weight size={14} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Net Mass</span>
                            </div>
                            <span className="text-2xl font-black text-white font-mono tracking-tighter">
                                {item.data.weightKg || '0.0'} <span className="text-xs opacity-30">KG</span>
                            </span>
                        </div>
                    </div>

                    {/* Cost Verification (Encrypted for Clients) */}
                    <div className="bg-white/5 border border-white/5 p-8 rounded-[3rem] items-center text-center flex flex-col gap-6">
                         <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Internal Traceability</span>
                            <div className="flex items-center gap-10 mt-2">
                                <div className="flex flex-col items-center">
                                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">AQC</span>
                                    <span className="text-xl font-black text-white font-mono tracking-[0.2em]">{item.codes.bookAqCode}</span>
                                </div>
                                <div className="w-px h-8 bg-white/10" />
                                <div className="flex flex-col items-center">
                                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">LC</span>
                                    <span className="text-xl font-black text-white font-mono tracking-[0.2em]">{item.codes.bookLandCode}</span>
                                </div>
                            </div>
                         </div>
                    </div>

                    {/* Retail MSRP */}
                    {item.codes.bookRetail && (
                        <div className="bg-(--main-color)/10 border border-(--main-color)/30 p-10 rounded-[4rem] flex flex-col items-center gap-4 text-center relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-20">
                                <Sparkles size={100} />
                            </div>
                            <span className="text-[11px] font-black text-(--main-color) uppercase tracking-[0.6em] italic relative z-10">Authorized MSRP</span>
                            <div className="flex items-baseline gap-2 relative z-10">
                                <span className="text-7xl font-black text-white font-mono tracking-tighter">{item.codes.bookRetail}</span>
                                <span className="text-sm font-black text-white/40 font-mono tracking-widest leading-none">USD</span>
                            </div>
                            <div className="mt-4 px-6 py-2 bg-white/5 rounded-full border border-white/5 text-[9px] font-bold text-white/40 uppercase tracking-widest">
                                Global Value Certification
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Contact */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-linear-to-t from-black via-black/90 to-transparent">
                <button className="w-full bg-white text-black h-16 rounded-3xl font-black uppercase tracking-[0.2em] text-xs hover:scale-[0.98] transition-all flex items-center justify-center gap-3">
                    <Sparkles size={16} />
                    Inquire About Piece
                </button>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
            `}</style>
        </div>
    );
};
