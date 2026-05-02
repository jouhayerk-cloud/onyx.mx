import React from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { selectedInventoryIdsAtom } from '../../lib/atoms';
import { 
    Printer, Nfc, Package, DollarSign, Tag, Copy, MoreHorizontal 
} from 'lucide-react';

export const InventorySelectionDock: React.FC = () => {
    const [selectedIds] = useAtom(selectedInventoryIdsAtom);

    if (selectedIds.length === 0) return null;

    return (
        <div className="fixed bottom-0 left-[var(--sidebar-width,0px)] right-0 z-[1000] animate-in slide-in-from-bottom duration-500 pointer-events-none">
            <div className="bg-black/10 backdrop-blur-3xl border-t border-white/5 px-10 py-6 flex items-center justify-between shadow-[0_-20px_80px_rgba(0,0,0,0.4)] pointer-events-auto">
                <div className="flex items-center gap-6 group transition-all">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-white/20 tracking-[0.5em] leading-none mb-1">RECORD_SELECTION</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-(--main-color) font-black text-4xl leading-none drop-shadow-[0_0_15px_rgba(var(--main-color-rgb),0.5)]">
                                {selectedIds.length}
                            </span>
                            <span className="text-[14px] font-black text-white/40 tracking-widest uppercase">ITEMS</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-14 pr-4">
                    <button className="text-white/40 hover:text-white transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Print Labels">
                        <Printer size={34} strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">PRINT</span>
                    </button>
                    <button className="text-white/40 hover:text-white transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Write NFC">
                        <Nfc size={34} strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">NFC</span>
                    </button>
                    <button className="text-white/40 hover:text-white transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Pack Items">
                        <Package size={34} strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">PACK</span>
                    </button>
                    <button className="text-white/40 hover:text-green-400 transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Payment Workflow">
                        <DollarSign size={34} strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">PAY</span>
                    </button>
                    <button className="text-white/40 hover:text-(--main-color) transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Manage Tags">
                        <Tag size={34} strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">TAGS</span>
                    </button>
                    <button className="text-white/40 hover:text-blue-400 transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" title="Copy Tag IDs">
                        <Copy size={34} strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">COPY</span>
                    </button>
                    
                    <div className="w-px h-12 bg-white/10 mx-2" />
                    
                    <button className="text-white/20 hover:text-white transition-all hover:rotate-90 p-0 bg-transparent border-none outline-none">
                        <MoreHorizontal size={34} strokeWidth={2} />
                    </button>
                </div>
            </div>
        </div>
    );
};
