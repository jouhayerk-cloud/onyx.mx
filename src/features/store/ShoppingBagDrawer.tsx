import React from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue } from 'jotai';
import { 
    storeShoppingBagAtom, 
    isStoreBagOpenAtom 
} from '../../lib/atoms';
import { 
    normalizeInventoryData, 
    getCleanImageUrl 
} from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { 
    ShoppingBag, 
    X, 
    Trash2, 
    Box, 
    ArrowRight 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { tr } from '../../lib/i18n';

export const ShoppingBagDrawer = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    const [bag, setBag] = useAtom(storeShoppingBagAtom);
    
    if (!isOpen) return null;

    const onRemoveItem = (item: any) => {
        setBag(prev => prev.filter(b => b.row !== item.row));
        toast.success(tr("Removed from bag"));
    };

    const onAcquireAll = async () => {
        if (bag.length === 0) return;
        const tid = toast.loading(`Acquiring ${bag.length} Artifacts...`);
        try {
            for (const item of bag) {
                const id = item.row || item.id;
                const tableName = item.source === 'production' ? 'production' : 'inventory';
                const { error } = await supabase.from(tableName).update({ 
                    status: 'Acquired',
                    updated_at: new Date().toISOString()
                }).eq('id', id);
                if (error) throw error;
            }
            toast.success(tr("Batch Acquisition Complete!"), { id: tid });
            setBag([]);
            onClose();
        } catch (err: any) {
            toast.error(`Batch failed: ${err.message}`, { id: tid });
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-10000 overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-500" onClick={onClose} />
            
            <div className="absolute top-0 right-0 bottom-0 w-full max-w-xl bg-[#0a0a0a] border-l border-white/10 shadow-[-50px_0_100px_rgba(0,0,0,0.5)] flex flex-col animate-in slide-in-from-right duration-700 ease-out">
                {/* Header */}
                <div className="p-12 border-b border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                            <ShoppingBag className="text-(--main-color)" size={28} />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">{tr("Acquisition Bag")}</h2>
                            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mt-2 leading-none">{bag.length} {tr("Selected Artifacts")}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-full hover:bg-white/5 flex items-center justify-center text-white/20 hover:text-white transition-all">
                        <X size={24} />
                    </button>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto p-12 custom-scrollbar flex flex-col gap-6">
                    {bag.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 gap-6 text-center">
                            <Box size={60} strokeWidth={0.5} />
                            <p className="text-[10px] font-black uppercase tracking-[0.4em]">{tr("Bag is currently empty")}</p>
                        </div>
                    ) : (
                        bag.map((item, idx) => {
                            const n = normalizeInventoryData(item.data);
                            return (
                                <div key={item.row || item.id} className="p-3 bg-white/2 border border-white/5 rounded-2xl hover:bg-white/5 transition-all cursor-pointer group flex items-center gap-6" style={{ animationDelay: `${idx * 50}ms` }}>
                                    <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-black/40 border border-white/5">
                                        <img src={getCleanImageUrl(n.generatedPngUrl || (n.mediaUrls ? String(n.mediaUrls).split(',')[0] : ''))} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 flex flex-col justify-center min-w-0">
                                        <h4 className="text-sm font-black text-white uppercase italic tracking-tighter truncate">{n.shape} {n.shortDescription}</h4>
                                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">{n.color} {n.material}</p>
                                        <div className="mt-3 text-xs font-black text-(--main-color) font-mono tracking-widest">${Number(n.price_mxn || n.price || 0).toLocaleString()} <span className="text-[8px] opacity-40 ml-1">MXN</span></div>
                                    </div>
                                    <button onClick={() => onRemoveItem(item)} className="w-10 h-10 rounded-full flex items-center justify-center text-white/10 hover:text-red-500 hover:bg-red-500/10 transition-all">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Action */}
                {bag.length > 0 && (
                    <div className="p-12 border-t border-white/5 bg-black/40 backdrop-blur-3xl shrink-0">
                        <button 
                            onClick={onAcquireAll}
                            className="w-full h-24 bg-(--main-color) text-black rounded-none flex items-center justify-center gap-6 group hover:scale-[1.02] shadow-[0_20px_60px_-10px_rgba(var(--main-color-rgb),0.3)] transition-all"
                        >
                            <span className="text-sm font-black uppercase tracking-[0.5em] ml-12">{tr("Commit Acquisition →")}</span>
                            <div className="w-12 h-12 bg-black/10 rounded-full flex items-center justify-center group-hover:bg-black/20 transition-all">
                                <ArrowRight size={20} />
                            </div>
                        </button>
                        <p className="text-[10px] font-bold text-white/10 uppercase tracking-[0.2em] text-center mt-6">{tr("These items will be migrated to the Inventory Workforce")}</p>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
