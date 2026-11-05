import { Truck } from 'lucide-react';
import { WireframeCrate } from '../../components/CrateVisuals';
import { vendors } from '../../lib/consts';
import { getDynamicCrateIdComponents } from '../../lib/utils';
import { tr } from '../../lib/i18n';

// The packed / deployed badge of an inventory row, shared by the Inventory list and Finance's payment items.
// Crate name parts, worked out once per crate for each inventory / crates snapshot (every row's badge asked again).
const crateCache = new WeakMap<object, WeakMap<object, Map<string, ReturnType<typeof getDynamicCrateIdComponents>>>>();
const crateParts = (crate: any, docs: any[], inv: any[]) => {
    let byDocs = crateCache.get(inv);
    if (!byDocs) { byDocs = new WeakMap(); crateCache.set(inv, byDocs); }
    let m = byDocs.get(docs);
    if (!m) { m = new Map(); byDocs.set(docs, m); }
    let parts = m.get(crate.id);
    if (!parts) { parts = getDynamicCrateIdComponents(crate, docs, inv); m.set(crate.id, parts); }
    return parts;
};

export const PackedCrateBadge = ({ crateId, itemId, logisticsDocs, allInventory, isCompact = false }: { crateId: string, itemId: string, logisticsDocs: any[], allInventory: any[], isCompact?: boolean }) => {
    const crate = logisticsDocs?.find((c: any) => c.id === crateId);
    
    // Find vendor from itemId
    const rawId = (itemId || '').toUpperCase();
    const vendorKey = Object.keys(vendors).sort((a, b) => b.length - a.length).find(k => rawId.startsWith(k));
    const vendorName = vendorKey ? (vendors as any)[vendorKey]?.name || vendorKey : 'Unknown';
    const vendorColor = vendorKey ? (vendors as any)[vendorKey]?.color || '#555' : '#555';

    if (!crate) {
        if (isCompact) {
            return (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-teal-500/10 border border-teal-500/20 rounded shadow-lg backdrop-blur-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-teal-400 leading-none shadow-[0_0_10px_rgba(45,212,191,0.3)]">
                        {crateId || tr("DEPLOYED")}
                    </span>
                </div>
            );
        }
        return (
            <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-teal-400 uppercase tracking-widest leading-none flex items-center gap-1"><Truck size={12} strokeWidth={3} /> {tr("DEPLOYED")}</span>
                <span className="text-[11px] font-mono font-bold text-teal-400/80">{crateId || tr("Unknown")}</span>
            </div>
        );
    }

    const { date, vendors: vList, sequence } = crateParts(crate, logisticsDocs || [], allInventory || []);
    // The same composition CratesInventoryView uses, so the badge in a row and
    // the header in the warehouse always read as the same crate.
    const crateName = date ? `${date}${vList.join('')}${sequence}` : (sequence || crate.id?.slice(0, 8).toUpperCase());
    const dims = [crate.width_cm, crate.length_cm, crate.height_cm].filter(Boolean).join('×');

    if (isCompact) {
        return (
            <div className="crate-badge crate-badge--compact flex items-center gap-1.5 shrink-0">
                <WireframeCrate w={crate.width_cm} l={crate.length_cm} h={crate.height_cm} type={crate.type} size={18} vibrant />
                <span className="crate-badge__name text-[11px] font-black tracking-[0.08em] leading-none tabular-nums">{crateName}</span>
                <span className="flex items-center gap-[2px]">
                    {vList.map(v => (
                        <span key={v} className="crate-badge__vendor" style={{ backgroundColor: vendors[v as keyof typeof vendors]?.color || '#555' }}>{v}</span>
                    ))}
                </span>
            </div>
        );
    }

    // The row badge used to be an icon plus two-letter vendor blocks and nothing
    // else -- it identified the vendors in a crate but never the crate, so you
    // could not tell two crates apart from the inventory list at all. It now
    // leads with the crate name and carries the dimensions underneath.
    return (
        <div className="crate-badge flex items-center gap-2 shrink-0" title={`${tr("Crate")} ${crateName} · ${dims} ${tr("CM")}`}>
            <span className="crate-badge__icon flex items-center justify-center shrink-0">
                <WireframeCrate w={crate.width_cm} l={crate.length_cm} h={crate.height_cm} type={crate.type} size={26} vibrant />
            </span>
            <span className="flex flex-col gap-[3px] min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                    <span className="crate-badge__name text-[13px] font-black tracking-[0.06em] leading-none tabular-nums truncate">{crateName}</span>
                    <span className="flex items-center gap-[2px] shrink-0">
                        {vList.map(v => (
                            <span key={v} className="crate-badge__vendor" style={{ backgroundColor: vendors[v as keyof typeof vendors]?.color || '#555' }}>{v}</span>
                        ))}
                    </span>
                </span>
                {dims && (
                    <span className="crate-badge__meta text-[10px] font-black uppercase tracking-[0.14em] leading-none tabular-nums">
                        {dims}<span className="opacity-50 ml-1">{tr("CM")}</span>
                    </span>
                )}
            </span>
        </div>
    );
};
