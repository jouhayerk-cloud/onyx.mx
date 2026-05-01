
import React, { useState, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { 
    selectedInventoryIdsAtom, 
    inventoryAtom,
    liveExchangeRateAtom,
    userAtom,
    isPaymentWizardOpenAtom
} from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { normalizeInventoryData, calculateCodesAndPrices } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import toast from 'react-hot-toast';
import { CreditCard, X, Check, ArrowRight, DollarSign, Wallet, Building2, Landmark, History } from 'lucide-react';
import { atom } from 'jotai';

export const PaymentWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isPaymentWizardOpenAtom);
    const selectedIds = useAtomValue(selectedInventoryIdsAtom);
    const allInventory = useAtomValue(inventoryAtom);
    const liveRate = useAtomValue(liveExchangeRateAtom);
    const user = useAtomValue(userAtom);
    const db = useDatabase();

    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        description: '',
        amount: 0,
        destination: 'Onyx MX' as any,
        notes: '',
        payment_method: 'Wire Transfer'
    });

    // Derived data
    const selectedItems = allInventory.filter(i => selectedIds.includes(String(i.row)));
    const totalAcqCost = selectedItems.reduce((acc, item) => {
        const d = normalizeInventoryData(item.data);
        const c = calculateCodesAndPrices(d, liveRate);
        return acc + (Number(c.bookAcquisition) || 0);
    }, 0);

    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setForm({
                description: `Payment Request for ${selectedItems.length} items`,
                amount: totalAcqCost,
                destination: 'Onyx MX',
                notes: '',
                payment_method: 'Wire Transfer'
            });
        }
    }, [isOpen, totalAcqCost, selectedItems.length]);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setSaving(true);
        const tid = toast.loading('Creating payment request...');
        try {
            const { error, data } = await supabase.from('finance').insert({
                amount: form.amount * liveRate, // Assuming amount is in USD, converting to MXN
                currency: 'MXN',
                status: 'Requested',
                date: new Date().toISOString(),
                description: form.description,
                notes: form.notes,
                destination: form.destination,
                payment_method: form.payment_method,
                related_ids: selectedIds,
                type: 'Expense',
                category: 'Vendor Payment',
                updated_at: new Date().toISOString()
            }).select();

            if (error) throw error;

            // Update inventory items to mark as requested
            await supabase.from('inventory').update({
                pay_req: 'requested',
                payment_ids: data[0].id.toString()
            }).in('id', selectedIds.map(Number));

            toast.success('Payment Request Created', { id: tid });
            setIsOpen(false);
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || 'Failed to create request', { id: tid });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={() => setIsOpen(false)} />
            
            <div className="relative w-full max-w-xl bg-[#0a0a0a] border border-white/10 rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-(--main-color) flex items-center justify-center text-black">
                            <CreditCard size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight text-white leading-tight">Pay Request</h2>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Financial Disbursement Wizard</p>
                        </div>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
                    {step === 1 && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="p-6 rounded-[32px] bg-white/5 border border-white/10">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 block mb-4">Summary</span>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-4xl font-mono font-black text-white">${totalAcqCost.toLocaleString()} <span className="text-xs text-white/40">USD</span></p>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-(--main-color) mt-2">≈ ${(totalAcqCost * liveRate).toLocaleString()} MXN</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-black text-white">{selectedItems.length}</p>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Items Linked</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 ml-2">Description</label>
                                    <input 
                                        type="text"
                                        value={form.description}
                                        onChange={e => setForm({...form, description: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/20 outline-none focus:border-(--main-color)/50 transition-all"
                                        placeholder="Enter description..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 ml-2">Account Destination</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['Onyx MX', 'Personal', 'Direct Vendor', 'Credit'].map(dest => (
                                            <button 
                                                key={dest}
                                                onClick={() => setForm({...form, destination: dest})}
                                                className={`p-4 rounded-2xl border transition-all text-left flex items-center gap-3 ${form.destination === dest ? 'bg-(--main-color) border-(--main-color) text-black' : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'}`}
                                            >
                                                <Building2 size={16} />
                                                <span className="text-[11px] font-black uppercase tracking-widest">{dest}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-8 border-t border-white/5 flex items-center justify-between bg-white/2">
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white transition-all"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleConfirm}
                        disabled={saving}
                        className="flex items-center gap-3 px-8 py-4 bg-(--main-color) text-black rounded-2xl font-black uppercase tracking-widest text-[11px] hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {saving ? 'Processing...' : 'Confirm Request'}
                        <ArrowRight size={16} strokeWidth={3} />
                    </button>
                </div>
            </div>
        </div>
    );
};
