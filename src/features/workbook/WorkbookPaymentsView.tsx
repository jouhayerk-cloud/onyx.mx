import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { PaymentDestination, ExpenseStatus, Expense } from '../../lib/Types';
import { SCRIPT_URL, vendors, appUsers } from '../../lib/consts';
import { paymentsVersionAtom, userAtom, paymentDestinationFilterAtom } from '../../lib/atoms';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { destinationsConfig } from '../../lib/paymentConfig';
import { getTextColorForBg } from '../../lib/utils';
import { tr } from '../../lib/i18n';

const formatCurrency = (amount: number, currency: 'USD' | 'MXN') => new Intl.NumberFormat(currency === 'MXN' ? 'es-MX' : 'en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
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

export function WorkbookPaymentsView() {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [paymentsVersion, setPaymentsVersion] = useAtom(paymentsVersionAtom);
    const [isLoading, setIsLoading] = useState(true);
    const [destinationFilter, setDestinationFilter] = useAtom(paymentDestinationFilterAtom);
    const user = useAtomValue(userAtom);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const expRes = await apiCall('getExpenses', { user });
            setExpenses(expRes.data);
        } catch (error: any) {
            toast.error(`Failed to load expenses: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [paymentsVersion, fetchData]);
    const workbookExpenses = useMemo(() => {
        return expenses.filter(expense => {
            const itemRows = expense.inventoryItemRows || '';
            return itemRows.includes('WB:');
        });
    }, [expenses]);

    const handleMarkAsPaid = async (expense: Expense) => {
        const toastId = toast.loading(tr("Marking as paid..."));
        try {
            await apiCall('updateExpense', {
                row: expense.row,
                expenseData: {
                    status: ExpenseStatus.Paid,
                    paymentDate: new Date().toISOString(),
                }
            });
            toast.success(tr("Payment marked as paid."), { id: toastId });
            setPaymentsVersion(v => v + 1);
        } catch (error: any) {
            toast.error(`Error: ${error.message}`, { id: toastId });
        }
    };

    const sortedTimeline = useMemo(() => {
        return [...workbookExpenses]
            .filter(expense => destinationFilter === 'All' || expense.destination === destinationFilter)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [workbookExpenses, destinationFilter]);

    if (isLoading) {
        return <div className="h-full flex items-center justify-center"><LoadingIndicator /></div>;
    }

    return (
        <div className="h-full flex flex-col gap-6">
            <div className="flex-grow min-h-0 glass-panel">
                <div className="p-4 border-b border-[var(--border-color)]">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold">{tr("Workbook Payments")}</h2>
                        <div className="flex items-center gap-2 overflow-x-auto">
                            <button
                                onClick={() => setDestinationFilter('All')}
                                className={`button secondary !min-h-0 text-xs py-1 px-3 flex-shrink-0 ${destinationFilter === 'All' ? '!bg-[var(--main-color)] !text-white' : ''}`}
                            >
                                {tr("All")}
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
                    </div>
                </div>

                <div className="payments-timeline h-full">
                    {sortedTimeline.map(expense => {
                        const vendorId = expense.vendorId;
                        const vendorColor = vendorId && vendors[vendorId as keyof typeof vendors]?.color;
                        const textColor = vendorColor ? getTextColorForBg(vendorColor) : undefined;
                        const vendorName = vendorId && appUsers[vendorId as keyof typeof appUsers]?.name;

                        return (
                            <div key={expense.id} className="timeline-item">
                                <div className="timeline-icon">
                                    <img src={destinationsConfig[expense.destination]?.icon} alt={expense.destination} className="w-8 h-8 object-contain" />
                                </div>
                                <div className="timeline-content">
                                    <div className="timeline-item-header">
                                        <div className="flex items-center gap-2">
                                            <h3 className="timeline-item-title">{expense.description}</h3>
                                            {vendorName && vendorColor && (
                                                <span
                                                    className="px-2 py-0.5 rounded text-xs font-bold"
                                                    style={{ backgroundColor: vendorColor, color: textColor }}
                                                >
                                                    {vendorName}
                                                </span>
                                            )}
                                        </div>
                                        <time className="timeline-item-date">{new Date(expense.date).toLocaleDateString()}</time>
                                    </div>
                                    <p className="timeline-item-body">
                                        {formatCurrency(expense.amount, 'MXN')}
                                        {expense.commission && expense.commission > 0 && ` + ${formatCurrency(expense.commission, 'MXN')} comm.`}
                                    </p>
                                    <div className="timeline-item-footer">
                                        {expense.status === ExpenseStatus.Paid ? (
                                            <>
                                                <span className="timeline-status-badge paid">Paid on {new Date(expense.paymentDate!).toLocaleDateString()}</span>
                                                <span className="timeline-amount">{formatCurrency(expense.totalAmount, 'MXN')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="timeline-status-badge pending">{tr("Pending")}</span>
                                                <div className="flex items-center gap-4">
                                                    <span className="timeline-amount">{formatCurrency(expense.totalAmount, 'MXN')}</span>
                                                    <button onClick={() => handleMarkAsPaid(expense)} className="button secondary !min-h-0 text-xs py-1 px-3">{tr("Mark as Paid")}</button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {sortedTimeline.length === 0 && <p className="text-center text-sm p-8 text-[var(--text-color-secondary)]">{tr("No workbook payments found for the selected filters.")}</p>}
                </div>
            </div>
        </div>
    );
}
