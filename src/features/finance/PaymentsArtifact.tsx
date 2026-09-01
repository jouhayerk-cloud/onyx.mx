
import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue } from 'jotai/react';
import { 
    financeDataAtom, 
    paymentsArtifactConfigAtom, 
    exchangeRateAtom, 
    showFinancialsAtom,
    currencyModeAtom
} from '../../lib/atoms';
import { 
    X, Receipt, ChevronRight, DollarSign, Calendar, Landmark, Tag, Send, Smartphone, 
    Users, Box, Archive, Cpu 
} from 'lucide-react';
import { vendors } from '../../lib/consts';
import { tr } from '../../lib/i18n';

export const PaymentsArtifact: React.FC = () => {
    const [config, setConfig] = useAtom(paymentsArtifactConfigAtom);
    const allPayments = useAtomValue(financeDataAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const showFinancials = useAtomValue(showFinancialsAtom);
    const currencyMode = useAtomValue(currencyModeAtom);

    const filteredPayments = useMemo(() => {
        if (!config.isOpen) return [];
        
        return allPayments.filter(pay => {
            // 1. Bypass Logic: If specific IDs are provided, prioritize them
            if (config.paymentIds && config.paymentIds.length > 0) {
                return config.paymentIds.includes(String(pay.id));
            }
            if (config.itemIds && config.itemIds.length > 0) {
                const rawRelated = pay.related_inventory_ids || pay.related_ids || '';
                const related = Array.isArray(rawRelated) 
                    ? rawRelated.map(s => String(s).trim())
                    : String(rawRelated).split(',').map((s: string) => s.trim());
                return config.itemIds.some(id => related.includes(String(id)));
            }

            let match = true;
            
            // Filter by Vendor
            const vId = pay.vendor_id || pay.vendor;
            if (config.vendor && config.vendor !== 'All') {
                if (vId !== config.vendor) match = false;
            }
            
            // Filter by Date
            if (config.date) {
                if (!String(pay.date).includes(config.date)) match = false;
            }
            
            // Filter by Payment Type
            if (config.paymentType && config.paymentType !== 'All') {
                const sub = (pay.subcategory || '').toLowerCase();
                const cat = (pay.category || '').toLowerCase();
                const type = config.paymentType;
                
                let typeMatch = (sub === type.toLowerCase() || cat === type.toLowerCase());
                
                if (!typeMatch) {
                    if (type === 'MONTHLY') typeMatch = sub.includes('month') || sub.includes('mo-exp');
                    else if (type === 'SPPL') typeMatch = sub.includes('suppl') || sub.includes('sppl');
                    else if (type === 'LABR') typeMatch = sub.includes('labr') || sub.includes('labor');
                    else if (type === 'PACK') typeMatch = sub.includes('pack');
                    else if (type === 'ACQUISITION') typeMatch = cat.includes('acquisition') || sub.includes('acquisition') || sub.includes('merch') || cat.includes('vendor') || sub.includes('vendor');
                }
                
                if (!typeMatch) match = false;
            }

            // Filter by Destination
            if (config.destination && config.destination !== 'All') {
                if (pay.destination !== config.destination) match = false;
            }

            // Filter by Status
            if (config.status && config.status !== 'All') {
                if (pay.status !== config.status) match = false;
            }
            
            return match;
        });
    }, [allPayments, config]);

    if (!config.isOpen) return null;

    const onClose = () => setConfig(prev => ({ ...prev, isOpen: false }));

    const totals = filteredPayments.reduce((acc, pay) => {
        const amt = parseFloat(pay.total || pay.amount || 0);
        const isUSD = pay.currency === 'USD';
        if (isUSD) {
            acc.usd += amt;
            acc.mxn += amt * exchangeRate;
        } else {
            acc.mxn += amt;
            acc.usd += amt / exchangeRate;
        }
        return acc;
    }, { mxn: 0, usd: 0 });

    return createPortal(
        <div className="fixed inset-0 z-10000 flex items-center justify-center p-4 sm:p-6 md:p-12 animate-in fade-in duration-300">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={onClose} />
            
            {/* Artifact Container */}
            <div className="relative w-full max-w-4xl max-h-full flex flex-col rounded-3xl overflow-hidden shadow-2xl border border-white/20 bg-(--sidebar-bg)/90 backdrop-blur-xl animate-in zoom-in-95 duration-300">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-(--main-color)/10 text-(--main-color)">
                            <Receipt size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">
                                {config.title || 'Payments Artifact'}
                            </h2>
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
                                {filteredPayments.length} {filteredPayments.length === 1 ? 'Record' : 'Records'} {tr("Found")}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all shadow-lg border border-white/5"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                    {filteredPayments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-20">
                            <Receipt size={48} strokeWidth={1} />
                            <p className="text-xs font-black uppercase tracking-widest mt-4">{tr("No matching records")}</p>
                        </div>
                    ) : (
                        filteredPayments.map((pay, idx) => {
                            const isPaid = pay.status === 'Paid';
                            const accentColor = isPaid ? '#22c55e' : '#eab308';
                            
                            const netAmt = parseFloat(pay.amount || 0);
                            const feesAmt = parseFloat(pay.commission || 0);
                            const totalAmt = netAmt + feesAmt;
                            const isUSD = pay.currency === 'USD';

                            // 1. COMPACT DATE FORMATTING
                            const formatCompactDate = (dateStr: string) => {
                                if (!dateStr || dateStr === '---') return '---';
                                try {
                                    const d = new Date(dateStr);
                                    if (isNaN(d.getTime())) return dateStr;
                                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                } catch { return dateStr; }
                            };

                            // 2. DISPERSAL ICON & LABEL MAPPING
                            const getDispersalInfo = (dest: string) => {
                                const d = (dest || '').toLowerCase();
                                if (d.includes('martha') && d.includes('bbva')) return { icon: Landmark, label: 'Martha BBVA', color: '#4f2068' };
                                if (d.includes('ramses') && d.includes('bbva')) return { icon: Landmark, label: 'Ramses BBVA', color: '#737104' };
                                if (d.includes('boa') || d.includes('employee')) return { icon: Landmark, label: 'BoA Employee', color: '#0047AB' };
                                if (d.includes('wire')) return { icon: Send, label: 'Direct Wire', color: '#0ea5e9' };
                                if (d.includes('cash')) return { icon: DollarSign, label: 'Cash Payment', color: '#22c55e' };
                                return { icon: Smartphone, label: dest || 'Transfer', color: '#64748b' };
                            };

                            const dispersal = getDispersalInfo(pay.destination);

                            return (
                                <div 
                                    key={pay.id || idx} 
                                    className="flex items-stretch overflow-hidden bg-black/20 border border-white/5 rounded-2xl hover:border-white/20 transition-all group"
                                    style={{ borderColor: `color-mix(in srgb, ${accentColor} 20%, rgba(255,255,255,0.05))` }}
                                >
                                    {/* Status accent stripe */}
                                    <div className="w-1 shrink-0 self-stretch" style={{ backgroundColor: accentColor, opacity: 0.7 }} />
                                    
                                    {/* Record Info */}
                                    <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center px-4 py-3 gap-4 min-w-0">
                                        {/* Date & Vendor/Type Icon */}
                                        <div className="flex flex-col min-w-[90px]">
                                            <div className="flex items-center gap-1.5 text-[9px] text-white/30 uppercase font-black tracking-widest mb-2">
                                                <Calendar size={10} />
                                                {formatCompactDate(pay.date)}
                                            </div>
                                            {(() => {
                                                let vId = pay.vendor_id || pay.vendor || '';
                                                if (vId.includes('-')) vId = vId.split('-')[0];
                                                const sub = (pay.subcategory || '').toLowerCase();
                                                const cat = (pay.category || '').toLowerCase();
                                                const isAcq = cat.includes('acquisition') || sub.includes('acquisition') || sub.includes('merch') || cat.includes('vendor') || sub.includes('vendor');

                                                if (isAcq && vId) {
                                                    const vColor = (vendors as any)[vId]?.color || '#ccc';
                                                    return (
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-black text-[9px] font-black uppercase tracking-tighter shadow-sm w-fit" style={{ backgroundColor: vColor }}>
                                                                {vId || 'MISC'}
                                                            </span>
                                                            <div className="flex items-center gap-1 opacity-40">
                                                                <Tag size={8} />
                                                                <span className="text-[7px] font-black uppercase">{tr("Acquisition")}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                // Contextual Icon for Non-Merch (Operational)
                                                let Icon = Cpu;
                                                let bgColor = 'bg-sky-500/10 text-sky-400';
                                                let label = 'Operation';
                                                
                                                if (sub.includes('month') || cat === 'monthly') { Icon = Calendar; bgColor = 'bg-blue-500/10 text-blue-400'; label = 'Monthly'; }
                                                else if (sub.includes('suppl') || cat === 'sppl') { Icon = Box; bgColor = 'bg-emerald-500/10 text-emerald-400'; label = 'Supplies'; }
                                                else if (sub.includes('labr') || sub.includes('labor') || cat === 'labr') { Icon = Users; bgColor = 'bg-orange-500/10 text-orange-400'; label = 'Labor'; }
                                                else if (sub.includes('pack') || cat === 'pack') { Icon = Archive; bgColor = 'bg-purple-500/10 text-purple-400'; label = 'Packing'; }

                                                return (
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className={`p-1.5 rounded-lg w-fit ${bgColor} border border-current opacity-70`}>
                                                            <Icon size={12} />
                                                        </div>
                                                        <span className="text-[7px] font-black uppercase tracking-widest opacity-30">{label}</span>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Description */}
                                        <div className="flex flex-col justify-center flex-1 min-w-0">
                                            <h3 className="text-[11px] sm:text-[13px] font-bold text-white truncate uppercase tracking-tight group-hover:text-(--main-color) transition-colors">
                                                {pay.description || 'No Description'}
                                            </h3>
                                            <div className="flex items-center gap-4 mt-2">
                                                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/20">
                                                    <dispersal.icon size={10} style={{ color: dispersal.color }} className="opacity-60" />
                                                    <span style={{ color: dispersal.color }} className="opacity-60">{dispersal.label}</span>
                                                </div>
                                                {pay.category && (
                                                  <div className="flex items-center gap-1 text-[8px] text-white/10 uppercase tracking-widest font-black border-l border-white/5 pl-3">
                                                      {pay.category}
                                                  </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Financials */}
                                        <div className="flex items-center gap-4 sm:gap-6 shrink-0 ml-auto justify-end">
                                            <div className="flex flex-col items-end justify-center opacity-60">
                                                <span className={`text-[7px] font-black uppercase tracking-widest mb-1 leading-none ${isUSD ? 'text-emerald-400/60' : 'text-sky-400/60'}`}>
                                                    {tr("Net")} {isUSD ? 'USD' : 'MXN'}
                                                </span>
                                                <span className="text-[11px] font-bold font-mono text-white">
                                                    {showFinancials ? `$${netAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '***'}
                                                </span>
                                            </div>

                                            <div className="flex flex-col items-end justify-center opacity-60">
                                                <span className={`text-[7px] font-black uppercase tracking-widest mb-1 leading-none ${isUSD ? 'text-emerald-400/60' : 'text-sky-400/60'}`}>
                                                    {tr("Fees")} {isUSD ? 'USD' : 'MXN'}
                                                </span>
                                                <span className="text-[11px] font-bold font-mono text-red-400">
                                                    {showFinancials ? `$${feesAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '***'}
                                                </span>
                                            </div>

                                            <div className="flex flex-col items-end justify-center border-l border-white/10 pl-4 sm:pl-6 min-w-[70px]">
                                                <span className={`text-[8px] font-black uppercase tracking-[0.18em] mb-1 leading-none ${isUSD ? 'text-emerald-400/80' : 'text-sky-400/80'}`}>
                                                    {tr("Total")} {isUSD ? 'USD' : 'MXN'}
                                                </span>
                                                <span className={`text-[15px] font-black font-mono tracking-tight ${isUSD ? 'text-emerald-400' : 'text-sky-400'}`}>
                                                    {showFinancials ? `$${totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '***'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Action Icon */}
                                        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/5 text-white/20 group-hover:text-white/60 transition-colors">
                                            <ChevronRight size={18} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Bar */}
                <div className="px-6 py-4 bg-black/40 border-t border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] mb-1">{tr("Total MXN Summary")}</span>
                            <div className="flex items-baseline gap-2">
                                <span className={`text-xl font-mono font-black text-sky-400`}>
                                    {showFinancials ? `$${Math.ceil(totals.mxn).toLocaleString()}` : '***'}
                                </span>
                                <span className="text-[10px] font-black tracking-widest text-sky-400/40">MXN</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] mb-1">{tr("Total USD Summary")}</span>
                            <div className="flex items-baseline gap-2">
                                <span className={`text-xl font-mono font-black text-emerald-400`}>
                                    {showFinancials ? `$${totals.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '***'}
                                </span>
                                <span className="text-[10px] font-black tracking-widest text-emerald-400/40">USD</span>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl bg-(--main-color) text-black font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-(--main-color)/20 hover:scale-105 active:scale-95 transition-all"
                    >
                        {tr("Dismiss")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
