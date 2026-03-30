
import React, { useState, useEffect, useMemo } from 'react';
import { useAtom } from 'jotai/react';
import { inventoryAtom, storeInventoryAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { Search, Filter, Save, X, Check, Edit2, AlertCircle, Loader2, Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface DBItem {
    id: string;
    item_id: string;
    status: string;
    vendor_id?: string;
    pay_req?: string;
    description?: string;
    material?: string;
    shape?: string;
    price_mxn?: number;
    workbook?: string;
    is_hidden?: boolean;
    [key: string]: any;
}

export function DataBaseArtifact() {
    const [inventory] = useAtom(inventoryAtom);
    const [storeInventory] = useAtom(storeInventoryAtom);
    
    // Combine all unique records from both atoms
    const allItems = useMemo(() => {
        const combined = [...inventory, ...storeInventory];
        const unique = new Map<string, any>();
        combined.forEach(item => {
            if (item.data && item.data.id) {
                unique.set(item.data.id, item.data);
            }
        });
        return Array.from(unique.values()) as DBItem[];
    }, [inventory, storeInventory]);

    const [search, setSearch] = useState('');
    const [vendorFilter, setVendorFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Partial<DBItem>>({});
    const [isSaving, setIsSaving] = useState<string | null>(null);

    const filteredItems = useMemo(() => {
        return allItems.filter(item => {
            const matchesSearch = 
                String(item.item_id || '').toLowerCase().includes(search.toLowerCase()) ||
                String(item.description || '').toLowerCase().includes(search.toLowerCase()) ||
                String(item.material || '').toLowerCase().includes(search.toLowerCase());
            
            const vendor = item.item_id?.includes('-') ? item.item_id.split('-')[0] : (item.item_id?.startsWith('GE') ? 'GE' : 'Unknown');
            const matchesVendor = vendorFilter === 'All' || vendor === vendorFilter;
            const matchesStatus = statusFilter === 'All' || item.status === statusFilter;

            return matchesSearch && matchesVendor && matchesStatus;
        });
    }, [allItems, search, vendorFilter, statusFilter]);

    const vendors = useMemo(() => {
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
            // Remove helper fields before saving
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: itemId, ...updateData } = editValues as DBItem;
            
            // Filter out internal RxDB/Supabase metadata like created_at, updated_at if necessary
            // For now just update the changed fields
            const cleanUpdate: any = {};
            // Only update fields that typically change in this view
            ['item_id', 'status', 'pay_req', 'material', 'description', 'price_mxn'].forEach(key => {
                if (updateData[key] !== undefined) cleanUpdate[key] = updateData[key];
            });
            
            const { error } = await supabase
                .from('inventory')
                .update(cleanUpdate)
                .eq('id', id);

            if (error) throw error;
            
            toast.success("Item updated successfully");
            setEditingId(null);
            setEditValues({});
        } catch (err: any) {
            toast.error(err.message || "Failed to update item");
        } finally {
            setIsSaving(null);
        }
    };

    const handleFieldChange = (field: keyof DBItem, value: any) => {
        setEditValues(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="flex flex-col h-full bg-black/20 rounded-3xl border border-white/10 overflow-hidden glass-panel shadow-2xl">
            {/* Header / Toolbar */}
            <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 bg-white/5">
                <div className="flex items-center gap-4 flex-1 min-w-[250px]">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                        <input 
                            type="text"
                            placeholder="Master Search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-(--main-color)/50 transition-all placeholder:text-white/10"
                        />
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                        <select 
                            value={vendorFilter}
                            onChange={(e) => setVendorFilter(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] uppercase font-black tracking-widest text-white/50 focus:outline-none hover:bg-white/10 transition-all cursor-pointer"
                        >
                            {vendors.map(v => <option key={v} value={v} className="bg-neutral-900 text-white">{v}</option>)}
                        </select>
                    </div>
                    <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] uppercase font-black tracking-widest text-white/50 focus:outline-none hover:bg-white/10 transition-all cursor-pointer"
                    >
                        {statuses.map(s => <option key={s} value={s} className="bg-neutral-900 text-white">{s}</option>)}
                    </select>
                    
                    <div className="h-6 w-px bg-white/10 mx-2" />
                    
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-(--main-color)/10 border border-(--main-color)/20 rounded-full shrink-0">
                        <div className="w-1 h-1 rounded-full bg-(--main-color) animate-pulse" />
                        <span className="text-[9px] font-black text-(--main-color) uppercase tracking-[0.2em]">{filteredItems.length} REC</span>
                    </div>
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto relative custom-scrollbar">
                <table className="w-full border-collapse text-left min-w-[900px]">
                    <thead className="sticky top-0 z-20 bg-black/40 backdrop-blur-xl border-b border-white/10 shadow-sm">
                        <tr className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20">
                            <th className="px-6 py-4">Item ID</th>
                            <th className="px-4 py-4">Status</th>
                            <th className="px-4 py-4">Pay Req</th>
                            <th className="px-4 py-4">Material</th>
                            <th className="px-4 py-4">Description</th>
                            <th className="px-4 py-4">Price MXN</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredItems.map(item => {
                            const isEditing = editingId === item.id;
                            const isCurrentSaving = isSaving === item.id;
                            
                            return (
                                <tr key={item.id} className={`group hover:bg-white/3 transition-colors ${isEditing ? 'bg-white/5' : ''}`}>
                                    {/* Item ID */}
                                    <td className="px-6 py-4">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.item_id || ''}
                                                onChange={(e) => handleFieldChange('item_id', e.target.value)}
                                                className="bg-black/40 border border-white/20 rounded px-2 py-1 text-xs w-full text-(--main-color) font-mono"
                                            />
                                        ) : (
                                            <span className="text-xs font-mono font-bold text-white/50 group-hover:text-white transition-colors uppercase">{item.item_id}</span>
                                        )}
                                    </td>

                                    {/* Status */}
                                    <td className="px-4 py-4">
                                        {isEditing ? (
                                            <select 
                                                value={editValues.status || ''}
                                                onChange={(e) => handleFieldChange('status', e.target.value)}
                                                className="bg-black/40 border border-white/20 rounded px-2 py-1 text-xs w-full text-white/70"
                                            >
                                                {statuses.filter(s => s !== 'All').map(s => <option key={s} value={s} className="bg-neutral-900 text-white">{s}</option>)}
                                            </select>
                                        ) : (
                                            <div className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full w-fit border ${
                                                item.status === 'Available' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                item.status === 'Requested' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                                'bg-green-500/10 text-green-400 border-green-500/20'
                                            }`}>
                                                {item.status}
                                            </div>
                                        )}
                                    </td>

                                    {/* Pay Req */}
                                    <td className="px-4 py-4">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.pay_req || ''}
                                                onChange={(e) => handleFieldChange('pay_req', e.target.value)}
                                                placeholder="None"
                                                className="bg-black/40 border border-white/20 rounded px-2 py-1 text-xs w-full text-white/70 placeholder:text-white/10"
                                            />
                                        ) : (
                                            <span className={`text-[10px] font-mono ${item.pay_req ? 'text-yellow-400/70' : 'text-white/10'}`}>
                                                {item.pay_req || '—'}
                                            </span>
                                        )}
                                    </td>

                                    {/* Material */}
                                    <td className="px-4 py-4">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.material || ''}
                                                onChange={(e) => handleFieldChange('material', e.target.value)}
                                                className="bg-black/40 border border-white/20 rounded px-2 py-1 text-xs w-full text-white/70"
                                            />
                                        ) : (
                                            <span className="text-xs text-white/40">{item.material || '—'}</span>
                                        )}
                                    </td>

                                    {/* Description */}
                                    <td className="px-4 py-4">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.description || ''}
                                                onChange={(e) => handleFieldChange('description', e.target.value)}
                                                className="bg-black/40 border border-white/20 rounded px-2 py-1 text-xs w-full text-white/70"
                                            />
                                        ) : (
                                            <span className="text-xs text-white/30 truncate block max-w-xs">{item.description || item.short_description || 'No description'}</span>
                                        )}
                                    </td>

                                    {/* Price */}
                                    <td className="px-4 py-4">
                                        {isEditing ? (
                                            <input 
                                                type="number"
                                                value={editValues.price_mxn || ''}
                                                onChange={(e) => handleFieldChange('price_mxn', Number(e.target.value))}
                                                className="bg-black/40 border border-white/20 rounded px-2 py-1 text-xs w-full text-white/70"
                                            />
                                        ) : (
                                            <span className="text-xs font-mono text-white/40">${Number(item.price_mxn || 0).toLocaleString()}</span>
                                        )}
                                    </td>

                                    {/* Actions */}
                                    <td className="px-6 py-4 text-right">
                                        {isEditing ? (
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={handleCancelEdit}
                                                    disabled={isCurrentSaving}
                                                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all disabled:opacity-50"
                                                >
                                                    <X size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleSave(item.id)}
                                                    disabled={isCurrentSaving}
                                                    className="p-1.5 rounded-lg bg-(--main-color) text-black hover:bg-(--main-color)/80 shadow-lg shadow-(--main-color)/20 transition-all disabled:opacity-50 flex items-center justify-center min-w-[28px]"
                                                >
                                                    {isCurrentSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={14} />}
                                                </button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => handleStartEdit(item)}
                                                className="p-1.5 rounded-lg hover:bg-white/10 text-white/20 hover:text-(--main-color) transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Edit2 size={13} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                
                {filteredItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-20 text-white/20 gap-4">
                        <AlertCircle size={32} strokeWidth={1} />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">No database records found</p>
                    </div>
                )}
            </div>
            
            {/* Footer */}
            <div className="p-3 bg-white/5 border-t border-white/10 flex items-center justify-between text-[8px] text-white/20 font-black uppercase tracking-[0.2em]">
                <div className="flex items-center gap-4 pl-3">
                    <span>Vendor Prefix Filter: True</span>
                    <div className="w-[3px] h-[3px] rounded-full bg-white/10" />
                    <span>Cross-Table Join: {allItems.length} Units</span>
                </div>
                <div className="flex items-center gap-2 pr-3">
                    <Shield size={10} className="text-(--main-color) opacity-50" />
                    <span>Authorized Development Shell</span>
                </div>
            </div>
        </div>
    );
}
