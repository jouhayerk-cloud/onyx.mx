import React from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { 
    selectedInventoryIdsAtom, 
    inventoryAtom,
    isPackingPrintWizardOpenAtom,
    isPackingNFCWizardOpenAtom,
    isPackingCrateWizardOpenAtom,
    isPaymentWizardOpenAtom,
    exchangeRateAtom,
    workbookVersionAtom,
    isBatchActionsModalOpenAtom,
    batchActionItemsDataAtom
} from '../../lib/atoms';
import { 
    Printer, Nfc, Package, DollarSign, Tag, Copy, X 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { calculateCodesAndPrices } from '../../lib/utils';

export const InventorySelectionDock: React.FC = () => {
    const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
    const inventory = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const workbookPrefix = useAtomValue(workbookVersionAtom);
    
    const setPrintOpen = useSetAtom(isPackingPrintWizardOpenAtom);
    const setNFCOpen = useSetAtom(isPackingNFCWizardOpenAtom);
    const setPackOpen = useSetAtom(isPackingCrateWizardOpenAtom);
    const setPayOpen = useSetAtom(isPaymentWizardOpenAtom);
    
    const setIsBatchModalOpen = useSetAtom(isBatchActionsModalOpenAtom);
    const setBatchItemsData = useSetAtom(batchActionItemsDataAtom);

    if (selectedIds.length === 0) return null;

    const getSelectedItems = () => {
        return inventory.filter(item => selectedIds.includes(item.row));
    };

    const handleCopyTags = () => {
        const selectedItems = getSelectedItems();
        const tags = selectedItems.map(item => {
            const codes = calculateCodesAndPrices(item.data, exchangeRate, workbookPrefix);
            return codes.bookBarcode;
        }).filter(Boolean).join(' ');

        if (tags) {
            navigator.clipboard.writeText(tags);
            toast.success(`Copied ${selectedItems.length} tags to clipboard`, {
                style: {
                    background: '#1a1a1a',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase'
                }
            });
        }
    };

    const handleOpenTags = () => {
        const selectedItems = getSelectedItems();
        setBatchItemsData(selectedItems);
        setIsBatchModalOpen(true);
    };

    const handleClearSelection = () => {
        setSelectedIds([]);
    };

    return (
        <div className="fixed bottom-0 left-[var(--sidebar-width,0px)] right-0 z-[1000] animate-in slide-in-from-bottom duration-500 pointer-events-none">
            <div className="bg-black/10 backdrop-blur-3xl border-t border-white/5 px-6 md:px-10 py-4 md:py-6 flex items-center justify-between shadow-[0_-20px_80px_rgba(0,0,0,0.4)] pointer-events-auto overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-6 group transition-all flex-shrink-0">
                    <div className="flex flex-col">
                        <span className="text-[8px] md:text-[10px] font-black text-white/20 tracking-[0.5em] leading-none mb-1">RECORD_SELECTION</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-(--main-color) font-black text-2xl md:text-4xl leading-none drop-shadow-[0_0_15px_rgba(var(--main-color-rgb),0.5)]">
                                {selectedIds.length}
                            </span>
                            <span className="text-[10px] md:text-[14px] font-black text-white/40 tracking-widest uppercase">ITEMS</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-8 md:gap-14 pr-4 flex-shrink-0 ml-8 md:ml-0">
                    <button 
                        onClick={() => setPrintOpen(true)}
                        className="text-white/40 hover:text-white transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" 
                        title="Print Labels"
                    >
                        <Printer size={28} className="md:w-[34px] md:h-[34px]" strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">PRINT</span>
                    </button>
                    <button 
                        onClick={() => setNFCOpen(true)}
                        className="text-white/40 hover:text-white transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" 
                        title="Write NFC"
                    >
                        <Nfc size={28} className="md:w-[34px] md:h-[34px]" strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">NFC</span>
                    </button>
                    <button 
                        onClick={() => setPackOpen(true)}
                        className="text-white/40 hover:text-white transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" 
                        title="Pack Items"
                    >
                        <Package size={28} className="md:w-[34px] md:h-[34px]" strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">PACK</span>
                    </button>
                    <button 
                        onClick={() => setPayOpen(true)}
                        className="text-white/40 hover:text-green-400 transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" 
                        title="Payment Workflow"
                    >
                        <DollarSign size={28} className="md:w-[34px] md:h-[34px]" strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">PAY</span>
                    </button>
                    <button 
                        onClick={handleOpenTags}
                        className="text-white/40 hover:text-(--main-color) transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" 
                        title="Manage Tags"
                    >
                        <Tag size={28} className="md:w-[34px] md:h-[34px]" strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">TAGS</span>
                    </button>
                    <button 
                        onClick={handleCopyTags}
                        className="text-white/40 hover:text-blue-400 transition-all hover:scale-125 group relative p-0 bg-transparent border-none outline-none" 
                        title="Copy Tag IDs"
                    >
                        <Copy size={28} className="md:w-[34px] md:h-[34px]" strokeWidth={2} />
                        <span className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-[10px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap tracking-[0.2em] border border-white/10">COPY</span>
                    </button>
                    
                    <div className="w-px h-8 md:h-12 bg-white/10 mx-2 flex-shrink-0" />
                    
                    <button 
                        onClick={handleClearSelection}
                        className="text-white/20 hover:text-red-500 transition-all hover:rotate-90 p-0 bg-transparent border-none outline-none flex-shrink-0"
                    >
                        <X size={28} className="md:w-[34px] md:h-[34px]" strokeWidth={2} />
                    </button>
                </div>
            </div>
        </div>
    );
};
