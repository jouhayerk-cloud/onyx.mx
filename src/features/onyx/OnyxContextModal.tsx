
import React from 'react';
import { ONYX_CONTEXT } from './onyxBusinessRules';
import { Database, Info, Tag, CreditCard, ShieldCheck, X } from 'lucide-react';

interface OnyxContextModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const OnyxContextModal: React.FC<OnyxContextModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-(--main-color)/10 to-transparent">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-(--main-color)/20 rounded-lg">
                            <ShieldCheck className="text-(--main-color)" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-wider">Onyx Intelligence Context</h2>
                            <p className="text-xs text-white/40 font-bold uppercase tracking-widest mt-1">Grounding & Logic Rules</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                        <X className="text-white/40" size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {/* Inventory Logic */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <Database className="text-(--main-color)" size={18} />
                            <h3 className="text-sm font-black text-white/90 uppercase tracking-widest">Inventory Logic</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Object.entries(ONYX_CONTEXT.tables.inventory.key_columns).map(([col, desc]) => (
                                <div key={col} className="p-4 bg-white/5 border border-white/5 rounded-xl">
                                    <code className="text-(--main-color) font-black text-xs uppercase block mb-2">{col}</code>
                                    <p className="text-xs text-white/60 leading-relaxed">{desc}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 p-4 bg-(--main-color)/5 border border-(--main-color)/10 rounded-xl">
                            <h4 className="text-[10px] font-black text-(--main-color) uppercase tracking-widest mb-2">Hard Rules</h4>
                            <ul className="space-y-2">
                                {ONYX_CONTEXT.tables.inventory.rules.map((rule, i) => (
                                    <li key={i} className="flex gap-3 text-xs text-white/70 italic">
                                        <span className="text-(--main-color)">•</span>
                                        {rule}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>

                    {/* Financials Logic */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <CreditCard className="text-pink-500" size={18} />
                            <h3 className="text-sm font-black text-white/90 uppercase tracking-widest">Financial Context</h3>
                        </div>
                        <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-4">
                            <p className="text-xs text-white/60 italic">
                                Onyx monitors the <code className="text-pink-400">expenses</code> table to correlate payments with physical inventory.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] font-black rounded border border-red-500/20">PARTIAL = RED</span>
                                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-[10px] font-black rounded border border-green-500/20">PAID = GREEN</span>
                                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-[10px] font-black rounded border border-blue-500/20">NEW = BLUE</span>
                            </div>
                        </div>
                    </section>

                    {/* Vendor Context */}
                    <section>
                        <div className="flex items-center gap-3 mb-4">
                            <Tag className="text-yellow-500" size={18} />
                            <h3 className="text-sm font-black text-white/90 uppercase tracking-widest">Vendor Mapping</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {Object.entries(ONYX_CONTEXT.vendor_mapping).map(([id, info]: [string, any]) => (
                                <div key={id} className="flex flex-col p-4 bg-white/5 rounded-xl border border-white/5 gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-white">{id}</span>
                                        <div 
                                            className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" 
                                            style={{ backgroundColor: info.color }} 
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-white/90 uppercase tracking-wider">{info.name}</span>
                                        <span className="text-[9px] text-white/40 font-bold italic mt-1 leading-tight">{info.bio}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 flex items-center justify-between bg-black">
                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em]">Active Model: GEMINI-1.5-PRO-ONYX-V1</p>
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-(--main-color) text-black text-xs font-black uppercase tracking-widest rounded-full hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(var(--main-color-rgb),0.3)]"
                    >
                        Sync Intelligence
                    </button>
                </div>
            </div>
        </div>
    );
};
