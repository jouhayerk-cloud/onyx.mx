
import React from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { 
    activeViewAtom, 
    isInventorySelectionModeAtom,
    selectedInventoryIdsAtom,
    isPackingCrateWizardOpenAtom,
    isPaymentWizardOpenAtom,
    isPackingPrintWizardOpenAtom,
    isPackingNFCWizardOpenAtom,
    logisticsSubTabAtom,
    isUploadWizardOpenAtom
} from '../../lib/atoms';
import { 
    Tag, Package, CreditCard, Printer, Nfc, Plus, 
    FileText, Download, CheckSquare, Square, X,
    Layers, Truck, Share2, Clipboard
} from 'lucide-react';
import { PaymentWizard } from '../finance/PaymentWizard';

export const UniversalToolsBar: React.FC = () => {
    const activeView = useAtomValue(activeViewAtom);
    const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);
    const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
    const logisticsSubTab = useAtomValue(logisticsSubTabAtom);
    
    const setIsPrintWizardOpen = useSetAtom(isPackingPrintWizardOpenAtom);
    const setIsNFCWizardOpen = useSetAtom(isPackingNFCWizardOpenAtom);
    const setIsPackingCrateWizardOpen = useSetAtom(isPackingCrateWizardOpenAtom);
    const setIsPaymentWizardOpen = useSetAtom(isPaymentWizardOpenAtom);
    const setIsUploadWizardOpen = useSetAtom(isUploadWizardOpenAtom);

    if (!activeView) return null;

    // Inventory specific tools
    const isInventory = activeView === 'inventory';
    const hasSelection = selectedIds.length > 0;

    const handleClearSelection = () => {
        setSelectedIds([]);
    };

    const handleToggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        if (isSelectionMode) handleClearSelection();
    };

    return (
        <div className="w-full bg-black/5 border-b border-white/5 px-8 py-4 flex items-center justify-between z-[400] animate-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-8">
                {/* Module Context Label - Minimalist */}
                <div className="flex items-center gap-3">
                    <Layers size={14} className="text-(--main-color) opacity-80" />
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">
                        {activeView === 'inventory' ? 'Inventory' : 
                         activeView === 'logistics' ? `Logistics • ${logisticsSubTab.toUpperCase()}` : 
                         activeView.toUpperCase()}
                    </span>
                </div>

                {/* Shared Selection Toggle - Borderless */}
                {isInventory && (
                    <button 
                        onClick={handleToggleSelectionMode}
                        className={`flex items-center gap-3 transition-all ${isSelectionMode ? 'text-(--main-color)' : 'text-white/40 hover:text-white'}`}
                    >
                        {isSelectionMode ? <CheckSquare size={18} strokeWidth={2.5} /> : <Square size={18} strokeWidth={2.5} />}
                        <span className="text-[11px] font-black uppercase tracking-widest">Selection Mode</span>
                    </button>
                )}
            </div>

            <div className="flex items-center gap-8">
                {/* Selection Specific Actions - Containerless & High Contrast */}
                {hasSelection && (
                    <div className="flex items-center gap-8 animate-in zoom-in-95 duration-300">
                        <div className="h-4 w-px bg-white/10" />
                        
                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">
                            {selectedIds.length} ITEMS
                        </span>

                        <button 
                            onClick={() => setIsPrintWizardOpen(true)}
                            className="flex items-center gap-2.5 text-white hover:text-(--main-color) transition-all group"
                        >
                            <Printer size={18} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
                            <span className="text-[11px] font-black uppercase tracking-widest">Labels</span>
                        </button>

                        <button 
                            onClick={() => setIsNFCWizardOpen(true)}
                            className="flex items-center gap-2.5 text-white hover:text-(--main-color) transition-all group"
                        >
                            <Nfc size={18} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
                            <span className="text-[11px] font-black uppercase tracking-widest">NFC</span>
                        </button>

                        <button 
                            onClick={() => setIsPackingCrateWizardOpen(true)}
                            className="flex items-center gap-2.5 text-white hover:text-(--main-color) transition-all group"
                        >
                            <Package size={18} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
                            <span className="text-[11px] font-black uppercase tracking-widest">Pack</span>
                        </button>

                        <button 
                            onClick={() => setIsPaymentWizardOpen(true)}
                            className="flex items-center gap-2.5 text-white hover:text-(--main-color) transition-all group"
                        >
                            <CreditCard size={18} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
                            <span className="text-[11px] font-black uppercase tracking-widest">Pay</span>
                        </button>

                        <button 
                            onClick={handleClearSelection}
                            className="text-white/20 hover:text-red-500 transition-all flex items-center gap-2"
                            title="Clear Selection"
                        >
                            <X size={18} strokeWidth={2.5} />
                            <span className="text-[11px] font-black uppercase tracking-widest">Clear</span>
                        </button>
                    </div>
                )}

                {/* Default Actions - High Contrast */}
                {!hasSelection && isInventory && (
                    <button 
                        onClick={() => setIsUploadWizardOpen(true)}
                        className="flex items-center gap-3 text-(--main-color) hover:text-white transition-all group scale-110"
                    >
                        <Plus size={20} strokeWidth={3.5} className="group-hover:rotate-90 transition-transform duration-500" />
                        <span className="text-[12px] font-black uppercase tracking-widest">Add Entry</span>
                    </button>
                )}
            </div>
        </div>
    );
};
