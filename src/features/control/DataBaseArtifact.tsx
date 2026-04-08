
import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { inventoryAtom, storeInventoryAtom, exchangeRateAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { Search, Save, X, Edit2, AlertCircle, Loader2, Shield, Hash, Layers, DollarSign, Trash2, Box, Scale, Ruler, FileText, Tag, Palette, Barcode } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { vendors } from '../../lib/consts';
import { calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';

interface DBItem {
    id: string;
    item_id: string;
    status: string;
    vendor_id?: string;
    pay_req?: string;
    description?: string;
    short_description?: string;
    material?: string;
    shape?: string;
    color?: string;
    price_mxn?: number;
    quantity?: number;
    weight_kg?: number;
    width_cm?: number;
    height_cm?: number;
    length_cm?: number;
    workbook?: string;
    is_hidden?: boolean;
    [key: string]: any;
}

export function DataBaseArtifact() {
    const [inventory] = useAtom(inventoryAtom);
    const [storeInventory] = useAtom(storeInventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    
    const [search, setSearch] = useState('');
    const [vendorFilter, setVendorFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Partial<DBItem>>({});
    const [isSaving, setIsSaving] = useState<string | null>(null);

    // Combine all unique records from both atoms
    const allItems = useMemo(() => {
        const combined = [...(inventory || []), ...(storeInventory || [])];
        const unique = new Map<string, any>();
        combined.forEach(item => {
            const data = { ...(item?.data || item) };
            const id = data?.id || item?.id || item?.row;
            if (data && id !== undefined && id !== null) {
                data.id = String(id);
                unique.set(data.id, data);
            }
        });
        return Array.from(unique.values()) as DBItem[];
    }, [inventory, storeInventory]);


    const filteredItems = useMemo(() => {
        return allItems.filter(item => {
            const matchesSearch = 
                String(item.item_id || '').toLowerCase().includes(search.toLowerCase()) ||
                String(item.description || '').toLowerCase().includes(search.toLowerCase()) ||
                String(item.material || '').toLowerCase().includes(search.toLowerCase()) ||
                String(item.shape || '').toLowerCase().includes(search.toLowerCase()) ||
                String(item.color || '').toLowerCase().includes(search.toLowerCase());
            
            const vendor = item.item_id?.includes('-') ? item.item_id.split('-')[0] : (item.item_id?.startsWith('GE') ? 'GE' : 'Unknown');
            const matchesVendor = vendorFilter === 'All' || vendor === vendorFilter;
            const matchesStatus = statusFilter === 'All' || item.status === statusFilter;

            return matchesSearch && matchesVendor && matchesStatus;
        });
    }, [allItems, search, vendorFilter, statusFilter]);

    const activeVendors = useMemo(() => {
        const set = new Set<string>(['All']);
        allItems.forEach(item => {
            const v = item.item_id?.includes('-') ? item.item_id.split('-')[0] : (item.item_id?.startsWith('GE') ? 'GE' : null);
            if (v) set.add(v);
        });
        return Array.from(set).sort();
    }, [allItems]);

    const statuses = useMemo(() => {
        const set = new Set<string>(['All']);
        allItems.forEach(item => {
            if (item.status) set.add(item.status);
        });
        return Array.from(set).sort();
    }, [allItems]);

    const handleStartEdit = (item: DBItem) => {
        setEditingId(item.id);
        setEditValues({ ...item });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditValues({});
    };

    const handleSave = async (id: string) => {
        setIsSaving(id);
        try {
            const { id: itemId, ...updateData } = editValues as DBItem;
            const cleanUpdate: any = {};
            [
                'item_id', 'status', 'pay_req', 'material', 'description', 
                'price_mxn', 'shape', 'color', 'quantity', 'weight_kg', 
                'width_cm', 'height_cm', 'length_cm', 'workbook'
            ].forEach(key => {
                if (updateData[key] !== undefined) cleanUpdate[key] = updateData[key];
            });
            
            const { error } = await supabase
                .from('inventory')
                .update(cleanUpdate)
                .eq('id', id);

            if (error) throw error;
            
            toast.success("Artifact Synchronized");
            setEditingId(null);
            setEditValues({});
        } catch (err: any) {
            toast.error(err.message || "Sync Failed");
        } finally {
            setIsSaving(null);
        }
    };

    const handleDelete = async (id: string, itemId: string) => {
        if (!confirm(`AUTHORIZED OVERRIDE: Permanently expunge unit ${itemId} from nexus?`)) return;
        const tid = toast.loading("Expunging record...");
        try {
            const { error } = await supabase.from('inventory').delete().eq('id', id);
            if (error) throw error;
            toast.success("Unit expunged", { id: tid });
        } catch (err: any) {
            toast.error(err.message || "Delection failed", { id: tid });
        }
    };

    const handleFieldChange = (field: keyof DBItem, value: any) => {
        setEditValues(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="flex flex-col gap-8 animate-in fade-in duration-1000">
            {/* Header: Frameless HUD Controls */}
            <div className="flex flex-col gap-10">
                <div className="flex items-center gap-4">
                    <Layers size={14} className="text-neutral-500" />
                    <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-neutral-400">Master Index Override</h2>
                    <div className="h-px grow bg-linear-to-r from-white/5 to-transparent" />
                    <div className="flex items-center gap-2 px-3 py-1 bg-(--main-color)/5 border border-(--main-color)/30 rounded-full">
                        <div className="w-1 h-1 rounded-full bg-(--main-color) animate-pulse shadow-[0_0_8px_rgba(var(--main-color-rgb),0.8)]" />
                        <span className="text-[9px] font-black text-(--main-color) uppercase tracking-widest">{filteredItems.length} RECORDED UNITS</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    {/* Search Override */}
                    <div className="flex items-center gap-4 group">
                        <Search size={14} className="text-neutral-500 group-focus-within:text-(--main-color) transition-all" />
                        <input 
                            type="text"
                            placeholder="QUERY ARTIFACTS..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-transparent border-b border-white/5 py-2 text-xs text-white focus:outline-none focus:border-(--main-color)/40 transition-all placeholder:text-white/5 uppercase tracking-tighter w-full"
                        />
                    </div>

                    {/* Status Toggle */}
                    <div className="flex flex-col gap-3">
                        <span className="text-[7px] font-black uppercase tracking-[0.3em] text-neutral-500 ml-1">Transmission State</span>
                        <div className="flex flex-wrap gap-2">
                            {statuses.map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${statusFilter === s ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/5 text-white/20 hover:text-white/40'}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Vendor Pill Matrix */}
                <div className="flex flex-col gap-4">
                    <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/10 ml-1">Nexus Node Origin</span>
                    <div className="flex flex-wrap gap-2 pb-4 border-b border-white/2">
                        {activeVendors.map(v => {
                            const vData = vendors[v as keyof typeof vendors];
                            const isActive = vendorFilter === v;
                            return (
                                <button
                                    key={v}
                                    onClick={() => setVendorFilter(v)}
                                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${isActive ? 'bg-white/10 text-white' : 'bg-transparent text-white/20 hover:text-white/40'}`}
                                    style={{ borderColor: isActive ? (vData?.color || 'white') : (vData?.color ? `${vData.color}33` : 'rgba(255,255,255,0.05)') }}
                                >
                                    {v !== 'All' && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: vData?.color }} />}
                                    {v === 'All' ? 'ALL ORIGINS' : vData?.name || v}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Frameless Table Area */}
            <div className="overflow-x-auto custom-scrollbar pt-4 -mx-10 px-10">
                <table className="w-full border-collapse text-left min-w-[1800px]">
                    <thead>
                        <tr className="text-[8px] font-black uppercase tracking-[0.3em] text-neutral-500 border-b border-white/10">
                            <th className="px-4 py-4 sticky left-0 bg-[#0a0a0a] z-10 w-[140px]"><div className="flex items-center gap-2"><Hash size={10} /> UNIT ID</div></th>
                            <th className="px-4 py-4 w-[160px]"><div className="flex items-center gap-2"><Barcode size={10} /> TAG ID</div></th>
                            <th className="px-4 py-4 w-[120px]">DEPLOYMENT</th>
                            <th className="px-4 py-4 w-[120px]">MORPHOLOGY</th>
                            <th className="px-4 py-4 w-[120px]">MATERIAL</th>
                            <th className="px-4 py-4 w-[100px]">COLOR</th>
                            <th className="px-4 py-4 w-[120px]"><div className="flex items-center gap-2"><DollarSign size={10} /> VALUATION</div></th>
                            <th className="px-4 py-4 w-[100px]">AQ CODE</th>
                            <th className="px-4 py-4 w-[100px]">LD CODE</th>
                            <th className="px-4 py-4 w-[100px]">USD RETAIL</th>
                            <th className="px-4 py-4 w-[80px]">QTY</th>
                            <th className="px-4 py-4 w-[100px]"><div className="flex items-center gap-2"><Scale size={10} /> MASS</div></th>
                            <th className="px-4 py-4 w-[140px]"><div className="flex items-center gap-2"><Ruler size={10} /> SCALE (CM)</div></th>
                            <th className="px-4 py-4 w-[140px]">PROTOCOL</th>
                            <th className="px-4 py-4 w-[100px]">INDEX</th>
                            <th className="px-4 py-4">METADATA</th>
                            <th className="px-4 py-4 text-right sticky right-0 bg-[#0a0a0a] z-10 w-[80px]">OVERRIDE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/2">
                        {filteredItems.map(item => {
                            const isEditing = editingId === item.id;
                            const isCurrentSaving = isSaving === item.id;
                            
                            return (
                                <tr key={item.id} className={`group transition-all duration-500 ${isEditing ? 'bg-white/2' : 'hover:bg-white/1'}`}>
                                    {/* Item ID (Sticky) */}
                                    <td className="px-4 py-5 sticky left-0 bg-[#0a0a0a] group-hover:bg-[#0f0f0f] transition-colors">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.item_id || ''}
                                                onChange={(e) => handleFieldChange('item_id', e.target.value)}
                                                className="bg-transparent border-b border-(--main-color)/40 py-1 text-[11px] w-full text-(--main-color) font-black focus:outline-none uppercase tracking-tighter"
                                            />
                                        ) : (
                                            <span className="text-[11px] font-black text-neutral-400 group-hover:text-white transition-all uppercase tracking-tight">{item.item_id}</span>
                                        )}
                                    </td>

                                    {/* Tag ID (Calculated Barcode) */}
                                    <td className="px-4 py-5">
                                        <span className="text-[10px] font-mono text-(--main-color)/60 font-black tracking-widest uppercase">
                                            {calculateCodesAndPrices(item, exchangeRate, item.workbook || 'V326').bookBarcode}
                                        </span>
                                    </td>

                                    {/* Status */}
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <select 
                                                value={editValues.status || ''}
                                                onChange={(e) => handleFieldChange('status', e.target.value)}
                                                className="bg-transparent border-none p-0 text-[10px] font-black uppercase tracking-tight text-white/60 focus:ring-0 cursor-pointer"
                                            >
                                                {statuses.filter(s => s !== 'All').map(s => <option key={s} value={s} className="bg-neutral-900 text-white">{s.toUpperCase()}</option>)}
                                            </select>
                                        ) : (
                                            <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border inline-block whitespace-nowrap ${
                                                item.status === 'Available' ? 'bg-blue-500/5 text-blue-500/50 border-blue-500/10' :
                                                item.status === 'Requested' ? 'bg-yellow-500/5 text-yellow-500/50 border-yellow-500/10' :
                                                'bg-green-500/5 text-green-500/50 border-green-500/10'
                                            }`}>
                                                {item.status}
                                            </span>
                                        )}
                                    </td>

                                    {/* Morphology (Shape) */}
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.shape || ''}
                                                onChange={(e) => handleFieldChange('shape', e.target.value)}
                                                className="bg-transparent border-b border-white/10 py-1 text-[10px] w-full text-white/60 focus:outline-none focus:border-(--main-color)/40"
                                            />
                                        ) : (
                                            <span className="text-[10px] font-black text-white/30 uppercase tracking-tighter group-hover:text-white/60 transition-all">{item.shape || 'UNK'}</span>
                                        )}
                                    </td>

                                    {/* Material */}
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.material || ''}
                                                onChange={(e) => handleFieldChange('material', e.target.value)}
                                                className="bg-transparent border-b border-white/10 py-1 text-[10px] w-full text-white/60 focus:outline-none focus:border-(--main-color)/40"
                                            />
                                        ) : (
                                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-tight">{item.material || 'UNDEFINED'}</span>
                                        )}
                                    </td>

                                    {/* Color */}
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.color || ''}
                                                onChange={(e) => handleFieldChange('color', e.target.value)}
                                                className="bg-transparent border-b border-white/10 py-1 text-[10px] w-full text-white/60 focus:outline-none focus:border-(--main-color)/40"
                                            />
                                        ) : (
                                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-tight">{item.color || 'N/A'}</span>
                                        )}
                                    </td>

                                    {/* Valuation */}
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="number"
                                                value={editValues.price_mxn || ''}
                                                onChange={(e) => handleFieldChange('price_mxn', Number(e.target.value))}
                                                className="bg-transparent border-b border-white/10 py-1 text-[11px] w-full text-white/60 focus:outline-none focus:border-(--main-color)/40"
                                            />
                                        ) : (
                                            <span className="text-[11px] font-mono text-neutral-400 font-bold tracking-tighter group-hover:text-(--main-color) transition-all">${Number(item.price_mxn || 0).toLocaleString()} <span className="text-[7px] font-black text-neutral-600">MXN</span></span>
                                        )}
                                    </td>

                                    {/* Calculated Financial Codes */}
                                    <td className="px-4 py-5">
                                        <span className="text-[11px] font-mono text-white/10 tracking-[0.2em] group-hover:text-white/30 transition-all">
                                            {calculateCodesAndPrices(item, exchangeRate, item.workbook || 'V326').bookAqCode}
                                        </span>
                                    </td>
                                    <td className="px-4 py-5">
                                        <span className="text-[11px] font-mono text-white/10 tracking-[0.2em] group-hover:text-white/30 transition-all">
                                            {calculateCodesAndPrices(item, exchangeRate, item.workbook || 'V326').bookLandCode}
                                        </span>
                                    </td>
                                    <td className="px-4 py-5">
                                        <span className="text-[11px] font-mono text-(--main-color)/20 font-black tracking-tighter group-hover:text-(--main-color)/50 transition-all">
                                            ${calculateCodesAndPrices(item, exchangeRate, item.workbook || 'V326').bookRetail} <span className="text-[7px] opacity-30">USD</span>
                                        </span>
                                    </td>

                                    {/* Quantity */}
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="number"
                                                value={editValues.quantity || 1}
                                                onChange={(e) => handleFieldChange('quantity', Number(e.target.value))}
                                                className="bg-transparent border-b border-white/10 py-1 text-[11px] w-full text-white/60 focus:outline-none"
                                            />
                                        ) : (
                                            <span className="text-[11px] font-mono text-white/20 font-bold">{item.quantity || 1}</span>
                                        )}
                                    </td>

                                    {/* Mass (Weight) */}
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="number"
                                                step="0.01"
                                                value={editValues.weight_kg || ''}
                                                onChange={(e) => handleFieldChange('weight_kg', Number(e.target.value))}
                                                className="bg-transparent border-b border-white/10 py-1 text-[11px] w-full text-white/60 focus:outline-none"
                                            />
                                        ) : (
                                            <span className="text-[11px] font-mono text-neutral-400">{item.weight_kg ? `${item.weight_kg}KG` : '—'}</span>
                                        )}
                                    </td>

                                    {/* Scale (WxLxH) */}
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <div className="flex gap-1">
                                                <input type="number" placeholder="W" value={editValues.width_cm || ''} onChange={(e) => handleFieldChange('width_cm', Number(e.target.value))} className="bg-transparent border-b border-white/10 py-1 text-[10px] w-8 focus:outline-none" />
                                                <input type="number" placeholder="L" value={editValues.length_cm || ''} onChange={(e) => handleFieldChange('length_cm', Number(e.target.value))} className="bg-transparent border-b border-white/10 py-1 text-[10px] w-8 focus:outline-none" />
                                                <input type="number" placeholder="H" value={editValues.height_cm || ''} onChange={(e) => handleFieldChange('height_cm', Number(e.target.value))} className="bg-transparent border-b border-white/10 py-1 text-[10px] w-8 focus:outline-none" />
                                            </div>
                                        ) : (
                                            <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
                                                {item.width_cm || '—'}x{item.length_cm || '—'}x{item.height_cm || '—'} <span className="text-[7px]">CM</span>
                                            </span>
                                        )}
                                    </td>

                                    {/* Protocol (Pay Req) */}
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.pay_req || ''}
                                                onChange={(e) => handleFieldChange('pay_req', e.target.value)}
                                                className="bg-transparent border-b border-white/10 py-1 text-[10px] w-full text-white/60 focus:outline-none focus:border-(--main-color)/40"
                                            />
                                        ) : (
                                            <span className={`text-[10px] font-mono leading-none ${item.pay_req ? 'text-yellow-500/40' : 'text-white/5'}`}>
                                                {item.pay_req || 'NULL_SIGNAL'}
                                            </span>
                                        )}
                                    </td>

                                    {/* Index (Workbook) */}
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.workbook || ''}
                                                onChange={(e) => handleFieldChange('workbook', e.target.value)}
                                                className="bg-transparent border-b border-white/10 py-1 text-[10px] w-full text-white/60 focus:outline-none focus:border-(--main-color)/40"
                                            />
                                        ) : (
                                            <span className="text-[10px] font-black text-neutral-400 tracking-widest">{item.workbook || 'V000'}</span>
                                        )}
                                    </td>

                                    {/* Metadata (Description) */}
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.description || editValues.short_description || ''}
                                                onChange={(e) => handleFieldChange('description', e.target.value)}
                                                className="bg-transparent border-b border-white/10 py-1 text-[10px] w-full text-white/60 focus:outline-none focus:border-(--main-color)/40"
                                            />
                                        ) : (
                                            <span className="text-[10px] text-neutral-500 font-bold uppercase truncate block max-w-xs group-hover:text-neutral-300 transition-all">{item.description || item.short_description || 'NO_METADATA_EXTRACTED'}</span>
                                        )}
                                    </td>

                                    {/* Actions (Sticky Override) */}
                                    <td className="px-4 py-5 text-right sticky right-0 bg-[#0a0a0a] group-hover:bg-[#0f0f0f] transition-colors">
                                        {isEditing ? (
                                            <div className="flex justify-end gap-3 scale-90">
                                                <button 
                                                    onClick={handleCancelEdit}
                                                    disabled={isCurrentSaving}
                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white/20 hover:text-white hover:bg-white/5 transition-all"
                                                >
                                                    <X size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleSave(item.id)}
                                                    disabled={isCurrentSaving}
                                                    className="w-8 h-8 rounded-full bg-(--main-color) text-black flex items-center justify-center hover:scale-110 active:scale-90 transition-all shadow-[0_0_15px_rgba(var(--main-color-rgb),0.3)]"
                                                >
                                                    {isCurrentSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                                                <button 
                                                    onClick={() => handleStartEdit(item)}
                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white/20 hover:text-(--main-color) hover:bg-white/5 transition-all"
                                                    title="Modify Unit"
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(item.id, item.item_id)}
                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:text-red-500 hover:bg-white/5 transition-all"
                                                    title="Expunge Unit"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                
                {filteredItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-32 text-white/5 gap-4">
                        <AlertCircle size={48} strokeWidth={1} />
                        <p className="text-[11px] font-black uppercase tracking-[0.5em]">Nexus Result Set: Null</p>
                    </div>
                )}
            </div>
            
            {/* Minimalist Sub-Footer */}
            <div className="flex items-center justify-between text-[8px] text-white/5 font-black uppercase tracking-[0.3em] mt-8 pt-8 border-t border-white/2">
                <div className="flex items-center gap-6">
                    <span>Vendor Logic: Active</span>
                    <div className="w-1 h-1 rounded-full bg-white/5" />
                    <span>Join Index: {allItems.length} Units</span>
                </div>
                <div className="flex items-center gap-3">
                    <Shield size={10} className="text-(--main-color) opacity-20" />
                    <span>Terminal Override Shell v1.70.1</span>
                </div>
            </div>
        </div>
    );
}
