import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useSetAtom } from 'jotai/react';
import { PaymentDestination, ExpenseStatus } from '../../lib/Types';
import { SCRIPT_URL } from '../../lib/consts';
import { paymentsVersionAtom } from '../../lib/atoms';
import { destinationsConfig } from '../../lib/paymentConfig';

interface WorkbookPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    selectedItems: { id: string; price: number; description: string }[];
}

const formatCurrency = (amount: number, currency: 'USD' | 'MXN') => new Intl.NumberFormat(currency === 'MXN' ? 'es-MX' : 'en-US', { style: 'currency', currency }).format(amount || 0);
const DestinationCard: React.FC<{
    destination: PaymentDestination;
    config: typeof destinationsConfig[keyof typeof destinationsConfig];
    isSelected: boolean;
    onClick: () => void;
    baseAmount?: number;
}> = ({ destination, config, isSelected, onClick, baseAmount }) => {
    const commission = baseAmount ? config.calculateCommission(baseAmount) : null;
    const total = baseAmount && commission !== null ? baseAmount + commission : null;

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

export const WorkbookPaymentModal: React.FC<WorkbookPaymentModalProps> = ({ isOpen, onClose, onConfirm, selectedItems }) => {
    const setPaymentsVersion = useSetAtom(paymentsVersionAtom);
    const [selectedDestination, setSelectedDestination] = useState<PaymentDestination | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const totalAmount = selectedItems.reduce((sum, item) => sum + item.price, 0);

    const handleConfirm = async () => {
        if (!selectedDestination) return;
        setIsSaving(true);
        const toastId = toast.loading('Requesting payment...');

        try {
            const config = destinationsConfig[selectedDestination];
            const commission = config.calculateCommission(totalAmount);
            const finalTotal = totalAmount + commission;
            const inventoryItemRows = selectedItems.map(item => `WB:${item.id}`).join(',');
            const description = `Workbook Payment: ${selectedItems.length} items (${selectedItems[0].id}...)`;

            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'appendExpense',
                    expenseData: {
                        description,
                        amount: totalAmount,
                        commission,
                        totalAmount: finalTotal,
                        destination: selectedDestination,
                        status: ExpenseStatus.Requested,
                        date: new Date().toISOString(),
                        inventoryItemRows,
                    }
                }),
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);

            toast.success('Payment requested successfully', { id: toastId });
            setPaymentsVersion(v => v + 1); // Refresh dashboard to show new expense
            onConfirm();
            onClose();
        } catch (error: any) {
            toast.error(`Error: ${error.message}`, { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[#1e1e1e] border border-[#333] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-[#333]">
                    <h2 className="text-xl font-bold">Request Payment for {selectedItems.length} Items</h2>
                    <p className="text-sm text-gray-400 mt-1">Total: <span className="text-white font-mono font-bold">{formatCurrency(totalAmount, 'MXN')}</span></p>
                </div>

                <div className="p-6 overflow-y-auto">
                    <h3 className="text-lg font-bold mb-4">Select Payment Destination</h3>
                    <div className="grid grid-cols-2 gap-4">
                        {Object.entries(destinationsConfig).map(([key, config]) => (
                            <DestinationCard
                                key={key}
                                destination={key as PaymentDestination}
                                config={config}
                                isSelected={selectedDestination === key}
                                onClick={() => setSelectedDestination(key as PaymentDestination)}
                                baseAmount={totalAmount}
                            />
                        ))}
                    </div>

                    <div className="mt-6">
                        <h4 className="font-semibold mb-2 text-sm uppercase text-gray-400">Selected Items Preview</h4>
                        <div className="bg-black/20 rounded-lg p-2 max-h-32 overflow-y-auto text-sm font-mono">
                            {selectedItems.map((item, idx) => (
                                <div key={idx} className="flex justify-between py-1 border-b border-white/5 last:border-0">
                                    <span>{item.id}</span>
                                    <span>{formatCurrency(item.price, 'MXN')}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-[#333] flex justify-end gap-3 bg-[#252525]">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg hover:bg-white/5 transition-colors" disabled={isSaving}>Cancel</button>
                    <button
                        onClick={handleConfirm}
                        className="px-6 py-2 rounded-lg bg-[var(--main-color)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        disabled={!selectedDestination || isSaving}
                    >
                        {isSaving ? 'Processing...' : 'Confirm Request'}
                    </button>
                </div>
            </div>
        </div>
    );
};
