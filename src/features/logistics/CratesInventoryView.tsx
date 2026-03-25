import React, { useState, useMemo, useEffect } from 'react';
import { useAtom } from 'jotai/react';
import { Box, Plus, Search, Package, ArrowRight, X, CheckCircle2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useDatabase } from '../../lib/hooks';
import { cratesVersionAtom, logisticsSubTabAtom } from '../../lib/atoms';

// --- Local Crate Type ---
interface CrateRecord {
    id: string;
    type: string;
    status: 'Empty' | 'Packed' | 'Partial';
    length_cm: number;
    width_cm: number;
    height_cm: number;
    weight_kg?: number;
    contents_summary?: string;
    description?: string;
    inventory_ids?: string;
    quantity?: number;
    cost_mxn?: number;
    date?: string;
    updated_at?: string;
}

// --- Status Badge ---
const StatusBadge = ({ status }: { status: CrateRecord['status'] }) => {
    const styles: Record<string, string> = {
        Empty: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        Partial: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        Packed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${styles[status] || styles.Empty}`}>
            {status}
        </span>
    );
};

// --- Crate Card ---
const CrateCard = ({ crate, onPack }: { crate: CrateRecord; onPack: (c: CrateRecord) => void }) => {
    const itemCount = crate.inventory_ids ? crate.inventory_ids.split(',').filter(Boolean).length : 0;
    return (
        <div className="group relative bg-white/3 border border-white/8 rounded-3xl overflow-hidden backdrop-blur-xl transition-all duration-500 hover:border-white/20 hover:bg-white/5 hover:shadow-2xl hover:shadow-black/30">
            {/* Top accent line */}
            <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-(--main-color)/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="p-5 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center">
                            <Box size={14} className="text-(--main-color)" strokeWidth={2} />
                        </div>
                        <span className="text-[9px] font-mono text-white/30 tracking-widest">{crate.id?.slice(0, 8).toUpperCase()}</span>
                    </div>
                    <StatusBadge status={crate.status} />
                </div>

                {/* Dimensions */}
                <div>
                    <h3 className="text-base font-black uppercase tracking-tight text-white leading-none">
                        {crate.width_cm}<span className="text-white/30 text-xs">×</span>{crate.length_cm}<span className="text-white/30 text-xs">×</span>{crate.height_cm}
                        <span className="text-[9px] text-white/30 font-black ml-1">CM</span>
                    </h3>
                    {crate.contents_summary && (
                        <p className="text-[10px] text-white/40 font-medium italic mt-1 line-clamp-1">{crate.contents_summary}</p>
                    )}
                    {crate.description && !crate.contents_summary && (
                        <p className="text-[10px] text-white/30 mt-1 line-clamp-1 font-mono italic">{crate.description}</p>
                    )}
                </div>

                {/* Stats row */}
                <div className="flex gap-3">
                    <div className="flex-1 bg-black/20 rounded-xl px-3 py-2 border border-white/5">
                        <p className="text-[7px] uppercase tracking-widest text-white/30 font-black">Items</p>
                        <p className="text-sm font-mono font-black text-white">{itemCount}</p>
                    </div>
                    <div className="flex-1 bg-black/20 rounded-xl px-3 py-2 border border-white/5">
                        <p className="text-[7px] uppercase tracking-widest text-white/30 font-black">Cost</p>
                        <p className="text-sm font-mono font-black text-(--main-color)">${(crate.cost_mxn || 0).toLocaleString()}</p>
                    </div>
                </div>

                {/* Pack button */}
                <button
                    onClick={() => onPack(crate)}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-white/5 border border-white/8 hover:bg-(--main-color)/10 hover:border-(--main-color)/40 text-white/50 hover:text-(--main-color) text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all duration-300 cursor-pointer"
                >
                    Pack Items <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    );
};

// --- Crate Creation Modal ---
const CrateCreationModal = ({ isOpen, onClose, onRefresh }: { isOpen: boolean; onClose: () => void; onRefresh: () => void }) => {
    const db = useDatabase();
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ width: '', length: '', height: '', quantity: '1', price: '', description: '' });
    const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

    if (!isOpen) return null;

    const totalCost = (parseFloat(form.quantity) || 0) * (parseFloat(form.price) || 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const qty = parseInt(form.quantity) || 1;
        const price = parseFloat(form.price) || 0;
        const w = parseFloat(form.width) || 0;
        const l = parseFloat(form.length) || 0;
        const h = parseFloat(form.height) || 0;
        if (!w || !l || !h) return toast.error('Enter all three dimensions.');

        setLoading(true);
        const tid = toast.loading(`Initializing ${qty} crate(s)…`);
        try {
            const now = new Date().toISOString();
            // Build crate rows
            const crateRows = Array.from({ length: qty }, (_, i) => ({
                type: 'crate',
                status: 'Empty',
                width_cm: w, length_cm: l, height_cm: h,
                cost_mxn: price,
                description: form.description || `Crate ${i + 1}/${qty}: ${w}×${l}×${h} cm`,
                contents_summary: '',
                quantity: 1,
                date: now,
                updated_at: now,
                inventory_ids: '',
            }));

            // Insert into Supabase logistics
            const { data: logData, error: logErr } = await supabase.from('logistics').insert(crateRows).select();
            if (logErr) throw logErr;

            // Sync to local RxDB
            if (db && logData) {
                for (const row of logData) {
                    try { await db.logistics.insert({ ...row, id: String(row.id) }); } catch (_) { /* already exists */ }
                }
            }

            // Auto-generate finance payment record
            const finPayload = {
                amount: totalCost || price * qty,
                commission: 0,
                destination: 'BBVA Ramses',
                status: 'Requested',
                date: now,
                currency: 'MXN',
                type: 'Expense',
                category: 'Logistics',
                subcategory: 'Pack',
                description: `Crate acquisition: ${qty}× (${w}×${l}×${h} cm)`,
                notes: form.description || null,
                related_ids: logData?.map((c: any) => String(c.id)) || [],
                updated_at: now,
            };

            const { data: finData, error: finErr } = await supabase.from('finance').insert(finPayload).select();
            if (finErr) {
                toast.error('Crates created but payment record failed. Check finance log.');
                console.error('[Crate] Finance insert error:', finErr);
            } else if (db && finData?.[0]) {
                try { await db.finance.insert({ ...finData[0], id: String(finData[0].id) }); } catch (_) { /* */ }
            }

            toast.success(`${qty} crate(s) initialized. Payment request generated.`, { id: tid });
            onRefresh();
            onClose();
            setForm({ width: '', length: '', height: '', quantity: '1', price: '', description: '' });
        } catch (err: any) {
            toast.error(err.message || 'Failed to create crates.', { id: tid });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-2xl animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-4xl overflow-hidden shadow-2xl flex flex-col relative">
                {/* Accent line */}
                <div className="absolute top-0 inset-x-0 h-0.5 bg-linear-to-r from-transparent via-(--main-color)/60 to-transparent" />

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <Package size={18} className="text-(--main-color)" />
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-widest text-white">Initialize Crate Protocol</h2>
                            <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em] mt-0.5">Dimensional constraints + cost basis</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/5 transition-all cursor-pointer">
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-8 py-7 flex flex-col gap-6">
                    {/* Dimensions */}
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-3">Dimensions (cm)</p>
                        <div className="grid grid-cols-3 gap-3">
                            {[['Width', 'width'], ['Length', 'length'], ['Height', 'height']].map(([label, key]) => (
                                <div key={key}>
                                    <label className="text-[8px] font-black uppercase tracking-widest text-white/20 block mb-1.5">{label}</label>
                                    <input
                                        type="number" step="0.1" min="0" required
                                        value={form[key as keyof typeof form]}
                                        onChange={e => set(key as any, e.target.value)}
                                        placeholder="0"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm font-mono text-white focus:outline-none focus:border-(--main-color)/50 transition placeholder:text-white/15"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quantity + Price */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[8px] font-black uppercase tracking-widest text-white/20 block mb-1.5">Quantity</label>
                            <input
                                type="number" min="1" required
                                value={form.quantity}
                                onChange={e => set('quantity', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm font-mono text-white focus:outline-none focus:border-(--main-color)/50 transition"
                            />
                        </div>
                        <div>
                            <label className="text-[8px] font-black uppercase tracking-widest text-white/20 block mb-1.5">Price per item (MXN)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 font-mono text-sm">$</span>
                                <input
                                    type="number" step="0.01" min="0"
                                    value={form.price}
                                    onChange={e => set('price', e.target.value)}
                                    placeholder="0.00"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-3 py-3 text-sm font-mono text-white focus:outline-none focus:border-(--main-color)/50 transition placeholder:text-white/15"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-[8px] font-black uppercase tracking-widest text-white/20 block mb-1.5">Notes (optional)</label>
                        <input
                            type="text"
                            value={form.description}
                            onChange={e => set('description', e.target.value)}
                            placeholder="Internal reference..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-white/70 focus:outline-none focus:border-(--main-color)/50 transition placeholder:text-white/15"
                        />
                    </div>

                    {/* Total preview */}
                    {totalCost > 0 && (
                        <div className="flex items-center justify-between px-4 py-3 bg-(--main-color)/5 border border-(--main-color)/15 rounded-2xl">
                            <span className="text-[9px] font-black uppercase tracking-widest text-(--main-color)/70">Total Acquisition Cost</span>
                            <span className="font-mono font-black text-(--main-color) text-sm">${totalCost.toLocaleString()} MXN</span>
                        </div>
                    )}

                    {/* Notes about payment */}
                    <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] leading-relaxed">
                        ⚡ A payment request will be auto-generated in the Finance module upon creation.
                    </p>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white border border-white/8 hover:border-white/20 transition-all cursor-pointer">
                            Cancel
                        </button>
                        <button
                            type="submit" disabled={loading}
                            className={`flex-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer ${loading ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-(--main-color) text-black hover:scale-[1.01] active:scale-[0.99] shadow-xl shadow-(--main-color)/20'}`}
                        >
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {loading ? 'Initializing…' : 'Deploy Crates'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Main CratesInventoryView ---
export const CratesInventoryView: React.FC = () => {
    const db = useDatabase();
    const [, setCratesVersion] = useAtom(cratesVersionAtom);
    const [, setSubTab] = useAtom(logisticsSubTabAtom);
    const [activeTab, setActiveTab] = useState<'empty' | 'packed'>('empty');
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [crates, setCrates] = useState<CrateRecord[]>([]);

    // Subscribe to RxDB logistics collection (only type=crate)
    useEffect(() => {
        if (!db) return;
        let timer: any;
        const sub = db.logistics.find({ selector: { type: 'crate' } }).$.subscribe((data: any[]) => {
            clearTimeout(timer);
            timer = setTimeout(() => setCrates(data.map(c => c.toJSON())), 150);
        });
        return () => { sub.unsubscribe(); clearTimeout(timer); };
    }, [db]);

    const handleRefresh = () => setCratesVersion(v => v + 1);

    // Filter crates
    const filteredCrates = useMemo(() => {
        return crates.filter(c => {
            const matchesTab = activeTab === 'empty'
                ? c.status === 'Empty'
                : (c.status === 'Packed' || c.status === 'Partial');
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q
                || c.id?.toLowerCase().includes(q)
                || c.contents_summary?.toLowerCase().includes(q)
                || c.description?.toLowerCase().includes(q);
            return matchesTab && matchesSearch;
        });
    }, [crates, activeTab, searchQuery]);

    // Status counters
    const summary = useMemo(() => ({
        empty: crates.filter(c => c.status === 'Empty').length,
        packed: crates.filter(c => c.status === 'Packed').length,
        partial: crates.filter(c => c.status === 'Partial').length,
    }), [crates]);

    const handlePack = (crate: CrateRecord) => {
        // Switch to packing tab and pass crate ID (could be via atom if needed)
        toast.success(`Selected crate ${crate.id.slice(0, 8).toUpperCase()} — switching to packing…`, { icon: '📦' });
        setSubTab('packing');
    };

    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            {/* Top bar */}
            <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-black/20 backdrop-blur-2xl shrink-0 z-10">
                <div className="flex items-center gap-8">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white">
                            Logistics <span className="text-(--main-color) italic">Crates</span>
                        </h2>
                        <div className="flex items-center gap-5 mt-1">
                            {[
                                { label: 'Empty', value: summary.empty, dot: 'bg-emerald-400', color: 'text-emerald-400' },
                                { label: 'Partial', value: summary.partial, dot: 'bg-amber-400', color: 'text-amber-400' },
                                { label: 'Packed', value: summary.packed, dot: 'bg-rose-400', color: 'text-rose-400' },
                            ].map(s => (
                                <div key={s.label} className="flex items-center gap-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                    <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{s.label}</span>
                                    <span className={`text-[11px] font-mono font-black ${s.color}`}>{s.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 p-1 bg-white/5 border border-white/8 rounded-2xl">
                        {[['empty', 'Empty Inventory'], ['packed', 'Packed Crates']].map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => setActiveTab(val as any)}
                                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === val ? 'bg-white text-black shadow-sm' : 'text-white/40 hover:text-white'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Search */}
                    <div className="relative">
                        <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                        <input
                            type="text"
                            placeholder="SEARCH CRATES…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="bg-white/5 border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-[10px] font-mono text-white uppercase tracking-widest outline-none focus:border-(--main-color)/50 focus:bg-white/8 transition w-52"
                        />
                    </div>

                    {/* New Crate */}
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-(--main-color) text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-(--main-color)/20 cursor-pointer"
                    >
                        <Plus size={14} strokeWidth={3} /> New Crate
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-8 py-7 custom-scrollbar">
                {filteredCrates.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 content-start">
                        {filteredCrates.map(crate => (
                            <CrateCard key={crate.id} crate={crate} onPack={handlePack} />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-6">
                        <div className="relative">
                            <div className="w-28 h-28 rounded-full border border-dashed border-white/10 flex items-center justify-center bg-white/2">
                                <Box size={44} className="text-white/15" strokeWidth={1} />
                            </div>
                            <div className="absolute inset-0 bg-(--main-color)/5 rounded-full blur-3xl" />
                        </div>
                        <div>
                            <h3 className="text-3xl font-black uppercase tracking-tighter italic text-white mb-2">
                                No {activeTab} crates
                            </h3>
                            <p className="text-[10px] font-black text-white/25 uppercase tracking-[0.3em] font-mono max-w-xs">
                                {activeTab === 'empty'
                                    ? 'No empty crates available. Create new crates to begin packing.'
                                    : 'No packed crates yet. Select items in the packing flow.'}
                            </p>
                        </div>
                        {activeTab === 'empty' && (
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="group flex items-center gap-2.5 px-6 py-3 rounded-2xl border border-white/8 bg-white/3 hover:border-(--main-color)/40 hover:bg-(--main-color)/5 transition-all cursor-pointer"
                            >
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/50 group-hover:text-white transition-colors">Initialize Crate Protocol</span>
                                <ArrowRight size={13} className="text-white/20 group-hover:text-(--main-color) group-hover:translate-x-1 transition-all" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Crate Creation Modal */}
            {isModalOpen && (
                <CrateCreationModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onRefresh={handleRefresh}
                />
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--main-color, #F97316); }
            `}</style>
        </div>
    );
};
