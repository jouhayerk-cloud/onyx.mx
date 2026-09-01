import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { tr } from '../../lib/i18n';
import { el } from '../../lib/i18nEnums';

const DB_COLLECTIONS = ['inventory', 'finance', 'logistics', 'production'] as const;
type DBCollectionName = typeof DB_COLLECTIONS[number];

const HIDDEN_COLS = new Set([
    'spatial_boxes_2d', 'spatial_points', 'spatial_masks', 'spatial_boxes_3d',
    '_rev', '_deleted', '_meta', '_attachments'
]);

export const DatabaseViewerPanel: React.FC<{ db: any }> = ({ db }) => {
    const [col, setCol] = useState<DBCollectionName>('inventory');
    const [docs, setDocs] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState('');
    const [sortAsc, setSortAsc] = useState(true);
    const [editCell, setEditCell] = useState<{ id: string; field: string } | null>(null);
    const [editVal, setEditVal] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!db?.[col]) return;
        const sub = db[col].find().$.subscribe((d: any[]) =>
            setDocs(d.map((x: any) => x.toJSON()))
        );
        return () => sub.unsubscribe();
    }, [db, col]);

    const fields = useMemo(() => {
        if (!docs.length) return [];
        const keys = new Set<string>();
        docs.slice(0, 20).forEach(d => Object.keys(d).forEach(k => keys.add(k)));
        return Array.from(keys).filter(k => !HIDDEN_COLS.has(k));
    }, [docs]);

    const filtered = useMemo(() => {
        let r = docs;
        if (search) {
            const q = search.toLowerCase();
            r = r.filter(d => Object.values(d).some(v => String(v ?? '').toLowerCase().includes(q)));
        }
        if (sortKey) {
            r = [...r].sort((a, b) => {
                const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, { numeric: true });
                return sortAsc ? cmp : -cmp;
            });
        }
        return r;
    }, [docs, search, sortKey, sortAsc]);

    const handleSort = (k: string) => {
        if (sortKey === k) setSortAsc(p => !p);
        else { setSortKey(k); setSortAsc(true); }
    };

    const startEdit = (id: string, field: string, val: any) => {
        setEditCell({ id, field });
        setEditVal(val === null || val === undefined ? '' : String(val));
    };

    const cancelEdit = () => { setEditCell(null); setEditVal(''); };

    const saveEdit = useCallback(async () => {
        if (!editCell || !db) return;
        setSaving(true);
        try {
            const raw = editVal.trim();
            let parsed: any = raw === '' ? null
                : raw === 'true' ? true
                    : raw === 'false' ? false
                        : !isNaN(Number(raw)) && raw !== '' ? Number(raw)
                            : raw;

            const { error } = await supabase.from(col).update({ [editCell.field]: parsed }).eq('id', editCell.id);
            if (error) throw error;

            const local = await db[col].findOne(editCell.id).exec();
            if (local) await local.patch({ [editCell.field]: parsed });

            toast.success(`Saved · ${editCell.field}`);
            setEditCell(null);
        } catch (e: any) {
            toast.error('Save failed: ' + e.message);
        } finally {
            setSaving(false);
        }
    }, [editCell, editVal, db, col]);

    const deleteRow = async (id: string) => {
        if (!confirm(`Delete record ${id}? This cannot be undone.`)) return;
        try {
            const { error } = await supabase.from(col).delete().eq('id', id);
            if (error) throw error;
            const local = await db[col].findOne(id).exec();
            if (local) await local.remove();
            toast.success(tr("Record deleted"));
        } catch (e: any) {
            toast.error('Delete failed: ' + e.message);
        }
    };

    const fmt = (v: any): string => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
        return String(v);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Toolbar ── */}
            <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-white/5 bg-black/30">
                {/* Collection tabs */}
                <div className="flex items-center gap-1 p-1 bg-white/[0.05] rounded-lg border border-white/[0.06]">
                    {DB_COLLECTIONS.map(c => (
                        <button key={c}
                            onClick={() => { setCol(c); setSearch(''); setSortKey(''); cancelEdit(); }}
                            className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${col === c ? 'bg-[#AEE6F5] text-black shadow' : 'text-white/30 hover:text-white/70'
                                }`}>
                            {el(c)}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={tr("Search any field…")}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white/80 placeholder-white/20 focus:outline-none focus:border-[#AEE6F5]/40 transition-colors"
                    />
                </div>

                {/* Stats */}
                <div className="ml-auto text-right">
                    <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                        {filtered.length} / {docs.length} {tr("rows ·")} {fields.length} cols
                    </p>
                    <p className="text-[9px] text-[#AEE6F5]/50 font-mono">{tr("click cell to edit · ↵ save · esc cancel")}</p>
                </div>
            </div>

            {/* ── Table ── */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                {docs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <svg className="w-12 h-12 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                        </svg>
                        <p className="text-xs text-white/20 font-black uppercase tracking-widest">{tr("Syncing…")}</p>
                    </div>
                ) : (
                    <table className="text-left border-collapse text-[11px]"
                        style={{ minWidth: `${fields.length * 110 + 60}px`, width: '100%' }}>
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-black/70 backdrop-blur-xl border-b border-white/[0.07]">
                                {fields.map(f => (
                                    <th key={f}
                                        onClick={() => handleSort(f)}
                                        className="px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-white/30 cursor-pointer hover:text-[#AEE6F5] whitespace-nowrap select-none transition-colors">
                                        {f}
                                        {sortKey === f
                                            ? <span className="ml-1 text-[#AEE6F5]">{sortAsc ? '↑' : '↓'}</span>
                                            : null}
                                    </th>
                                ))}
                                <th className="px-3 py-2.5 w-8 text-white/10 text-[9px]">✕</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {filtered.map(row => (
                                <tr key={row.id} className="hover:bg-white/[0.025] group transition-colors">
                                    {fields.map(f => {
                                        const isEditing = editCell?.id === row.id && editCell?.field === f;
                                        const display = fmt(row[f]);
                                        return (
                                            <td key={f}
                                                onClick={() => !isEditing && startEdit(row.id, f, row[f])}
                                                title={display}
                                                className={`px-3 py-1.5 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer transition-all ${f === 'id' ? 'font-mono text-[10px] text-white/20'
                                                        : display ? 'text-white/65' : 'text-white/15'
                                                    } ${isEditing
                                                        ? 'bg-[#AEE6F5]/10 ring-1 ring-inset ring-[#AEE6F5]/40'
                                                        : 'hover:bg-white/[0.05]'}`}>
                                                {isEditing ? (
                                                    <input
                                                        autoFocus
                                                        value={editVal}
                                                        onChange={e => setEditVal(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') saveEdit();
                                                            if (e.key === 'Escape') cancelEdit();
                                                        }}
                                                        onBlur={cancelEdit}
                                                        disabled={saving}
                                                        className="w-full min-w-[120px] bg-transparent text-white focus:outline-none font-mono text-[11px]"
                                                    />
                                                ) : display ? display : (
                                                    <span className="italic text-white/15">null</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="px-2 py-1.5 text-center">
                                        <button
                                            onClick={() => deleteRow(row.id)}
                                            className="opacity-0 group-hover:opacity-100 text-red-400/50 hover:text-red-400 transition-all text-xs font-black"
                                            title={tr("Delete row")}>
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Edit footer ── */}
            {editCell && (
                <div className="shrink-0 flex items-center gap-3 px-5 py-2 border-t border-[#AEE6F5]/20 bg-[#AEE6F5]/5">
                    <span className="text-[10px] text-[#AEE6F5]/70 font-mono">
                        Editing&nbsp;
                        <strong className="text-[#AEE6F5]">{editCell.field}</strong>
                        &nbsp;on {editCell.id.slice(0, 12)}…
                    </span>
                    <button
                        onClick={saveEdit}
                        disabled={saving}
                        className="ml-auto px-4 py-1 rounded-lg bg-[#AEE6F5] text-black text-[10px] font-black disabled:opacity-50">
                        {saving ? tr("Saving…") : tr("Save")}
                    </button>
                    <button onClick={cancelEdit}
                        className="px-3 py-1 rounded-lg bg-white/5 text-white/40 text-[10px] font-black">
                        {tr("Cancel")}
                    </button>
                </div>
            )}
        </div>
    );
};
