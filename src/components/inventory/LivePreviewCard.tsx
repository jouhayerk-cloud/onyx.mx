import React, { useMemo } from 'react';
import { tr } from '../../lib/i18n';
import { calculateCodesAndPrices } from '../../lib/utils';
import { getTextColorForBg } from '../../lib/utils';
import { WireframeIcon } from '../../features/inventory/InventoryArtifact';

export const LivePreviewCard = ({ itemData, selectedVendorKey, exchangeRate, vendorData, tagPreview, onClearVendor, aiResults }: any) => {
    const finalItemId = `${selectedVendorKey}-${itemData.itemNumber || "1"}`;
    const calculated = calculateCodesAndPrices(
        { price: itemData.price, itemId: finalItemId, workbook: itemData.workbook || "v826", itemNumber: itemData.itemNumber || "1", ...itemData },
        exchangeRate || 19,
        "v826"
    );
    
    const metricDimensionsStr = [itemData.widthCm, itemData.lengthCm, itemData.heightCm].filter(Boolean).join(" x ");
    const metricWeightStr = itemData.weightKg ? `${itemData.weightKg} kg` : "";
    
    const costMxn = parseFloat(itemData.price) || 0;
    
    const fmtMoney = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) ? `$$${n.toLocaleString("en-US")}` : `$$${v}`;
    };

    return (
        <div className="w-full bg-black/20 backdrop-blur-3xl rounded-2xl border border-white/10 p-5 flex flex-col gap-5 shadow-lg transition-all animate-in fade-in duration-500">
            {/* Header: Tag & Vendor */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <button type="button" onClick={onClearVendor} className="vendor-tag px-3 py-1 flex items-center justify-center text-lg font-black rounded shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
                        style={{ ["--vendor-color"]: vendorData?.color || "#333", backgroundColor: vendorData?.color || "#333", color: getTextColorForBg(vendorData?.color || "#333") } as React.CSSProperties}>
                        {tagPreview?.vendor} {tagPreview?.season}
                    </button>
                    <span className="text-2xl font-black text-white">{tagPreview?.count}</span>
                    <span className="text-2xl font-black text-white/50">{tagPreview?.cypher}</span>
                </div>
                <div className="text-left sm:text-right">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{tr("Item Details")}</p>
                </div>
            </div>
            
            {/* Dynamic AI Data */}
            {aiResults && (aiResults.title || aiResults.body || aiResults.cleanedUrl) && (
                 <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 border border-white/5 relative overflow-hidden group">
                     {aiResults.cleanedUrl && (
                         <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden border border-white/10 bg-black/40 flex items-center justify-center shadow-inner">
                             <img src={aiResults.cleanedUrl} alt="Generated" className="w-full h-full object-cover mix-blend-screen" />
                         </div>
                     )}
                     <div className="flex flex-col gap-1.5 justify-center flex-1 min-w-0">
                         {aiResults.title && <h4 className="text-lg font-black text-white leading-tight truncate">{aiResults.title}</h4>}
                         {aiResults.body && <p className="text-xs font-medium text-white/60 line-clamp-2 leading-relaxed">{aiResults.body}</p>}
                         {(aiResults.colors || aiResults.type) && (
                             <div className="flex flex-wrap gap-2 mt-2">
                                 {aiResults.type && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">{aiResults.type}</span>}
                                 {aiResults.colors && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">{aiResults.colors}</span>}
                             </div>
                         )}
                     </div>
                 </div>
            )}

            {/* Clusters */}
            <div className="grid grid-cols-1 gap-6">
                {/* SPECS */}
                <div className="flex flex-col gap-3">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-cyan-400">{tr("Specs")}</h5>
                    <div className="flex gap-4 items-center">
                        <div className="w-16 h-16 shrink-0 bg-black/40 rounded-lg border border-white/10 flex items-center justify-center mix-blend-screen p-2 overflow-hidden shadow-inner">
                            <WireframeIcon item={{...itemData, width_cm: itemData.widthCm, height_cm: itemData.heightCm, length_cm: itemData.lengthCm}} color={vendorData?.color} />
                        </div>
                        <div className="flex flex-col gap-1 text-[11px] font-bold text-white/80 overflow-hidden">
                            <span className="truncate">{[itemData.color, itemData.material, itemData.shape, itemData.itemType].filter(Boolean).join("   ") || "-"}</span>
                            <span className="text-white/60 truncate">{metricDimensionsStr || "-"}</span>
                            <span className="text-white/60 truncate">{metricWeightStr || "-"}</span>
                            <span className="text-cyan-400/80 font-black text-[10px] uppercase tracking-wider">Qty: {itemData.quantity || "1"}</span>
                        </div>
                    </div>
                </div>

                {/* PRICING & LOGISTICS (2 cols) */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-3">
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">{tr("Pricing")}</h5>
                        <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-[11px]">
                            <span className="font-bold text-white/50">{tr("Price MXN")}</span>
                            <span className="font-black text-white text-right">{fmtMoney(costMxn)}</span>
                            
                            <span className="font-bold text-white/50">{tr("Acq. USD")}</span>
                            <span className="font-black text-white/70 text-right">{fmtMoney(calculated.bookAcquisition)}</span>
                            
                            <span className="font-bold text-white/50">{tr("Landed USD")}</span>
                            <span className="font-black text-white/90 text-right">{fmtMoney(calculated.bookLanded)}</span>
                            
                            <span className="font-bold text-emerald-400/50">{tr("Retail USD")}</span>
                            <span className="font-black text-emerald-400 text-right">{fmtMoney(calculated.bookRetail)}</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-purple-400">{tr("Logistics")}</h5>
                        <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-[11px]">
                            <span className="font-bold text-white/50">{tr("AQ Code")}</span>
                            <span className="font-black text-white text-right font-mono">{calculated.bookAqCode || "-"}</span>
                            
                            <span className="font-bold text-white/50">{tr("LD Code")}</span>
                            <span className="font-black text-white text-right font-mono">{calculated.bookLandCode || "-"}</span>
                            
                            <span className="font-bold text-white/50">{tr("Barcode")}</span>
                            <span className="font-black text-white/70 text-right font-mono">{calculated.bookBarcodeDisplay || "-"}</span>
                            
                            <span className="font-bold text-white/50">{tr("Exchange")}</span>
                            <span className="font-black text-white/40 text-right">{exchangeRate || "-"}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
