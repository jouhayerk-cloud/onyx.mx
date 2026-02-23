import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { PaymentDestination, ExpenseStatus, Expense, InventoryItem } from '../../lib/Types';
import { SCRIPT_URL, vendors, appUsers } from '../../lib/consts';
import { paymentsVersionAtom, userAtom, inventoryAtom, InventoryVersionAtom, paymentDestinationFilterAtom } from '../../lib/atoms';
import { LoadingIndicator } from '../../components/LoadingIndicator';


type VendorGroup = {
    vendorId: string;
    items: InventoryItem[];
    total: number;
};

// --- Config ---
import { destinationsConfig } from '../../lib/paymentConfig';



// --- Helper Functions ---
const formatCurrency = (amount: number, currency: 'USD' | 'MXN') => new Intl.NumberFormat(currency === 'MXN' ? 'es-MX' : 'en-US', { style: 'currency', currency }).format(amount || 0);

const getTextColorForBg = (hexColor: string | undefined): string => {
    if (!hexColor) return '#000000';
    try {
        const rgb = parseInt(hexColor.substring(1), 16);
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = (rgb >> 0) & 0xff;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return luma < 128 ? '#FFFFFF' : '#000000';
    } catch {
        return '#000000';
    }
}

const getVendorIdFromDescription = (description: string): string | null => {
    const match = description.match(/from (\w+)$/);
    return match ? match[1] : null;
};


// --- API Call Abstraction ---
const apiCall = async (action: string, payload: object) => {
    const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json();
    if (result.status !== 'success') throw new Error(result.message);
    return result;
};

// --- DestinationCard Component ---
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
                className={`p-2 rounded-lg border-2 flex-1 flex flex-col items-center justify-start gap-1 cursor-pointer transition-all ${isSelected ? 'border-[var(--main-color)] bg-blue-900/20' : 'border-transparent hover:bg-white/10'}`}
                onClick={onClick}
            >
                <img src={config.icon} alt={config.name} className="w-full h-10 object-contain" />
                <p className="text-[10px] text-center font-semibold mt-1 leading-tight">{config.name}</p>
            </div>
        )
    }

    return (
        <div
            className={`p-4 rounded-lg border-2 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${isSelected ? 'border-[var(--main-color)] bg-blue-900/20' : 'border-transparent hover:bg-white/10'}`}
            onClick={onClick}
        >
            <img src={config.icon} alt={config.name} className="w-24 h-16 object-contain" />
            <p className="font-semibold text-sm">{config.name}</p>
            {baseAmount !== undefined && (
                <div className="text-xs text-center mt-2">
                    {commission !== null && <p className="text-[var(--text-color-secondary)]">Comm: {formatCurrency(commission, 'MXN')}</p>}
                    {total !== null && <p className="font-bold">Total: {formatCurrency(total, 'MXN')}</p>}
                </div>
            )}
        </div>
    );
};


// --- Modals ---
const AddExpenseModal: React.FC<{ isOpen: boolean, onClose: () => void }> = ({ isOpen, onClose }) => {
    const setPaymentsVersion = useSetAtom(paymentsVersionAtom);
    const [isSaving, setIsSaving] = useState(false);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [destination, setDestination] = useState<PaymentDestination | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const numericAmount = parseFloat(amount);
        if (!description || isNaN(numericAmount) || numericAmount <= 0 || !destination) {
            return toast.error("Please provide a valid description, amount, and destination.");
        }

        setIsSaving(true);
        const toastId = toast.loading('Adding general expense...');
        try {
            const commission = destinationsConfig[destination].calculateCommission(numericAmount);
            await apiCall('appendExpense', {
                expenseData: {
                    description,
                    amount: numericAmount,
                    commission,
                    totalAmount: numericAmount + commission,
                    destination,
                    status: ExpenseStatus.Requested,
                    date: new Date().toISOString(),
                }
            });
            toast.success('General expense added!', { id: toastId });
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
                    <h2 className="modal-header">Add General Expense</h2>
                    <div className="modal-body">
                        <input type="text" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} required />
                        <input type="number" placeholder="Amount (MXN)" value={amount} onChange={e => setAmount(e.target.value)} required step="0.01" />
                        <h3 className="text-lg font-bold mt-4 mb-2">Select Payment Destination</h3>
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
                        <button type="button" onClick={onClose} className="button secondary" disabled={isSaving}>Cancel</button>
                        <button type="submit" className="button" disabled={isSaving || !destination}>{isSaving ? 'Saving...' : 'Add Expense'}</button>
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
                    <p>Total for {vendorGroup.items.length} items: <strong>{formatCurrency(vendorGroup.total, 'MXN')}</strong></p>
                    <h3 className="text-lg font-bold mt-4 mb-2">Select Payment Destination</h3>
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
                    <button onClick={onClose} className="button secondary">Cancel</button>
                    <button
                        onClick={() => selectedDestination && onConfirm(selectedDestination)}
                        className="button"
                        disabled={!selectedDestination}
                    >
                        Confirm Request
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Main View Component ---
export function PaymentsView() {
    const [inventory, setInventory] = useAtom(inventoryAtom);
    const [inventoryVersion, setInventoryVersion] = useAtom(InventoryVersionAtom);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [paymentsVersion, setPaymentsVersion] = useAtom(paymentsVersionAtom);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
    const [requestingGroup, setRequestingGroup] = useState<VendorGroup | null>(null);
    const [destinationFilter, setDestinationFilter] = useAtom(paymentDestinationFilterAtom);
    const [vendorFilter, setVendorFilter] = useState<string | 'All'>('All');
    const user = useAtomValue(userAtom);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [invRes, expRes] = await Promise.all([
                apiCall('getInventory', { user }),
                apiCall('getExpenses', { user }),
            ]);
            setInventory(invRes.data);
            setExpenses(expRes.data);
        } catch (error: any) {
            toast.error(`Failed to load data: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [setInventory, user]);

    useEffect(() => {
        fetchData();
    }, [inventoryVersion, paymentsVersion, fetchData]);

    const itemsToRequest = useMemo<VendorGroup[]>(() => {
        const approvedItems = inventory.filter(i => i.data.status === 'YES' && !i.data.payReq);
        const groups: Record<string, VendorGroup> = {};
        for (const item of approvedItems) {
            const vendorId = item.data.itemId;
            if (!groups[vendorId]) {
                groups[vendorId] = { vendorId, items: [], total: 0 };
            }
            groups[vendorId].items.push(item);
            groups[vendorId].total += parseFloat(item.data.price) || 0;
        }
        return Object.values(groups);
    }, [inventory]);

    const vendorTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        expenses
            .filter(e => e.status === ExpenseStatus.Requested)
            .forEach(e => {
                const vendorId = getVendorIdFromDescription(e.description);
                if (vendorId) {
                    if (!totals[vendorId]) totals[vendorId] = 0;
                    totals[vendorId] += e.totalAmount;
                }
            });
        return totals;
    }, [expenses]);

    const handleRequestAll = async (vendorGroup: VendorGroup, destination: PaymentDestination) => {
        const toastId = toast.loading(`Requesting payment for ${vendorGroup.vendorId}...`);
        try {
            const commission = destinationsConfig[destination].calculateCommission(vendorGroup.total);
            const totalAmount = vendorGroup.total + commission;

            await apiCall('appendExpense', {
                expenseData: {
                    description: `Payment for ${vendorGroup.items.length} items from ${vendorGroup.vendorId}`,
                    amount: vendorGroup.total,
                    commission,
                    totalAmount,
                    destination,
                    status: ExpenseStatus.Requested,
                    date: new Date().toISOString(),
                    inventoryItemRows: vendorGroup.items.map(i => i.row).join(','),
                }
            });
            await apiCall('batchUpdateItems', {
                updates: vendorGroup.items.map(item => ({
                    row: item.row,
                    itemData: { payReq: new Date().toISOString() }
                }))
            });
            toast.success(`Payment requested for ${vendorGroup.vendorId}.`, { id: toastId });
            setInventoryVersion(v => v + 1);
            setPaymentsVersion(v => v + 1);
        } catch (error: any) {
            toast.error(`Error: ${error.message}`, { id: toastId });
        }
    };

    const handleMarkAsPaid = async (expense: Expense) => {
        const toastId = toast.loading(`Marking as paid...`);
        try {
            await apiCall('updateExpense', {
                row: expense.row,
                expenseData: {
                    status: ExpenseStatus.Paid,
                    paymentDate: new Date().toISOString(),
                }
            });
            toast.success('Payment marked as paid.', { id: toastId });
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
                const vendorMatch = vendorFilter === 'All' || getVendorIdFromDescription(expense.description) === vendorFilter;
                return destinationMatch && vendorMatch;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [expenses, destinationFilter, vendorFilter]);


    if (isLoading) {
        return <div className="h-full flex items-center justify-center"><LoadingIndicator /></div>;
    }

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

            {itemsToRequest.length > 0 && (
                <div className="glass-panel p-4">
                    <div className="space-y-4 max-h-64 overflow-y-auto">
                        {itemsToRequest.map(group => {
                            const vendorColor = vendors[group.vendorId as keyof typeof vendors]?.color || '#333';
                            const textColor = getTextColorForBg(vendorColor);
                            const buttonBg = textColor === '#FFFFFF' ? 'bg-white/20 hover:bg-white/40' : 'bg-black/10 hover:bg-black/20';

                            return (
                                <div key={group.vendorId} className="p-3 rounded-lg" style={{ backgroundColor: vendorColor, color: textColor }}>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h3 className="font-bold" style={{ color: textColor }}>{appUsers[group.vendorId as keyof typeof appUsers]?.name || group.vendorId}</h3>
                                            <p className="text-sm opacity-80" style={{ color: textColor }}>{group.items.length} items</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold font-mono">{formatCurrency(group.total, 'MXN')}</p>
                                            <button onClick={() => setRequestingGroup(group)} className={`button text-xs !py-1 !px-3 !min-h-0 mt-1 !border-none ${buttonBg}`} style={{ color: textColor }}>Request Payment</button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            <div className="flex-grow min-h-0 glass-panel">
                <div className="p-4 border-b border-[var(--border-color)]">
                    {Object.keys(vendorTotals).length > 0 && (
                        <div className="mb-4">
                            <h3 className="text-xs font-bold uppercase text-[var(--text-color-secondary)] mb-2">Pending Vendor Payments</h3>
                            <div className="flex items-center gap-2 overflow-x-auto">
                                <button
                                    onClick={() => setVendorFilter('All')}
                                    className={`tab-button ${vendorFilter === 'All' ? 'active' : ''}`}
                                >All</button>
                                {Object.entries(vendorTotals).map(([vendorId, total]) => (
                                    <button
                                        key={vendorId}
                                        onClick={() => setVendorFilter(vendorId)}
                                        className={`tab-button vendor-tab ${vendorFilter === vendorId ? 'active' : ''}`}
                                        style={vendorFilter === vendorId ? { backgroundColor: vendors[vendorId as keyof typeof vendors]?.color, color: getTextColorForBg(vendors[vendorId as keyof typeof vendors]?.color) } : {}}
                                    >
                                        {/* FIX: Explicitly cast `total` to a number to resolve TypeScript error. */}
                                        {vendorId} <span className="count">{formatCurrency(total as number, 'MXN')}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 overflow-x-auto">
                            <button
                                onClick={() => setDestinationFilter('All')}
                                className={`button secondary !min-h-0 text-xs py-1 px-3 flex-shrink-0 ${destinationFilter === 'All' ? '!bg-[var(--main-color)] !text-white' : ''}`}
                            >
                                All
                            </button>
                            {Object.entries(destinationsConfig).map(([key, config]) => (
                                <button
                                    key={key}
                                    onClick={() => setDestinationFilter(key as PaymentDestination)}
                                    className={`button !p-2 !min-h-0 flex-shrink-0 ${destinationFilter === key ? 'ring-2 ring-offset-2 ring-offset-black/50 ring-[var(--main-color)]' : ''}`}
                                    title={config.name}
                                >
                                    <img src={config.icon} alt={config.name} className="w-auto h-6 object-contain" />
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setIsAddExpenseModalOpen(true)} className="button !p-2.5 !min-h-0" title="Add General Expense">
                            <svg className="w-5 h-5"><use href="#file-plus"></use></svg>
                        </button>
                    </div>
                </div>

                <div className="payments-timeline h-full">
                    {sortedTimeline.map(expense => (
                        <div key={expense.id} className="timeline-item">
                            <div className="timeline-icon">
                                <img src={destinationsConfig[expense.destination]?.icon} alt={expense.destination} className="w-8 h-8 object-contain" />
                            </div>
                            <div className="timeline-content">
                                <div className="timeline-item-header">
                                    <h3 className="timeline-item-title">{expense.description}</h3>
                                    <time className="timeline-item-date">{new Date(expense.date).toLocaleDateString()}</time>
                                </div>
                                <p className="timeline-item-body">
                                    {formatCurrency(expense.amount, 'MXN')}
                                    {expense.commission > 0 && ` + ${formatCurrency(expense.commission, 'MXN')} comm.`}
                                </p>
                                <div className="timeline-item-footer">
                                    {expense.status === ExpenseStatus.Paid ? (
                                        <>
                                            <span className="timeline-status-badge paid">Paid on {new Date(expense.paymentDate!).toLocaleDateString()}</span>
                                            <span className="timeline-amount">{formatCurrency(expense.totalAmount, 'MXN')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="timeline-status-badge pending">Pending</span>
                                            <div className="flex items-center gap-4">
                                                <span className="timeline-amount">{formatCurrency(expense.totalAmount, 'MXN')}</span>
                                                <button onClick={() => handleMarkAsPaid(expense)} className="button secondary !min-h-0 text-xs py-1 px-3">Mark as Paid</button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {sortedTimeline.length === 0 && <p className="text-center text-sm p-8 text-[var(--text-color-secondary)]">No payments found for the selected filters.</p>}
                </div>
            </div>
        </div>
    );
}