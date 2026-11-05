import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    isPaymentWizardOpenAtom,
    selectedInventoryIdsAtom,
    inventoryAtom,
    logisticsDocsAtom,
    exchangeRateAtom,
    inventoryStatusSetsAtom,
    paymentsArtifactConfigAtom,
    paymentsVersionAtom,
    InventoryVersionAtom,
    userAtom
} from '../../lib/atoms';
import { X, CheckCircle2, Clock, AlertCircle, CircleDashed, Check, Minus, Send, Box } from 'lucide-react';
import { getStatusClass, normalizeInventoryData } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import { useDatabase } from '../../lib/hooks';
import { PaymentDestination } from '../../lib/Types';
import { destinationsConfig } from '../../lib/paymentConfig';
import { ItemTag } from '../../components/ui/ItemTag';
import toast from '../onyxIsland/notify/toast';
import { tr } from '../../lib/i18n';
import { appendExpense } from './TrackingPaymentsView';

type Line = {
    key: string;          // inventory row id or crate id
    kind: 'inv' | 'log';
    vendorId: string;
    label: string;
    qty: number;
    mxn: number;          // line total in MXN (unit price x qty)
    isProduction: boolean;
    raw: any;
};

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0);
const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const PERCENTS = [25, 50, 75, 100];

/**
 * Payment request for the items selected in Inventory. Amounts use the book rate
 * (exchangeRateAtom, 17 MXN/USD) like the workbooks, never the live market rate.
 * Each vendor with checked items becomes one finance record, written by the same
 * appendExpense the Finances module uses.
 */
export const ItemsPayWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPaymentWizardOpenAtom);
    const selectedIds = useAtomValue(selectedInventoryIdsAtom);
    const allInventory = useAtomValue(inventoryAtom);
    const allLogistics = useAtomValue(logisticsDocsAtom);
    const rate = useAtomValue(exchangeRateAtom) || 17;
    const { partialPayIds, fullPayIds, requestedAcqIds } = useAtomValue(inventoryStatusSetsAtom);
    const user = useAtomValue(userAtom);
    const setPaymentsArtifact = useSetAtom(paymentsArtifactConfigAtom);
    const setPaymentsVersion = useSetAtom(paymentsVersionAtom);
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    const db = useDatabase();

    // ── Split the selection by payment state ─────────────────────────────────
    const { open, paid, requested, partial } = useMemo(() => {
        const res = { open: [] as Line[], paid: [] as Line[], requested: [] as Line[], partial: [] as Line[] };
        const ids = new Set(selectedIds.map(String));

        allInventory.filter(i => ids.has(String(i.row))).forEach(item => {
            const norm: any = normalizeInventoryData(item.data);
            const qty = Number(norm.quantity || norm.qty || 1) || 1;
            const line: Line = {
                key: String(item.row),
                kind: 'inv',
                vendorId: norm.vendorId || String(norm.itemId || '').split('-')[0] || 'MISC',
                label: `${norm.shape || ''} ${norm.shortDescription || norm.description || ''}`.trim(),
                qty,
                mxn: (parseFloat(norm.price || norm.price_mxn) || 0) * qty,
                isProduction: String(norm.status || '').toLowerCase().includes('production'),
                raw: item.data,
            };
            const status = getStatusClass(norm, partialPayIds, fullPayIds, requestedAcqIds);
            (status === 'GREEN' ? res.paid : status === 'YELLOW' ? res.requested : status === 'RED' ? res.partial : res.open).push(line);
        });

        (allLogistics || []).filter((c: any) => ids.has(String(c.id))).forEach((c: any) => {
            const payReq = String(c.pay_req || '').toLowerCase();
            const searchStr = `${c.vendors || ''} ${c.description || ''} ${c.vendor_id || ''}`.toUpperCase();
            const qty = Number(c.quantity || 1) || 1;
            const line: Line = {
                key: String(c.id),
                kind: 'log',
                vendorId: searchStr.includes('JUAN') ? 'JUAN' : searchStr.includes('SIMONA') ? 'SIMONA' : String(c.vendors || c.vendor_id || 'CRATES').toUpperCase(),
                label: c.description || `Crate ${c.id}`,
                qty,
                mxn: (Number(c.cost_mxn) || 0) * qty,
                isProduction: false,
                raw: c,
            };
            (payReq === 'paid' || payReq === 'true' ? res.paid : payReq === 'requested' ? res.requested : res.open).push(line);
        });
        return res;
    }, [allInventory, allLogistics, selectedIds, partialPayIds, fullPayIds, requestedAcqIds]);

    const byVendor = useMemo(() => {
        const m: Record<string, Line[]> = {};
        open.forEach(l => { (m[l.vendorId] ||= []).push(l); });
        return m;
    }, [open]);

    // ── Request state ────────────────────────────────────────────────────────
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [dest, setDest] = useState<PaymentDestination | null>(null);
    const [percent, setPercent] = useState(100);
    const [iva, setIva] = useState(false);
    const [comm, setComm] = useState(false);
    const [fee, setFee] = useState('');
    const [busy, setBusy] = useState(false);

    // Every unrequested item starts checked; re-seed when the selection changes.
    // Keyed on the ids, not the array, so a background sync does not undo the user's unchecks.
    const openKeys = open.map(l => l.key).join(',');
    useEffect(() => { setChecked(new Set(openKeys ? openKeys.split(',') : [])); }, [openKeys]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, setIsOpen]);

    if (!isOpen) return null;

    const close = () => setIsOpen(false);
    const toggle = (keys: string[], on: boolean) => setChecked(prev => {
        const next = new Set(prev);
        keys.forEach(k => (on ? next.add(k) : next.delete(k)));
        return next;
    });

    const chosenByVendor = Object.entries(byVendor)
        .map(([vendorId, lines]) => ({ vendorId, lines: lines.filter(l => checked.has(l.key)) }))
        .filter(g => g.lines.length > 0);

    const sum = (lines: Line[]) => lines.reduce((a, l) => a + l.mxn, 0);
    const feesFor = (amount: number) => (parseFloat(fee) || 0) + (iva ? amount * 0.16 : 0) + (comm ? amount * 0.10 : 0);
    const subtotal = chosenByVendor.reduce((a, g) => a + sum(g.lines) * (percent / 100), 0);
    // A manual fee is per request, so it is charged once per vendor record.
    const fees = chosenByVendor.reduce((a, g) => a + feesFor(sum(g.lines) * (percent / 100)), 0);
    const total = subtotal + fees;
    const chosenCount = chosenByVendor.reduce((a, g) => a + g.lines.length, 0);

    const handleRequest = async () => {
        if (busy || !dest || chosenByVendor.length === 0) return;
        setBusy(true);
        const tid = toast.loading(tr('Sending request…'));
        try {
            for (const { vendorId, lines } of chosenByVendor) {
                const amount = Number((sum(lines) * (percent / 100)).toFixed(2));
                const commission = Number(feesFor(amount).toFixed(2));
                const invIds = lines.filter(l => l.kind === 'inv').map(l => l.key);
                const crateIds = lines.filter(l => l.kind === 'log').map(l => l.key);
                const allIds = [...invIds, ...crateIds].join(',');
                const isPartial = percent < 100;
                const subcategory = crateIds.length && !invIds.length ? 'Pack' : lines.some(l => l.isProduction) ? 'Prod' : 'Acq';

                // Description ends in "from <vendorId>": Finances reads the vendor from it.
                const data = await appendExpense({
                    description: `${isPartial ? `Partial Payment (${percent}%)` : 'Payment'} for ${lines.length} items from ${vendorId}`,
                    amount,
                    commission,
                    destination: dest,
                    status: 'Requested',
                    subcategory,
                    vendor_id: vendorId,
                    inventoryItemRows: isPartial ? null : allIds,
                    linkedRows: isPartial ? allIds : null,
                    notes: `Requested from Inventory selection by ${user?.name || 'Unknown'} at ${rate} MXN/USD.`,
                }, db);
                const paymentId = data?.[0]?.id ? String(data[0].id) : null;

                if (crateIds.length) {
                    const { error } = await supabase.from('logistics').update({ pay_req: 'requested', payment_ids: paymentId }).in('id', crateIds);
                    if (error) throw error;
                }
                // Reflect the new state locally so Inventory updates before the next sync.
                if (db) {
                    for (const id of invIds) {
                        try {
                            const doc = await db.inventory.findOne({ selector: { id } }).exec();
                            if (doc) await doc.patch({ pay_req: 'requested', payReq: 'requested', payment_ids: paymentId });
                        } catch (e) { console.error(e); }
                    }
                }
            }
            toast.success(chosenByVendor.length > 1 ? `${chosenByVendor.length} ${tr('payment requests sent')}` : tr('Payment requested'), { id: tid });
            setInventoryVersion(v => v + 1);
            setPaymentsVersion(v => v + 1);
            close();
        } catch (err: any) {
            toast.error(err?.message || tr('Request failed'), { id: tid });
        } finally {
            setBusy(false);
        }
    };

    const openPayments = (lines: Line[], title: string) =>
        setPaymentsArtifact({ isOpen: true, itemIds: lines.map(l => l.key), title });

    const states = [
        { label: tr('To request'), lines: open, color: '#38bdf8', icon: CircleDashed, onClick: undefined as undefined | (() => void) },
        { label: tr('Requested'), lines: requested, color: '#eab308', icon: Clock, onClick: () => openPayments(requested, 'Requested Items Detail') },
        { label: tr('Partial'), lines: partial, color: '#ef4444', icon: AlertCircle, onClick: () => openPayments(partial, 'Partial Items Detail') },
        { label: tr('Paid'), lines: paid, color: '#22c55e', icon: CheckCircle2, onClick: () => openPayments(paid, 'Paid Items Detail') },
    ];

    return createPortal(
        <div className="pay-scrim fixed inset-0 z-[10000] flex items-end md:items-center justify-center p-0 md:p-6" onClick={close}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={tr('Request payment')}
                className="pay-sheet liquid-panel relative w-full max-w-5xl h-[92dvh] md:h-[86vh] flex flex-col overflow-hidden rounded-t-[18px] md:rounded-[18px] text-(--text-color)"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex items-center gap-3 px-5 py-3 border-b border-(--lq-rim) shrink-0">
                    <div className="flex flex-col min-w-0 flex-1">
                        <h2 className="text-[15px] font-semibold leading-tight">{tr('Request payment')}</h2>
                        <p className="text-[12px] text-(--text-color-secondary) tabular-nums">
                            {selectedIds.length} {tr('selected')} · {tr('Book rate')} {rate} MXN/USD
                        </p>
                    </div>
                    <button onClick={close} aria-label={tr('Close')} className="liquid-control w-9 h-9 rounded-full flex items-center justify-center">
                        <X size={18} />
                    </button>
                </header>

                {/* Payment state of the selection */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-5 py-3 shrink-0">
                    {states.map(s => (
                        <button
                            key={s.label}
                            type="button"
                            disabled={!s.onClick || s.lines.length === 0}
                            onClick={s.onClick}
                            className="liquid-control flex items-center gap-3 px-3 py-2 rounded-[10px] text-left disabled:cursor-default"
                        >
                            <s.icon size={16} style={{ color: s.color }} className="shrink-0" />
                            <div className="flex flex-col min-w-0">
                                <span className="text-[11px] text-(--text-color-secondary)">{s.label} · {s.lines.length}</span>
                                <span className="text-[13px] font-semibold tabular-nums">{fmtMXN(sum(s.lines))}</span>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Items to request, grouped by vendor */}
                <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
                    {open.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-2 text-(--text-color-secondary) text-[13px] text-center">
                            <CheckCircle2 size={28} />
                            {tr('Every selected item already has a payment request.')}
                        </div>
                    ) : Object.entries(byVendor).map(([vendorId, lines]) => {
                        const keys = lines.map(l => l.key);
                        const n = keys.filter(k => checked.has(k)).length;
                        const all = n === keys.length;
                        const vColor = (vendors as any)[vendorId]?.color || '#888';
                        const vendorSum = sum(lines.filter(l => checked.has(l.key)));
                        return (
                            <section key={vendorId} className="rounded-[14px] border border-(--lq-rim) overflow-hidden">
                                <div className="flex items-center gap-3 px-3 py-2 bg-(--lq-fill-control)">
                                    <CheckBox state={all ? 'on' : n ? 'mixed' : 'off'} onClick={() => toggle(keys, !all)} label={`${tr('Select all from')} ${vendorId}`} />
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: vColor }} />
                                    <span className="text-[13px] font-semibold truncate">{(vendors as any)[vendorId]?.name || vendorId}</span>
                                    <span className="text-[12px] text-(--text-color-secondary) tabular-nums">{n}/{keys.length}</span>
                                    <span className="ml-auto text-[13px] font-semibold tabular-nums">{fmtMXN(vendorSum)}</span>
                                    <span className="hidden sm:inline text-[12px] text-(--text-color-secondary) tabular-nums w-16 text-right">{fmtUSD(vendorSum / rate)}</span>
                                </div>
                                <ul>
                                    {lines.map(l => {
                                        const on = checked.has(l.key);
                                        return (
                                            <li
                                                key={l.key}
                                                onClick={() => toggle([l.key], !on)}
                                                className={`flex items-center gap-3 px-3 py-2 border-t border-(--lq-rim) cursor-pointer transition-opacity ${on ? '' : 'opacity-45'}`}
                                            >
                                                <CheckBox state={on ? 'on' : 'off'} onClick={() => toggle([l.key], !on)} label={l.label || l.key} />
                                                {l.kind === 'inv'
                                                    ? <ItemTag item={l.raw} />
                                                    : <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md liquid-control"><Box size={12} />{tr('Crate')}</span>}
                                                <span className="text-[13px] truncate flex-1 min-w-0">{l.label}</span>
                                                <span className="text-[12px] text-(--text-color-secondary) tabular-nums">×{l.qty}</span>
                                                <span className="text-[13px] tabular-nums w-24 text-right">{fmtMXN(l.mxn)}</span>
                                                <span className="hidden sm:inline text-[12px] text-(--text-color-secondary) tabular-nums w-16 text-right">{fmtUSD(l.mxn / rate)}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })}
                </div>

                {/* Bottom action bar */}
                {open.length > 0 && (
                    <footer className="shrink-0 border-t border-(--lq-rim) px-5 py-3 space-y-3 pb-[max(12px,env(safe-area-inset-bottom))]">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-(--text-color-secondary) w-full md:w-auto">{tr('Pay to')}</span>
                            {(Object.keys(destinationsConfig) as PaymentDestination[]).map(key => (
                                <Chip key={key} on={dest === key} onClick={() => setDest(key)}>{destinationsConfig[key].name}</Chip>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-(--text-color-secondary)">{tr('Amount')}</span>
                            {PERCENTS.map(p => <Chip key={p} on={percent === p} onClick={() => setPercent(p)}>{p}%</Chip>)}
                            <span className="w-px h-5 bg-(--lq-rim) mx-1" />
                            <Chip on={iva} onClick={() => setIva(!iva)}>IVA 16%</Chip>
                            <Chip on={comm} onClick={() => setComm(!comm)}>{tr('Comm.')} 10%</Chip>
                            <label className="liquid-control flex items-center gap-1 h-8 px-2 rounded-[8px] text-[12px]">
                                <span className="text-(--text-color-secondary)">{tr('Fee')}</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    value={fee}
                                    onChange={e => setFee(e.target.value)}
                                    placeholder="0"
                                    className="w-16 bg-transparent outline-none tabular-nums text-right"
                                />
                            </label>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                            <div className="flex items-baseline gap-4 tabular-nums flex-1">
                                <div className="flex flex-col">
                                    <span className="text-[11px] text-(--text-color-secondary)">{chosenCount} {tr('items')} · {chosenByVendor.length} {chosenByVendor.length === 1 ? tr('vendor') : tr('vendors')}</span>
                                    <span className="text-[22px] font-semibold leading-tight">{fmtMXN(total)}</span>
                                </div>
                                <span className="text-[13px] text-(--text-color-secondary)">{fmtUSD(total / rate)}</span>
                                {fees > 0 && <span className="text-[12px] text-(--text-color-secondary)">{tr('incl. fees')} {fmtMXN(fees)}</span>}
                            </div>
                            <button
                                type="button"
                                onClick={handleRequest}
                                disabled={busy || !dest || chosenCount === 0}
                                className="h-11 px-6 rounded-[12px] flex items-center justify-center gap-2 font-semibold text-[14px] bg-(--main-color) text-black disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
                            >
                                <Send size={16} />
                                {!dest ? tr('Choose where to pay')
                                    : chosenByVendor.length > 1 ? `${tr('Send')} ${chosenByVendor.length} ${tr('requests')}`
                                    : tr('Send request')}
                            </button>
                        </div>
                    </footer>
                )}

                <style>{`
                    .pay-scrim { background: rgba(2,6,16,.18); backdrop-filter: blur(14px) saturate(1.35); -webkit-backdrop-filter: blur(14px) saturate(1.35); }
                    html.theme-aqua .pay-scrim { background: rgba(255,255,255,.22); }
                    @media (prefers-reduced-transparency: reduce) { .pay-scrim { backdrop-filter: none; -webkit-backdrop-filter: none; background: rgba(2,6,16,.6); } }
                `}</style>
            </div>
        </div>,
        document.body
    );
};

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
    <button
        type="button"
        aria-pressed={on}
        onClick={onClick}
        className={`liquid-control h-8 px-3 rounded-[8px] text-[12px] whitespace-nowrap transition-colors ${on ? 'ring-1 ring-(--main-color) text-(--main-color) font-semibold' : ''}`}
    >
        {children}
    </button>
);

const CheckBox: React.FC<{ state: 'on' | 'off' | 'mixed'; onClick: () => void; label: string }> = ({ state, onClick, label }) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={state === 'mixed' ? 'mixed' : state === 'on'}
        aria-label={label}
        onClick={e => { e.stopPropagation(); onClick(); }}
        className={`w-5 h-5 shrink-0 rounded-[6px] flex items-center justify-center border transition-colors ${state === 'off' ? 'border-(--lq-rim)' : 'bg-(--main-color) border-(--main-color) text-black'}`}
    >
        {state === 'on' && <Check size={13} strokeWidth={3} />}
        {state === 'mixed' && <Minus size={13} strokeWidth={3} />}
    </button>
);
