
import React, { useState, useEffect, useMemo } from 'react';
import { useAtom } from 'jotai/react';
import { inventoryAtom, storeInventoryAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { Search, Filter, Save, X, Edit2, AlertCircle, Loader2, Shield, Hash, Layers, DollarSign } from 'lucide-react';
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
            const { id: itemId, ...updateData } = editValues as DBItem;
            const cleanUpdate: any = {};
            ['item_id', 'status', 'pay_req', 'material', 'description', 'price_mxn'].forEach(key => {
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

    const handleFieldChange = (field: keyof DBItem, value: any) => {
        setEditValues(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="flex flex-col gap-8 animate-in fade-in duration-1000">
            {/* Header: Frameless HUD Controls */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <Layers size={14} className="text-(--main-color)/40" />
                    <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-white/30">Master Index Override</h2>
                    <div className="h-px grow bg-linear-to-r from-white/5 to-transparent" />
                    <div className="flex items-center gap-2 px-3 py-1 bg-(--main-color)/5 border border-(--main-color)/10 rounded-full">
                        <div className="w-1 h-1 rounded-full bg-(--main-color) animate-pulse shadow-[0_0_8px_rgba(var(--main-color-rgb),0.5)]" />
                        <span className="text-[9px] font-black text-(--main-color) uppercase tracking-widest">{filteredItems.length} RECORDED UNITS</span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-12">
                    <div className="flex items-center gap-4 grow max-w-xl group">
                        <Search size={14} className="text-white/10 group-focus-within:text-(--main-color) transition-all" />
                        <input 
                            type="text"
                            placeholder="QUERY ARTIFACTS..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-transparent border-b border-white/5 py-2 text-xs text-white focus:outline-none focus:border-(--main-color)/40 transition-all placeholder:text-white/5 uppercase tracking-tighter w-full"
                        />
                    </div>
                    
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col gap-1">
                            <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/10">Filter / Vendor</span>
                            <select 
                                value={vendorFilter}
                                onChange={(e) => setVendorFilter(e.target.value)}
                                className="bg-transparent border-none p-0 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-(--main-color) transition-all cursor-pointer focus:ring-0"
                            >
                                {vendors.map(v => <option key={v} value={v} className="bg-neutral-900 text-white">{v.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/10">Filter / Status</span>
                            <select 
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="bg-transparent border-none p-0 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-(--main-color) transition-all cursor-pointer focus:ring-0"
                            >
                                {statuses.map(s => <option key={s} value={s} className="bg-neutral-900 text-white">{s.toUpperCase()}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Frameless Table Area */}
            <div className="overflow-x-auto custom-scrollbar pt-4">
                <table className="w-full border-collapse text-left min-w-[1000px]">
                    <thead>
                        <tr className="text-[8px] font-black uppercase tracking-[0.3em] text-white/10 border-b border-white/3">
                            <th className="px-4 py-4"><div className="flex items-center gap-2"><Hash size={10} /> UNIT ID</div></th>
                            <th className="px-4 py-4">DEPLOYMENT STATUS</th>
                            <th className="px-4 py-4">PAYMENT PROTOCOL</th>
                            <th className="px-4 py-4">MORPHOLOGY</th>
                            <th className="px-4 py-4">SPECIFICATION</th>
                            <th className="px-4 py-4"><div className="flex items-center gap-2"><DollarSign size={10} /> VALUATION</div></th>
                            <th className="px-4 py-4 text-right">OVERRIDE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/2">
                        {filteredItems.map(item => {
                            const isEditing = editingId === item.id;
                            const isCurrentSaving = isSaving === item.id;
                            
                            return (
                                <tr key={item.id} className={`group transition-all duration-500 ${isEditing ? 'bg-white/2' : 'hover:bg-white/1'}`}>
                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.item_id || ''}
                                                onChange={(e) => handleFieldChange('item_id', e.target.value)}
                                                className="bg-transparent border-b border-(--main-color)/40 py-1 text-[11px] w-full text-(--main-color) font-black focus:outline-none uppercase tracking-tighter"
                                            />
                                        ) : (
                                            <span className="text-[11px] font-black text-white/40 group-hover:text-white transition-all uppercase tracking-tight">{item.item_id}</span>
                                        )}
                                    </td>

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
                                            <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                                                item.status === 'Available' ? 'bg-blue-500/5 text-blue-500/50 border-blue-500/10' :
                                                item.status === 'Requested' ? 'bg-yellow-500/5 text-yellow-500/50 border-yellow-500/10' :
                                                'bg-green-500/5 text-green-500/50 border-green-500/10'
                                            }`}>
                                                {item.status}
                                            </span>
                                        )}
                                    </td>

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

                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.material || ''}
                                                onChange={(e) => handleFieldChange('material', e.target.value)}
                                                className="bg-transparent border-b border-white/10 py-1 text-[10px] w-full text-white/60 focus:outline-none focus:border-(--main-color)/40"
                                            />
                                        ) : (
                                            <span className="text-[10px] font-black text-white/20 uppercase truncate max-w-[120px] block">{item.material || 'UNDEFINED'}</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="text"
                                                value={editValues.description || ''}
                                                onChange={(e) => handleFieldChange('description', e.target.value)}
                                                className="bg-transparent border-b border-white/10 py-1 text-[10px] w-full text-white/60 focus:outline-none focus:border-(--main-color)/40"
                                            />
                                        ) : (
                                            <span className="text-[10px] text-white/10 font-bold uppercase truncate block max-w-xs group-hover:text-white/30 transition-all">{item.description || item.short_description || 'NO_METADATA_EXTRACTED'}</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-5">
                                        {isEditing ? (
                                            <input 
                                                type="number"
                                                value={editValues.price_mxn || ''}
                                                onChange={(e) => handleFieldChange('price_mxn', Number(e.target.value))}
                                                className="bg-transparent border-b border-white/10 py-1 text-[11px] w-full text-white/60 focus:outline-none focus:border-(--main-color)/40"
                                            />
                                        ) : (
                                            <span className="text-[11px] font-mono text-white/20 font-bold tracking-tighter group-hover:text-(--main-color)/50 transition-all">${Number(item.price_mxn || 0).toLocaleString()}</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-5 text-right">
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
                                            <button 
                                                onClick={() => handleStartEdit(item)}
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-white/0 group-hover:text-white/20 hover:text-(--main-color) hover:bg-white/5 transition-all"
                                            >
                                                <Edit2 size={12} />
                                            </button>
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
                    <span>Terminal Override Shell v1.70.0</span>
                </div>
            </div>
        </div>
    );
}
