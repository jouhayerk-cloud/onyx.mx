import React, { useState, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { 
    X, Package, Download, FileText, FileSpreadsheet, Globe, Plus, Trash2 
} from 'lucide-react';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';

import { exchangeRateAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { calculateCodesAndPrices, normalizeInventoryData, getCrateDisplayName } from '../../lib/utils';
import { exportCombinedTruckManifesto } from '../../lib/crateManifesto';
import { generateCratesListHtml } from './generateCratesListHtml';

export const ExportCard: React.FC<{
    id: string;
    title: string;
    type: string;
    desc?: string;
    icon: any;
    color: string;
    prog: number;
    url?: string;
    onGenerate: () => void;
    onDownload?: (url: string, filename: string) => void;
    filename?: string;
}> = ({ id, title, type, desc, icon: Icon, color, prog, url, onGenerate, onDownload, filename }) => {
    const isDone = prog === 100;
    return (
        <div className="flex items-center gap-5 p-5 rounded-3xl border border-white/10 bg-white/[0.03] group hover:bg-white/[0.06] transition-all duration-500">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ backgroundColor: `${color}15`, color: color }}>
                <Icon size={28} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h5 className="text-sm font-black text-white uppercase tracking-tight truncate">{title}</h5>
                    <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border" style={{ color, borderColor: `${color}30`, backgroundColor: `${color}10` }}>
                        {type}
                    </span>
                </div>
                <p className="text-[10px] text-white/40 mt-1 truncate">{desc || `Generate ${type} format`}</p>
                {prog > 0 && prog < 100 && (
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-3">
                        <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${prog}%` }} />
                    </div>
                )}
            </div>
            <div className="shrink-0 flex gap-2">
                {!url ? (
                    <button onClick={onGenerate} disabled={prog > 0 && prog < 100} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all disabled:opacity-50">
                        {prog > 0 && prog < 100 ? <span className="text-xs font-mono">{prog}%</span> : <Download size={18} />}
                    </button>
                ) : (
                    <button onClick={() => onDownload ? onDownload(url, filename || 'export') : window.open(url)} className="px-4 py-2 rounded-xl text-black font-black uppercase tracking-widest text-[10px] transition-all hover:scale-105 shadow-[0_0_20px_rgba(16,185,129,0.2)]" style={{ backgroundColor: color }}>
                        Download
                    </button>
                )}
            </div>
        </div>
    );
};

export const ExportCratesWizard: React.FC<{
    selectedCrates: any[];
    allCrates: any[];
    allInventory: any[];
    onClose: () => void;
}> = ({ selectedCrates, allCrates, allInventory, onClose }) => {
    const bookRate = useAtomValue(exchangeRateAtom);
    const [progress, setProgress] = useState({ allCrates: -1, xlsx: -1, html: -1 });
    const [urls, setUrls] = useState({ allCrates: '', xlsx: '', html: '' });
    const exportTimestamp = useRef(new Date().getTime());

    const initSenders = Array.from(new Set(selectedCrates.map(c => {
        const { vendorList } = getCrateDisplayName(c, allCrates, allInventory);
        return vendorList[0] || '';
    }).filter(Boolean)));

    const [fields, setFields] = useState({
        shipmentRef: `EXP-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}`,
        senders: initSenders.length > 0 ? initSenders : [''],
        truckPlates: '',
        notes: ''
    });

    const getItemsFromCrate = (crate: any, floorLabel?: string, boxLabel?: string, visited = new Set<string>()): any[] => {
        if (!crate || visited.has(crate.id)) return [];
        visited.add(crate.id);
        const { label: currentLabel } = getCrateDisplayName(crate, allCrates, allInventory);
        const nextFloorLabel = floorLabel || currentLabel;
        const nextBoxLabel = crate.type === 'cardboard' ? currentLabel : boxLabel;
        let results: any[] = [];
        if (crate.inventory_ids) {
            crate.inventory_ids.split(',').filter(Boolean).forEach((e: string) => {
                const [id, qtyStr] = e.split(':');
                const qty = parseInt(qtyStr || '1', 10) || 1;
                const inv = allInventory.find((i: any) => String(i.row) === id);
                if (inv) results.push({ id, qty, inv, packetIn: floorLabel, boxLabel: nextBoxLabel });
            });
        }
        const nested = allCrates.filter(c => c.parent_id === crate.id);
        nested.forEach(n => { results = [...results, ...getItemsFromCrate(n, nextFloorLabel, nextBoxLabel, visited)]; });
        return results;
    };

    const generatePackingListXlsx = async () => {
        const tid = toast.loading('Generating XLSX Packing List...');
        setProgress(p => ({ ...p, xlsx: 5 }));
        try {
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Master Packing List');

            const headerFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
            const sectionFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
            const textWhite: any = { color: { argb: 'FFFFFFFF' }, bold: true };

            ws.addRow(['ONYX LOGISTICS · MASTER PACKING LIST']);
            ws.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFF97316' } };
            ws.addRow([`Exported At: ${new Date().toLocaleString()}`]);
            ws.addRow([]);

            ws.addRow(['SHIPMENT METADATA']);
            ws.getRow(4).font = { bold: true };
            ws.addRow(['Reference', fields.shipmentRef]);
            ws.addRow(['Senders', (fields.senders || []).join(', ') || 'N/A']);
            ws.addRow(['Truck Plates', fields.truckPlates || 'N/A']);
            ws.addRow(['Notes', fields.notes || 'N/A']);
            ws.addRow([]);

            const startRow = ws.rowCount + 1;
            ws.addRow(['Crate / Unit', 'Book TAG ID', 'Qty', 'Description', 'Dimensions (CM)', 'Weight (KG)', 'Sub-Container']);
            const headerRow = ws.getRow(startRow);
            headerRow.font = textWhite;
            headerRow.eachCell(cell => { cell.fill = headerFill; cell.alignment = { horizontal: 'center' }; });

            ws.columns = [
                { key: 'crate', width: 25 },
                { key: 'tag', width: 22 },
                { key: 'qty', width: 8 },
                { key: 'desc', width: 50 },
                { key: 'dims', width: 22 },
                { key: 'weight', width: 12 },
                { key: 'box', width: 25 }
            ];

            selectedCrates.forEach((crate, cIdx) => {
                const { label } = getCrateDisplayName(crate, allCrates, allInventory);
                
                const sRow = ws.addRow([`UNIT ${cIdx + 1}: ${label.toUpperCase()}`]);
                ws.mergeCells(sRow.number, 1, sRow.number, 7);
                sRow.font = { bold: true };
                sRow.getCell(1).fill = sectionFill;

                const items = getItemsFromCrate(crate);
                items.forEach(item => {
                    const inv = item.inv; const data = inv.data || {};
                    const norm = normalizeInventoryData(inv);
                    const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                    const tag = calculated.bookBarcode || data.book_barcode || data.itemId || String(inv.row);
                    const desc = [data.color, data.material, data.shape, data.shortDescription].filter(Boolean).join(' - ');
                    const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×');
                    
                    const row = ws.addRow({
                        crate: label,
                        tag: tag,
                        qty: item.qty,
                        desc: desc || 'Artifact',
                        dims: dims || 'N/A',
                        weight: data.weightKg || data.weight_kg || 0,
                        box: item.boxLabel || ''
                    });
                    row.getCell('qty').alignment = { horizontal: 'center' };
                    row.getCell('weight').alignment = { horizontal: 'center' };
                });
            });

            setProgress(p => ({ ...p, xlsx: 90 }));
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            setUrls(u => ({ ...u, xlsx: URL.createObjectURL(blob) }));
            setProgress(p => ({ ...p, xlsx: 100 }));
            toast.success('Packing List Ready', { id: tid });
        } catch (err: any) {
            setProgress(p => ({ ...p, xlsx: -1 }));
            toast.error('Failed to generate XLSX', { id: tid });
        }
    };

    const generateAllManifestos = async () => {
        setProgress(p => ({ ...p, allCrates: 5 }));
        try {
            const rootCrates = selectedCrates.filter(c => !c.parent_id && c.type !== 'cardboard');
            const cratesData = rootCrates.map(crate => {
                const { label, subtitle, vendorList } = getCrateDisplayName(crate, allCrates, allInventory);
                const items = getItemsFromCrate(crate).map((item, idx) => {
                    const inv = item.inv; const data = inv.data || {};
                    const norm = normalizeInventoryData(inv);
                    const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                    const tag = calculated.bookBarcode || data.book_barcode || data.itemId || String(inv.row);
                    const vP = Object.keys(vendors).find(k => tag.toUpperCase().startsWith(k)) || 'OTHER';
                    return {
                        index: idx, vendorPrefix: vP, qty: item.qty, itemId: tag, rowId: String(inv.row),
                        name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
                        material: data.material || '', color: data.color || '',
                        dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : ''),
                        weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                        costMxn: 0, costUsd: 0, imageUrls: [], tagColor: (vendors as any)[vP]?.color || '#6b7280', dbItemCount: data.quantity || 1,
                        packetIn: item.packetIn || '', boxLabel: item.boxLabel || ''
                    };
                });
                const meta = {
                    dynamicId: label, subtitle, crateId: crate.id, crateDims: `${crate.width_cm}×${crate.length_cm}×${crate.height_cm||'?'} cm`,
                    crateType: crate.type, fillPct: 100, exportedAt: new Date().toLocaleString(),
                    excludeImages: true, crateColor: (vendors as any)[vendorList[0]]?.color || '#6b7280',
                    excludeHeaderQr: false, excludeHeaderWireframe: false, exportBruteWeight: crate.brute_weight_kg,
                    truckPlates: fields.truckPlates, senders: fields.senders
                };
                return { items, meta };
            });

            const independentCardboard = selectedCrates.filter(c => c.type === 'cardboard' && (!c.parent_id || !rootCrates.some(rc => rc.id === c.parent_id)));
            const cardboardData = independentCardboard.map(crate => {
                const { label, subtitle, vendorList } = getCrateDisplayName(crate, allCrates, allInventory);
                const items = getItemsFromCrate(crate).map((item, idx) => {
                    const inv = item.inv; const data = inv.data || {};
                    const norm = normalizeInventoryData(inv);
                    const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                    const tag = calculated.bookBarcode || data.book_barcode || data.itemId || String(inv.row);
                    const vP = Object.keys(vendors).find(k => tag.toUpperCase().startsWith(k)) || 'OTHER';
                    return {
                        index: idx, vendorPrefix: vP, qty: item.qty, itemId: tag, rowId: String(inv.row),
                        name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
                        material: data.material || '', color: data.color || '',
                        dims: [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : ''),
                        weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                        costMxn: 0, costUsd: 0, imageUrls: [], tagColor: (vendors as any)[vP]?.color || '#6b7280', dbItemCount: data.quantity || 1,
                        packetIn: item.packetIn || '', boxLabel: item.boxLabel || ''
                    };
                });
                const meta = {
                    dynamicId: label, subtitle, crateId: crate.id, crateDims: `${crate.width_cm}×${crate.length_cm}×${crate.height_cm||'?'} cm`,
                    crateType: crate.type, fillPct: 100, exportedAt: new Date().toLocaleString(),
                    excludeImages: true, crateColor: (vendors as any)[vendorList[0]]?.color || '#6b7280',
                    excludeHeaderQr: false, excludeHeaderWireframe: false, exportBruteWeight: crate.brute_weight_kg,
                    truckPlates: fields.truckPlates, senders: fields.senders
                };
                return { items, meta };
            });

            const allData = [...cratesData, ...cardboardData];
            
            if (allData.length === 0) {
                toast.error('No valid crates to export');
                setProgress(p => ({ ...p, allCrates: -1 }));
                return;
            }

            const blob = await exportCombinedTruckManifesto(null, allData, pct => setProgress(p => ({ ...p, allCrates: Math.round(pct) })), 'blob') as Blob;
            if (blob) { setUrls(u => ({ ...u, allCrates: URL.createObjectURL(blob) })); setProgress(p => ({ ...p, allCrates: 100 })); }
        } catch (err: any) { setProgress(p => ({ ...p, allCrates: -1 })); toast.error('PDF export failed'); }
    };

    const generateHtml = async () => {
        try {
            setProgress(p => ({ ...p, html: 10 }));
            const dateStr = new Date().toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
            const manifestId = `ONYX MX - EXPORT ${dateStr}`;
            
            const totalWeight = selectedCrates.reduce((sum, c) => sum + (parseFloat(c.brute_weight_kg) || 0), 0);
            
            const shipmentPayload = {
                crates: selectedCrates.map(c => {
                    const { label, subtitle, vendorList } = getCrateDisplayName(c, allCrates, allInventory);
                    const crateColor = (vendors as any)[vendorList[0]]?.color || '#6b7280';
                    const items = getItemsFromCrate(c).map((item, idx) => {
                        const inv = item.inv; 
                        const data = inv.data || {};
                        const norm = normalizeInventoryData(inv);
                        const calculated = calculateCodesAndPrices(norm, bookRate, '326');
                        const tagId = calculated.bookBarcode || data.book_barcode || data.itemId || String(inv.row);
                        const vP = Object.keys(vendors).find(k => tagId.toUpperCase().startsWith(k)) || 'OTHER';
                        
                        return {
                            itemId: tagId,
                            vendorPrefix: vP,
                            tagColor: (vendors as any)[vP]?.color || '#6b7280',
                            name: (data.shape && data.shortDescription && data.shape !== data.shortDescription) ? `${data.shape} - ${data.shortDescription}` : (data.shape || data.shortDescription || 'Artifact'),
                            type: data.shape || 'Unit',
                            desc: data.shortDescription || '',
                            qty: item.qty,
                            weightKg: parseFloat(data.weightKg || data.weight_kg) || 0,
                            material: data.material || '',
                            color: data.color || '',
                            combinedAttr: `${data.color || ''} ${data.material ? '/ ' + data.material : ''}`.trim()
                        };
                    });
                    
                    return {
                        id: c.id, label, subtitle,
                        x: 0, y: 0, z: 0, r: 0,
                        w: c.width_cm, l: c.length_cm, h: c.height_cm || 100,
                        color: crateColor, vendorList, items
                    };
                }),
                truckStats: {
                    totalWeight: totalWeight,
                    payloadPct: Math.round((totalWeight / 22000) * 100),
                    status: 'EXPORT', rPct: 33, mPct: 34, fPct: 33
                },
                timestamp: new Date().toLocaleString()
            };
            const htmlContent = generateCratesListHtml(manifestId, fields, shipmentPayload);
            const blob = new Blob([htmlContent], { type: 'text/html' });
            if (blob) { 
                setUrls(u => ({ ...u, html: URL.createObjectURL(blob) })); 
                setProgress(p => ({ ...p, html: 100 })); 
            }
        } catch (err: any) { 
            setProgress(p => ({ ...p, html: -1 })); 
            toast.error('HTML Generation failed'); 
        }
    };

    const triggerDownload = (url: string, filename: string) => { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); };

    return (
        <div className="fixed inset-0 z-[450] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <div className="relative z-10 w-full max-w-2xl rounded-[2.5rem] border border-white/10 p-8 flex flex-col gap-6 shadow-2xl bg-[#0c0c12] max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center bg-white/[0.02] -mx-8 -mt-8 px-8 py-6 border-b border-white/10 rounded-t-[2.5rem]">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
                            <Package size={24} className="text-white/60" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Export Crates</h3>
                            <p className="text-[9px] text-white/40 uppercase tracking-[0.3em] font-black">{selectedCrates.length} Units Selected</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 rounded-2xl text-white/20 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/10"><X size={20} /></button>
                </div>

                <div className="flex flex-col gap-6">
                    {/* Form Details */}
                    <div className="flex flex-col gap-4">
                        <div className="group flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 focus-within:border-white/20 transition-all">
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Shipment Reference</label>
                            <input type="text" value={fields.shipmentRef} onChange={e => setFields({ ...fields, shipmentRef: e.target.value })}
                                className="w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-white/10" placeholder="EXP-2026..." />
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Senders Information</label>
                                <button type="button" onClick={() => setFields({ ...fields, senders: [...fields.senders, ''] })} className="p-1 rounded-md bg-white/5 text-white/40 hover:text-white transition-all"><Plus size={14} /></button>
                            </div>
                            <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                                {fields.senders.map((s: string, i: number) => (
                                    <div key={i} className="flex gap-2">
                                        <input type="text" value={s} onChange={e => { const n = [...fields.senders]; n[i] = e.target.value; setFields({ ...fields, senders: n }); }}
                                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-white outline-none focus:border-white/30" placeholder="Sender Name" />
                                        <button type="button" onClick={() => { const n = fields.senders.filter((_:any,idx:number)=>idx!==i); setFields({ ...fields, senders: n.length?n:[''] }); }}
                                            className="p-2 text-white/20 hover:text-red-400 transition-all"><Trash2 size={16} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="group flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 focus-within:border-white/20 transition-all">
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Truck Plates Number</label>
                            <input type="text" value={fields.truckPlates} onChange={e => setFields({ ...fields, truckPlates: e.target.value })}
                                className="w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-white/10" placeholder="Optional truck plates..." />
                        </div>

                        <div className="group flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 focus-within:border-white/20 transition-all">
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/20">Additional Notes</label>
                            <input type="text" value={fields.notes} onChange={e => setFields({ ...fields, notes: e.target.value })}
                                className="w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-white/10" placeholder="Optional notes for packing list..." />
                        </div>
                    </div>

                    {/* Exporters */}
                    <div className="flex flex-col gap-3">
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/30 ml-1">Documentation Engine</label>
                        <ExportCard id="html" title="Interactive HTML Manifest" type="HTML" color="#3b82f6" icon={Globe} prog={progress.html} url={urls.html} onGenerate={generateHtml} onDownload={triggerDownload} filename={`Manifesto_${exportTimestamp.current}.html`} />
                        <ExportCard id="xlsx" title="Master Packing List" type="XLSX" color="#10b981" icon={FileSpreadsheet} prog={progress.xlsx} url={urls.xlsx} onGenerate={generatePackingListXlsx} onDownload={triggerDownload} filename={`Master_Packing_List_${exportTimestamp.current}.xlsx`} />
                        <ExportCard id="allCrates" title="All Crates Manifesto" type="PDF" color="#f97316" icon={FileText} prog={progress.allCrates} url={urls.allCrates} onGenerate={generateAllManifestos} onDownload={triggerDownload} filename={`All_Crates_Manifesto_${exportTimestamp.current}.pdf`} />
                    </div>
                </div>

            </div>
        </div>
    );
};
