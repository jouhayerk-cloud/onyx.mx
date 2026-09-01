import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, CreditCard } from 'lucide-react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { PaymentDestination, ExpenseStatus, FinanceRecord, InventoryItem } from '../../lib/Types';
import { vendors, appUsers } from '../../lib/consts';
import { paymentsVersionAtom, userAtom, inventoryAtom, financeDataAtom, InventoryVersionAtom, paymentDestinationFilterAtom, paymentVendorFilterAtom, financeSearchTermAtom, paymentsOverviewModeAtom, paymentCategoryFilterAtom, paymentFilterBarModeAtom } from '../../lib/atoms';
import { SkeletonBox, SkeletonText, SkeletonBadge } from '../../components/Skeleton';

import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg } from '../../lib/utils';

type VendorGroup = {
    vendorId: string;
    items: InventoryItem[];
    total: number;
};

import { destinationsConfig } from '../../lib/paymentConfig';
import { tr } from '../../lib/i18n';
import { el } from '../../lib/i18nEnums';

const formatCurrency = (amount: number, currency: 'USD' | 'MXN') => new Intl.NumberFormat(currency === 'MXN' ? 'es-MX' : 'en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);

const getVendorIdFromDescription = (description: string): string | null => {
    const match = description.match(/from (\w+)$/);
    return match ? match[1] : null;
};

const apiCall = async (action: string, payload: any, db: any) => {
    if (action === 'appendExpense') {
        const { error, data } = await supabase.from('finance').insert({
            amount: payload.expenseData.amount,
            commission: payload.expenseData.commission,
            destination: payload.expenseData.destination,
            status: payload.expenseData.status,
            date: payload.expenseData.date,
            currency: 'MXN',
            type: payload.expenseData.type || 'Expense',
            category: payload.expenseData.category || 'Vendor Payment',
            description: payload.expenseData.description,
            related_ids: payload.expenseData.inventoryItemRows ? payload.expenseData.inventoryItemRows.split(',') : []
        }).select();
        if (error) throw error;

        if (payload.expenseData.inventoryItemRows) {
            const ids = payload.expenseData.inventoryItemRows.split(',');
            await supabase.from('inventory').update({ pay_req: true }).in('id', ids);
            if (db) {
                await db.inventory.find({ selector: { id: { $in: ids } } }).update({ $set: { payReq: 'true' } });
            }
        }
        return { status: 'success', data };
    }

    if (action === 'updateExpense') {
        const { error } = await supabase.from('finance').update({
            status: payload.expenseData.status,
            pay_date: payload.expenseData.pay_date
        }).eq('id', payload.row);
        if (error) throw error;
        return { status: 'success' };
    }

    if (action === 'batchUpdateItems') {

        for (const update of payload.updates) {
            await supabase.from('inventory').update({
                pay_req: !!update.itemData.payReq,
                pay_date: update.itemData.payDate || null,
                status: update.itemData.status || undefined
            }).eq('id', update.row);
        }
        return { status: 'success' };
    }

    return { status: 'error', message: 'Action not implemented' };
};

const DestinationCard: React.FC<{
    destination: PaymentDestination;
    config: typeof destinationsConfig[keyof typeof destinationsConfig];
    isSelected: boolean;
    onClick: () => void;
    baseAmount?: number;
    isCompact?: boolean;
}> = ({ destination, config, isSelected, onClick, baseAmount, isCompact = false }) => {
    const commission = baseAmount ? config.calculateCommission(baseAmount) : null;
    const total = baseAmount && commission !== null ? baseAmount + commission : null;

    if (isCompact) {
        return (
            <div
                className={`p-2 rounded-lg border-2 flex-1 flex flex-col items-center justify-start gap-1 cursor-pointer transition-all ${isSelected ? 'border-(--main-color) bg-(--main-color)/20 shadow-lg' : 'border-transparent hover:bg-(--text-color)/10'}`}
                onClick={onClick}
            >
                <img src={config.icon} alt={config.name} className="w-full h-10 object-contain" />
                <p className="text-[10px] text-center font-black uppercase tracking-widest mt-1 leading-tight text-(--text-color)">{config.name}</p>
            </div>
        )
    }

    return (
        <div
            className={`p-4 rounded-lg border-2 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${isSelected ? 'border-(--main-color) bg-(--main-color)/20 shadow-lg' : 'border-transparent hover:bg-(--text-color)/10'}`}
            onClick={onClick}
        >
            <img src={config.icon} alt={config.name} className="w-24 h-16 object-contain" />
            <p className="font-black uppercase tracking-widest text-xs text-(--text-color)">{config.name}</p>
            {baseAmount !== undefined && (
                <div className="text-xs text-center mt-2">
                    {commission !== null && <p className="text-(--text-color-secondary)">{tr("Comm:")} {formatCurrency(commission, 'MXN')}</p>}
                    {total !== null && <p className="font-bold">{tr("Total:")} {formatCurrency(total, 'MXN')}</p>}
                </div>
            )}
        </div>
    );
};

const AddExpenseModal: React.FC<{ isOpen: boolean, onClose: () => void }> = ({ isOpen, onClose }) => {
    const db = useDatabase();
    const setPaymentsVersion = useSetAtom(paymentsVersionAtom);
    const [isSaving, setIsSaving] = useState(false);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [destination, setDestination] = useState<PaymentDestination | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const numericAmount = parseFloat(amount);
        if (!description || isNaN(numericAmount) || numericAmount <= 0 || !destination) {
            return toast.error(tr("Please provide a valid description, amount, and destination."));
        }

        setIsSaving(true);
        const toastId = toast.loading(tr("Adding general expense..."));
        try {
            const commission = destinationsConfig[destination].calculateCommission(numericAmount);
            await apiCall('appendExpense', {
                expenseData: {
                    description,
                    amount: numericAmount,
                    commission,
                    destination,
                    status: 'Requested',
                    date: new Date().toISOString(),
                }
            }, db);
            toast.success(tr("General expense added!"), { id: toastId });
            setPaymentsVersion(v => v + 1);
            onClose();
        } catch (error: any) {
            toast.error(`Error: ${error.message}`, { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <form onSubmit={handleSubmit}>
                    <h2 className="modal-header">{tr("Add General Expense")}</h2>
                    <div className="modal-body">
                        <input type="text" placeholder={tr("Description")} value={description} onChange={e => setDescription(e.target.value)} required />
                        <input type="number" placeholder={tr("Amount (MXN)")} value={amount} onChange={e => setAmount(e.target.value)} required step="0.01" />
                        <h3 className="text-lg font-bold mt-4 mb-2">{tr("Select Payment Destination")}</h3>
                        <div className="flex gap-2">
                            {Object.entries(destinationsConfig).map(([key, config]) => (
                                <DestinationCard
                                    key={key}
                                    destination={key as PaymentDestination}
                                    config={config}
                                    isSelected={destination === key}
                                    onClick={() => setDestination(key as PaymentDestination)}
                                    isCompact={true}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" onClick={onClose} className="button secondary" disabled={isSaving}>{tr("Cancel")}</button>
                        <button type="submit" className="button" disabled={isSaving || !destination}>{isSaving ? tr("Saving...") : tr("Add Expense")}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const RequestPaymentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    vendorGroup: VendorGroup | null;
    onConfirm: (destination: PaymentDestination) => void;
}> = ({ isOpen, onClose, vendorGroup, onConfirm }) => {
    if (!isOpen || !vendorGroup) return null;

    const [selectedDestination, setSelectedDestination] = useState<PaymentDestination | null>(null);

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2 className="modal-header">Request Payment for {appUsers[vendorGroup.vendorId as keyof typeof appUsers]?.name || vendorGroup.vendorId}</h2>
                <div className="modal-body">
                    <p>Total for {vendorGroup.items.length} {tr("items:")} <strong>{formatCurrency(vendorGroup.total, 'MXN')}</strong></p>
                    <h3 className="text-lg font-bold mt-4 mb-2">{tr("Select Payment Destination")}</h3>
                    <div className="grid grid-cols-2 gap-4">
                        {Object.entries(destinationsConfig).map(([key, config]) => (
                            <DestinationCard
                                key={key}
                                destination={key as PaymentDestination}
                                config={config}
                                isSelected={selectedDestination === key}
                                onClick={() => setSelectedDestination(key as PaymentDestination)}
                                baseAmount={vendorGroup.total}
                            />
                        ))}
                    </div>
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="button secondary">{tr("Cancel")}</button>
                    <button
                        onClick={() => selectedDestination && onConfirm(selectedDestination)}
                        className="button"
                        disabled={!selectedDestination}
                    >
                        {tr("Confirm Request")}
                    </button>
                </div>
            </div>
        </div>
    );
}

interface PaymentsViewProps {
    mode?: 'live' | 'archive';
}

export function PaymentsView({ mode = 'archive' }: PaymentsViewProps) {
    const db = useDatabase();
    const inventory = useAtomValue(inventoryAtom);
    const expenses = useAtomValue(financeDataAtom);
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    const setPaymentsVersion = useSetAtom(paymentsVersionAtom);
    const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
    const [requestingGroup, setRequestingGroup] = useState<VendorGroup | null>(null);
    const [destinationFilter, setDestinationFilter] = useAtom(paymentDestinationFilterAtom);
    const [vendorFilter, setVendorFilter] = useAtom(paymentVendorFilterAtom);
    const search = useAtomValue(financeSearchTermAtom);
    const categoryFilter = useAtomValue(paymentCategoryFilterAtom);
    const user = useAtomValue(userAtom);
    const [selectedExpense, setSelectedExpense] = useState<FinanceRecord | null>(null);
    const overviewMode = useAtomValue(paymentsOverviewModeAtom);
    const isFilterBarVisible = useAtomValue(paymentFilterBarModeAtom) !== 'off';

    const itemsToRequest = useMemo<VendorGroup[]>(() => {
        const targetStatuses = ['acquired', 'acquisition', 'acquisitions', 'production'];
        const pendingItems = inventory.filter(i => {
            const status = (i.data.status || '').toLowerCase();
            const payReqStr = String(i.data.payReq || (i.data as any).pay_req || '').toLowerCase();
            const workbook = String(i.data.workbook || '').toLowerCase();

            // Skip 825 and Prepaid items
            if (workbook === '825' || workbook === 'v825' || payReqStr === 'prepaid') return false;

            return targetStatuses.includes(status) && !i.data.payReq && !(i.data as any).pay_req && i.data.payReq !== 'true' && (i.data as any).pay_req !== 'true';
        });

        const groups: Record<string, VendorGroup> = {};
        for (const item of pendingItems) {
            const data = item.data;
            const vendorIdStr = String(data.item_id || data.itemId || '');
            const vendorId = vendorIdStr.split('-')[0] || vendorIdStr;

            if (!groups[vendorId]) {
                groups[vendorId] = { vendorId, items: [], total: 0 };
            }
            const price = parseFloat(String(data.price_mxn || data.price || '0')) || 0;
            const qty = parseFloat(data.quantity || '1') || 1;
            groups[vendorId].items.push(item);
            groups[vendorId].total += (price * qty);
        }
        return Object.values(groups);
    }, [inventory]);

    const vendorTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        expenses
            .filter(e => e.status === 'Requested')
            .forEach(e => {
                const vendorId = getVendorIdFromDescription(e.description || '');
                if (vendorId) {
                    if (!totals[vendorId]) totals[vendorId] = 0;
                    totals[vendorId] += (e.amount || 0) + (e.commission || 0);
                }
            });
        return totals;
    }, [expenses]);

    const handleRequestAll = async (vendorGroup: VendorGroup, destination: PaymentDestination) => {
        const toastId = toast.loading(`Requesting payment for ${vendorGroup.vendorId}...`);
        try {
            const rawCommission = destinationsConfig[destination].calculateCommission(vendorGroup.total);
            const commission = Math.round(rawCommission);
            const amount = Math.round(vendorGroup.total);

            await apiCall('appendExpense', {
                expenseData: {
                    description: `Payment for ${vendorGroup.items.length} items from ${vendorGroup.vendorId}`,
                    amount,
                    commission,
                    destination,
                    status: 'Requested',
                    date: new Date().toISOString(),
                    inventoryItemRows: vendorGroup.items.map(i => i.row).join(','),
                }
            }, db);
            await apiCall('batchUpdateItems', {
                updates: vendorGroup.items.map(item => ({
                    row: item.row,
                    itemData: { payReq: new Date().toISOString() }
                }))
            }, db);
            toast.success(`Payment requested for ${vendorGroup.vendorId}.`, { id: toastId });
            setInventoryVersion(v => v + 1);
            setPaymentsVersion(v => v + 1);
        } catch (error: any) {
            toast.error(`Error: ${error.message}`, { id: toastId });
        }
    };

    const handleMarkAsPaid = async (expense: FinanceRecord) => {
        const toastId = toast.loading(tr("Marking as paid..."));
        try {
            await apiCall('updateExpense', {
                row: expense.id,
                expenseData: {
                    status: 'Paid',
                    pay_date: new Date().toISOString(),
                }
            }, db);
            toast.success(tr("Payment marked as paid."), { id: toastId });
            setInventoryVersion(v => v + 1);
            setPaymentsVersion(v => v + 1);
        } catch (error: any) {
            toast.error(`Error: ${error.message}`, { id: toastId });
        }
    };

    const sortedTimeline = useMemo(() => {
        return [...expenses]
            .filter(expense => {
                const destinationMatch = destinationFilter === 'All' || expense.destination === destinationFilter;
                const vendorMatch = vendorFilter === 'All' || getVendorIdFromDescription(expense.description || '') === vendorFilter;
                const categoryMatch = categoryFilter === 'All' || (expense.category || '').toUpperCase().includes(categoryFilter);
                const terms = search ? search.toLowerCase().split(/\s+/).filter(Boolean) : [];
                const searchMatch = terms.length === 0 || terms.every(t =>
                    (expense.description?.toLowerCase() || '').includes(t) ||
                    (expense.destination?.toLowerCase() || '').includes(t) ||
                    (expense.category?.toLowerCase() || '').includes(t)
                );
                return destinationMatch && vendorMatch && categoryMatch && searchMatch;
            })
            .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
    }, [expenses, destinationFilter, vendorFilter, search]);



    return (
        <div className="h-full flex flex-col gap-6">
            <AddExpenseModal isOpen={isAddExpenseModalOpen} onClose={() => setIsAddExpenseModalOpen(false)} />
            <RequestPaymentModal
                isOpen={!!requestingGroup}
                onClose={() => setRequestingGroup(null)}
                vendorGroup={requestingGroup}
                onConfirm={(destination) => {
                    if (requestingGroup) handleRequestAll(requestingGroup, destination);
                    setRequestingGroup(null);
                }}
            />

            {overviewMode !== 'collapsed' && itemsToRequest.length > 0 && (
                <div className="glass-panel p-4">
                    <div className={`flex flex-wrap gap-3 overflow-y-auto transition-all duration-300 ${overviewMode === 'minimal' ? 'max-h-32' : 'max-h-64'}`}>
                        {itemsToRequest.map(group => {
                            const vendorColor = vendors[group.vendorId as keyof typeof vendors]?.color || '#333';
                            const textColor = getTextColorForBg(vendorColor);
                            const buttonBg = textColor === '#FFFFFF' ? 'bg-white/20 hover:bg-white/40' : 'bg-black/10 hover:bg-black/20';

                            return (
                                <div key={group.vendorId} className="flex-1 min-w-[220px] p-3 rounded-lg" style={{ backgroundColor: vendorColor, color: textColor }}>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h3 className="font-bold" style={{ color: textColor }}>{appUsers[group.vendorId as keyof typeof appUsers]?.name || group.vendorId}</h3>
                                            <p className="text-sm opacity-80" style={{ color: textColor }}>{group.items.length} items</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold font-mono">{formatCurrency(group.total, 'MXN')}</p>
                                            <button onClick={() => setRequestingGroup(group)} className={`mt-1 text-xs py-1 px-3 rounded-lg border-none! min-h-0! ${buttonBg}`} style={{ color: textColor }}>{tr("Request Payment")}</button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            <div className="grow min-h-0! glass-panel">
                <div className="p-4 border-b border-(--border-color) flex justify-between items-center">
                    <h2 className="font-black text-[12px] uppercase tracking-[0.2em] text-(--text-color)">{tr("Payment Timeline")}</h2>
                    <button onClick={() => setIsAddExpenseModalOpen(true)} className="button min-h-0! text-[10px] font-black uppercase tracking-widest py-1.5 px-3 flex items-center gap-2" title={tr("Add General Expense")}>
                        <svg className="w-4 h-4"><use href="#file-plus"></use></svg> {tr("Add Expense")}
                    </button>
                </div>

                <div className="payments-timeline h-full min-h-0! px-4">
                    {sortedTimeline.map(expense => (
                        <div key={expense.id} className="timeline-item cursor-pointer hover:bg-(--text-color)/5 transition-colors rounded-xl p-2 -mx-2" onClick={() => setSelectedExpense(expense)}>
                            <div className="timeline-icon">
                                <img src={destinationsConfig[expense.destination as PaymentDestination]?.icon} alt={expense.destination} className="w-8 h-8 object-contain" />
                            </div>
                            <div className="timeline-content">
                                <div className="timeline-item-header">
                                    <h3 className="timeline-item-title">{expense.description}</h3>
                                    <time className="timeline-item-date">{new Date(expense.date || '').toLocaleDateString()}</time>
                                </div>
                                <p className="timeline-item-body">
                                    {formatCurrency(expense.amount || 0, 'MXN')}
                                    {(expense.commission || 0) > 0 && ` + ${formatCurrency(expense.commission || 0, 'MXN')} comm.`}
                                </p>
                                <div className="timeline-item-footer">
                                    {expense.status === 'Paid' ? (
                                        <>
                                            <span className="timeline-status-badge paid">Paid on {new Date(expense.pay_date!).toLocaleDateString()}</span>
                                            <span className="timeline-amount">{formatCurrency((expense.amount || 0) + (expense.commission || 0), 'MXN')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="timeline-status-badge pending">{tr("Pending")}</span>
                                            <div className="flex items-center gap-4">
                                                <span className="timeline-amount">{formatCurrency((expense.amount || 0) + (expense.commission || 0), 'MXN')}</span>
                                                <button onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(expense); }} className="button secondary min-h-0! text-xs py-1 px-3">{tr("Mark as Paid")}</button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {sortedTimeline.length === 0 && <p className="text-center text-sm p-8 text-(--text-color-secondary)">{tr("No payments found for the selected filters.")}</p>}
                </div>
            </div>

            {/* Right Slide Drawer Overlay for Selected Expense */}
            {selectedExpense && createPortal(
                <div className="fixed inset-0 z-100 bg-(--text-color)/50 backdrop-blur-sm animate-in fade-in duration-300" onClick={(e) => { e.stopPropagation(); setSelectedExpense(null); }}>
                    <div className="absolute top-0 right-0 bottom-0 w-full sm:w-[450px] z-101 flex flex-col shadow-2xl animate-in slide-in-from-right-8 duration-300 cursor-default"
                        style={{ background: 'color-mix(in srgb, var(--sidebar-bg) 95%, transparent)', backdropFilter: 'blur(40px)', borderLeft: '1px solid color-mix(in srgb, var(--text-color) 10%, transparent)' }}
                        onClick={e => e.stopPropagation()}>

                        <div className="absolute right-4 top-4 z-101 flex gap-2">
                            <button onClick={() => setSelectedExpense(null)} className="h-9 px-4 flex items-center justify-center gap-1.5 bg-(--text-color)/5 hover:bg-(--text-color)/10 border border-(--text-color)/10 rounded-xl text-(--text-color)/80 transition-all text-xs font-black uppercase tracking-widest">
                                <X className="w-3.5 h-3.5" /> {tr("Close")}
                            </button>
                        </div>

                        {/* Drawer Header */}
                        <div className="p-8 pt-16 flex flex-col items-center justify-center relative shrink-0 border-b border-(--text-color)/10 bg-(--text-color)/5">
                            <div className="w-24 h-24 rounded-2xl bg-(--text-color)/10 flex items-center justify-center mb-6 shadow-xl p-4">
                                <img src={destinationsConfig[selectedExpense.destination as PaymentDestination]?.icon} alt={selectedExpense.destination} className="w-full h-full object-contain drop-shadow-md" />
                            </div>
                            <h2 className="text-2xl font-black text-center text-(--text-color)">{selectedExpense.description}</h2>
                            <div className="mt-4 px-4 py-1.5 rounded-full border border-(--text-color)/20 text-xs font-bold uppercase tracking-widest text-(--text-color)">
                                {el(selectedExpense.status)}
                            </div>
                        </div>

                        {/* Drawer Content */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-6">
                            <div className="p-5 rounded-2xl border border-(--border-color)" style={{ background: 'color-mix(in srgb, var(--sidebar-bg) 70%, transparent)' }}>
                                <h4 className="text-xs font-black uppercase text-(--text-color-secondary) tracking-[0.2em] mb-4">{tr("Payment Breakdown")}</h4>
                                <div className="grid grid-cols-2 gap-y-4">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">{tr("Base Amount")}</span>
                                        <span className="text-[15px] font-bold text-(--text-color)">{formatCurrency(selectedExpense.amount || 0, 'MXN')}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">{tr("Commission")}</span>
                                        <span className="text-[15px] font-bold text-(--text-color)">{formatCurrency(selectedExpense.commission || 0, 'MXN')}</span>
                                    </div>
                                    <div className="flex flex-col col-span-2 pt-4 mt-2 border-t border-(--text-color)/10">
                                        <span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">{tr("Total Needed")}</span>
                                        <span className="text-xl font-black text-(--main-color) font-mono">{formatCurrency((selectedExpense.amount || 0) + (selectedExpense.commission || 0), 'MXN')}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 rounded-2xl border border-(--border-color)" style={{ background: 'color-mix(in srgb, var(--sidebar-bg) 70%, transparent)' }}>
                                <h4 className="text-xs font-black uppercase text-(--text-color-secondary) tracking-[0.2em] mb-4">{tr("Details")}</h4>
                                <div className="grid grid-cols-2 gap-y-4">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">{tr("Date Created")}</span>
                                        <span className="text-[14px] font-bold text-(--text-color)">{new Date(selectedExpense.date || '').toLocaleDateString()}</span>
                                    </div>
                                    {selectedExpense.pay_date && (
                                        <div className="flex flex-col">
                                            <span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">{tr("Pay Date")}</span>
                                            <span className="text-[14px] font-bold text-green-500">{new Date(selectedExpense.pay_date).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                    <div className="flex flex-col">
                                        <span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">{tr("Destination")}</span>
                                        <span className="text-[14px] font-bold text-(--text-color)">{selectedExpense.destination}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[11px] text-(--text-color-secondary) font-black uppercase tracking-widest mb-1">{tr("Category")}</span>
                                        <span className="text-[14px] font-bold text-(--text-color)">{el(selectedExpense.category)}</span>
                                    </div>
                                </div>
                            </div>

                            {selectedExpense.status !== 'Paid' && (
                                <div className="mt-auto pt-6 border-t border-(--text-color)/10">
                                    <button
                                        onClick={() => handleMarkAsPaid(selectedExpense)}
                                        className="w-full h-12 flex items-center justify-center gap-2 bg-(--main-color) hover:bg-(--main-color-hover) text-white rounded-xl font-black uppercase tracking-widest transition-all shadow-lg"
                                    >
                                        <CreditCard size={18} /> {tr("Mark as Paid")}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}