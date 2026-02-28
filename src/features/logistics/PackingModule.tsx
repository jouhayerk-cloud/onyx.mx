import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDatabase } from '../../lib/hooks';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { exportToXLSX } from '../../lib/xlsxUtils';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

const fmtMXN = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const PackingModule: React.FC = () => {
    const db = useDatabase();
    const [inventoryDocs, setInventoryDocs] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Label Settings
    const [labelFormat, setLabelFormat] = useState('50x30'); // 50mm x 30mm
    const [barcodeType, setBarcodeType] = useState('QR'); // QR or Barcode

    useEffect(() => {
        if (!db) return;
        const sub = db.inventory.find({ sort: [{ timestamp: 'desc' }] }).$.subscribe(d => {
            setInventoryDocs(d.map(x => x.toJSON()));
        });
        return () => sub.unsubscribe();
    }, [db]);

    const filteredDocs = useMemo(() => {
        if (!searchTerm) return inventoryDocs;
        const term = searchTerm.toLowerCase();
        return inventoryDocs.filter(d =>
            (d.item_id || '').toLowerCase().includes(term) ||
            (d.description || '').toLowerCase().includes(term) ||
            (d.vendor_id || '').toLowerCase().includes(term)
        );
    }, [inventoryDocs, searchTerm]);

    const toggleSelect = (id: string, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
        }
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === filteredDocs.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredDocs.map(d => d.id)));
        }
    };

    const labelDims = labelFormat === '50x30' ? { w: 50, h: 30 } : { w: 50, h: 80 };

    const generatePDF = async () => {
        if (selectedIds.size === 0) return toast.error('No items selected');
        setIsGenerating(true);
        const toastId = toast.loading('Generating Stickers PDF...');
        try {
            const items = inventoryDocs.filter(d => selectedIds.has(d.id));
            const pdf = new jsPDF({
                orientation: labelDims.w > labelDims.h ? 'landscape' : 'portrait',
                unit: 'mm',
                format: [labelDims.w, labelDims.h] // Note: Phomemo printers can use custom rolls.
            });

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const element = document.getElementById(`label-${item.id}`);
                if (element) {
                    const canvas = await html2canvas(element, { scale: 4, useCORS: true, backgroundColor: '#ffffff' });
                    const imgData = canvas.toDataURL('image/png');

                    if (i > 0) pdf.addPage([labelDims.w, labelDims.h], labelDims.w > labelDims.h ? 'l' : 'p');
                    pdf.addImage(imgData, 'PNG', 0, 0, labelDims.w, labelDims.h);
                }
            }

            pdf.save(`Onyx_Labels_${new Date().toISOString().split('T')[0]}.pdf`);
            toast.success('Stickers PDF generated successfully!', { id: toastId });
        } catch (e) {
            toast.error('Failed to generate PDF', { id: toastId });
        } finally {
            setIsGenerating(false);
        }
    };

    const generateExcel = async () => {
        if (selectedIds.size === 0) return toast.error('No items selected');
        const items = inventoryDocs.filter(d => selectedIds.has(d.id));

        const data = [
            ['Item ID', 'Description', 'Vendor', 'Price MXN', 'Weight (kg)', 'Dimensions (L x W x H cm)', 'Material', 'Status']
        ];

        items.forEach(item => {
            data.push([
                item.item_id || item.id,
                item.description || item.short_description || '',
                item.vendor_id || '',
                item.price_mxn || 0,
                item.weight_kg || 0,
                `${item.length_cm || 0}x${item.width_cm || 0}x${item.height_cm || 0}`,
                item.material || '',
                item.status || ''
            ]);
        });

        try {
            await exportToXLSX(`Onyx_PackingList_${new Date().toISOString().split('T')[0]}`, [
                { name: 'Packing List', data }
            ]);
            toast.success('Excel generated successfully!');
        } catch (error) {
            toast.error('Error generating Excel file.');
            console.error(error);
        }
    };

    return (
        <div className="flex flex-col md:flex-row h-full overflow-hidden bg-black text-white relative">
            {/* ── Left side: Items Selection ── */}
            <div className="flex flex-col flex-1 h-full border-r border-white/5 overflow-hidden">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-b border-white/5 bg-white/[0.01]">
                    <div className="flex flex-col">
                        <span className="text-sm font-black text-white">Select Items for Processing</span>
                        <span className="text-[10px] uppercase tracking-widest text-[#8DC63F]">Generate Stickers & Packing Lists</span>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <input
                            type="text"
                            placeholder="🔍 Search items..."
                            className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-white focus:outline-none focus:border-[#8DC63F]/50 w-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-black z-10">
                            <tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5 bg-white/[0.02]">
                                <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={handleSelectAll}>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={filteredDocs.length > 0 && selectedIds.size === filteredDocs.length}
                                            onChange={handleSelectAll}
                                            className="accent-[#8DC63F] w-3 h-3 cursor-pointer"
                                        />
                                        <span>Select All</span>
                                    </div>
                                </th>
                                <th className="px-4 py-3">Item ID</th>
                                <th className="px-4 py-3">Vendor</th>
                                <th className="px-4 py-3">Description</th>
                                <th className="px-4 py-3 text-right">Price</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {filteredDocs.map(doc => {
                                const isSelected = selectedIds.has(doc.id);
                                return (
                                    <tr
                                        key={doc.id}
                                        onClick={() => toggleSelect(doc.id)}
                                        className={`hover:bg-white/[0.04] transition-all cursor-pointer ${isSelected ? 'bg-[#8DC63F]/10' : ''}`}
                                    >
                                        <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={(e) => toggleSelect(doc.id, e as unknown as React.MouseEvent)}
                                                className="accent-[#8DC63F] w-3 h-3 cursor-pointer"
                                            />
                                        </td>
                                        <td className="px-4 py-2 font-mono text-[10px] font-bold text-[#8DC63F]">
                                            {doc.item_id || doc.id.substring(0, 8)}
                                        </td>
                                        <td className="px-4 py-2 text-xs font-black">{doc.vendor_id || '—'}</td>
                                        <td className="px-4 py-2 text-xs text-white/70 line-clamp-1">{doc.description || doc.short_description || '—'}</td>
                                        <td className="px-4 py-2 text-right font-mono text-xs text-white/60">{fmtMXN(doc.price_mxn || 0)}</td>
                                    </tr>
                                )
                            })}
                            {filteredDocs.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-[10px] text-white/20 uppercase tracking-widest font-black">
                                        No items available
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Right side: Output/Generation Settings ── */}
            <div className="w-full md:w-80 flex flex-col h-full bg-white/[0.01] shrink-0 overflow-y-auto">
                <div className="p-4 border-b border-white/5">
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#00AEEF] mb-1">Export Actions</h3>
                    <p className="text-[10px] text-white/40 leading-tight">Generate documents for {selectedIds.size} selected items.</p>
                </div>

                <div className="p-4 flex flex-col gap-6">
                    {/* Settings Block */}
                    <div className="flex flex-col gap-3">
                        <label className="text-[9px] uppercase tracking-widest text-white/40 font-black">Sticker Format</label>
                        <select
                            value={labelFormat}
                            onChange={(e) => setLabelFormat(e.target.value)}
                            className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8DC63F] transition-colors"
                        >
                            <option value="50x30">50mm x 30mm (Standard Phomemo)</option>
                            <option value="50x80">50mm x 80mm (Large Phomemo)</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-3">
                        <label className="text-[9px] uppercase tracking-widest text-white/40 font-black">Code Type</label>
                        <select
                            value={barcodeType}
                            onChange={(e) => setBarcodeType(e.target.value)}
                            className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8DC63F] transition-colors"
                        >
                            <option value="QR">QR Code</option>
                            <option value="Barcode">Barcode (1D)</option>
                        </select>
                    </div>

                    <div className="h-px w-full bg-white/10 my-2" />

                    <button
                        onClick={generatePDF}
                        disabled={isGenerating || selectedIds.size === 0}
                        className="w-full py-3 rounded-xl bg-white text-black font-black uppercase tracking-widest text-[10px] hover:bg-[#8DC63F] hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isGenerating ? 'Rendering...' : 'Print Stickers (PDF)'}
                    </button>

                    <button
                        onClick={generateExcel}
                        disabled={selectedIds.size === 0}
                        className="w-full py-3 rounded-xl bg-transparent border border-white/20 text-white font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        Download Packing List (XLSX)
                    </button>
                </div>
            </div>

            {/* Hidden DOM for PDF generation */}
            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
                {inventoryDocs.filter(d => selectedIds.has(d.id)).map(item => (
                    <div
                        key={item.id}
                        id={`label-${item.id}`}
                        style={{
                            width: `${labelDims.w}mm`,
                            height: `${labelDims.h}mm`,
                            backgroundColor: 'white',
                            color: 'black',
                            padding: '1mm 2mm',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            fontFamily: 'Inter, sans-serif'
                        }}
                    >
                        {/* Header */}
                        <div style={{ fontSize: '12px', fontWeight: '900', marginBottom: '2px', textAlign: 'center', width: '100%', wordBreak: 'break-all', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                            <span>{item.vendor_id || 'ONYX'}</span>
                            <span>|</span>
                            <span>{item.item_id || item.id.substring(0, 8)}</span>
                        </div>

                        {/* Description */}
                        <div style={{ fontSize: '9px', textAlign: 'center', lineHeight: '1.2', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {item.description || item.short_description || 'No description available'}
                        </div>

                        {/* Meta */}
                        <div style={{ fontSize: '7px', textAlign: 'center', margin: '2px 0 4px', fontStyle: 'italic', letterSpacing: '0.05em' }}>
                            {item.weight_kg ? `${item.weight_kg}kg` : ''}
                            {(item.length_cm && item.weight_kg) ? ' - ' : ''}
                            {item.length_cm ? `${item.length_cm}x${item.width_cm}x${item.height_cm}cm` : ''}
                        </div>

                        {/* Code */}
                        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: barcodeType === 'QR' ? '50px' : '30px' }}>
                            {barcodeType === 'QR' ? (
                                <QRCodeSVG value={item.id} size={48} level="M" />
                            ) : (
                                <div style={{ transform: 'scale(1.2)', transformOrigin: 'top center' }}>
                                    <Barcode
                                        value={item.item_id || item.id.substring(0, 8)}
                                        // 1.5 width and 20 height 
                                        width={1.5}
                                        height={20}
                                        fontSize={10}
                                        displayValue={false}
                                        margin={0}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

        </div>
    );
};
