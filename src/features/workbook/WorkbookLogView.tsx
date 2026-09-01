import React, { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { workbookLogDataAtom, workbookVersionAtom } from '../../lib/atoms';
import { vendors as vendorConfigs } from '../../lib/consts';
import { boaCardIcon, bbvaRamsesIcon, bbvaMarthaIcon } from '../dashboard/paymentsIcons.svg.tsx';
import { tr } from '../../lib/i18n';

const CollapsibleSection = ({ title, icon, color, expanded, onToggle, children, badge }: { title: string, icon: string, color: string, expanded: boolean, onToggle: () => void, children: React.ReactNode, badge?: string | number }) => (
    <div className="flex flex-col gap-4">
        <button
            onClick={onToggle}
            className="flex justify-between items-center group w-full text-left"
        >
            <div className="flex items-center gap-3">
                <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }}></div>
                <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-bold group-hover:text-white transition-colors flex items-center gap-3">
                    {title}
                    {badge !== undefined && (
                        <span className="text-[10px] text-white/20 font-mono font-normal">[{badge}]</span>
                    )}
                </h2>
            </div>
            <div className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
                <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </button>
        {expanded && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                {children}
            </div>
        )}
    </div>
);

export const WorkbookLogView: React.FC = () => {
    const data = useAtomValue(workbookLogDataAtom);
    const version = useAtomValue(workbookVersionAtom);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        vendors: true,
        expenses: true,
        accounts: true
    });

    const toggleSection = (id: string) => {
        setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const logInfo = useMemo(() => {
        if (!data || data.length === 0) return null;

        if (version === '326') {
            const bookNum = data[0]?.[0] || '---';
            const ver = data[0]?.[1] || '---';
            const exchangeRate = data[1]?.[1] || 18.0;

            const vendorsRaw = [];
            const accounts = [];
            const tracking = [];
            for (let i = 1; i <= 4; i++) {
                const trk = data[i]?.[5];
                if (trk) tracking.push(String(trk));
            }
            for (let i = 3; i < data.length; i++) {
                const vendorLine = data[i]?.[0];
                const acq = data[i]?.[1];
                if (vendorLine && acq !== undefined && String(vendorLine).trim() !== '' && vendorLine !== 'VENDOR') {
                    const match = String(vendorLine).match(/^([A-Z]+)\s*\((.*)\)/);
                    const code = match ? match[1] : String(vendorLine).substring(0, 2);
                    const name = match ? match[2] : String(vendorLine);
                    vendorsRaw.push({ code, name, acq: acq === '-' ? 0 : Number(acq) });
                }
            }
            const expenseGroups = [
                { id: 'boa', name: 'BOA', color: '#0070c0', icon: 'boa', items: [] as any[], total: Number(data[9]?.[4] || 0) },
                { id: 'bbva_ramses', name: 'BBVA RAMSES', color: '#ffda65', icon: 'ramses', items: [] as any[], total: Number(data[10]?.[4] || 0) },
                { id: 'bbva_martha', name: 'BBVA MARTHA', color: '#c5eff7', icon: 'martha', items: [] as any[], total: Number(data[11]?.[4] || 0) }
            ];
            for (let i = 1; i <= 2; i++) {
                if (data[i]?.[3]) expenseGroups[0].items.push({ name: String(data[i][3]), amount: Number(data[i][4] || 0) });
            }
            for (let i = 3; i <= 7; i++) {
                if (data[i]?.[3]) expenseGroups[1].items.push({ name: String(data[i][3]), amount: Number(data[i][4] || 0) });
            }
            for (let i = 8; i <= 8; i++) {
                if (data[i]?.[3]) expenseGroups[2].items.push({ name: String(data[i][3]), amount: Number(data[i][4] || 0) });
            }
            expenseGroups.forEach(group => {
                accounts.push({ name: group.name, amount: group.total, icon: group.icon, color: group.color });
            });

            const monthlyTotal = data[12]?.[4] || 0;

            return { bookNum, version: ver, monthlyTotal, exchangeRate, expenseGroups, accounts, tracking, vendors: vendorsRaw };
        } else {
            const bookNum = data[0]?.[0] || '---';
            const ver = data[0]?.[1] || '---';
            const monthlyTotal = data[0]?.[4] || 0;
            const exchangeRate = data[10]?.[3] || 18.0;

            const expenses = [];
            for (let i = 1; i <= 9; i++) {
                const name = data[i]?.[2];
                const amount = data[i]?.[3];
                if (name && amount !== undefined) {
                    expenses.push({ name: String(name), amount: Number(amount) });
                }
            }

            const accounts = [];
            for (let i = 9; i <= 12; i++) {
                const name = data[i]?.[4];
                const amount = data[i]?.[5];
                if (name && amount !== undefined) {
                    accounts.push({ name: String(name), amount: Number(amount) });
                }
            }

            const tracking = [];
            for (let i = 1; i <= 4; i++) {
                const trk = data[i]?.[4];
                if (trk) tracking.push(String(trk));
            }

            const vendorsRaw = [];
            for (let i = 14; i < data.length; i++) {
                const vendorLine = data[i]?.[0];
                const acq = data[i]?.[1];
                if (vendorLine && acq !== undefined) {
                    const match = String(vendorLine).match(/^([A-Z]+)\s*\((.*)\)/);
                    const code = match ? match[1] : String(vendorLine).substring(0, 2);
                    const name = match ? match[2] : String(vendorLine);
                    vendorsRaw.push({ code, name, acq: Number(acq) });
                }
            }

            return { bookNum, version: ver, monthlyTotal, exchangeRate, expenses, accounts, tracking, vendors: vendorsRaw };
        }
    }, [data, version]);

    if (!logInfo) {
        return (
            <div className="flex items-center justify-center h-full text-[var(--text-color-secondary)]">
                {tr("No Log data found in -Log sheet.")}
            </div>
        );
    }

    const fmt = (val: number) => val.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 });

    return (
        <div className="p-6 flex flex-col gap-10 h-full overflow-y-auto custom-scrollbar relative z-10">
            {/* Header section */}
            <div className="flex justify-between items-end border-b border-white/10 pb-6">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-1">{tr("Workbook Analysis")}</span>
                    <h1 className="text-6xl font-black text-white leading-tight font-display italic tracking-tighter">
                        {logInfo.bookNum} <span className="text-2xl font-normal not-italic text-white/20 ml-3">[{logInfo.version}]</span>
                    </h1>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] uppercase tracking-wider text-white/30">{tr("Global Rate")}</span>
                            <span className="text-2xl font-mono text-[#00b0f0] font-bold">{tr("1 USD =")} {logInfo.exchangeRate} MXN</span>
                        </div>
                        <div className="h-10 w-[1px] bg-white/10 ml-2"></div>
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] uppercase tracking-wider text-white/30">{tr("Active Tracking")}</span>
                            <div className="flex gap-2 mt-1">
                                {logInfo.tracking.map((trk, i) => (
                                    <span key={i} className="px-3 py-1 rounded-md text-[10px] font-bold bg-white/5 text-white border border-white/10 shadow-glow shadow-white/5">
                                        {trk}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-10">
                {/* Left side: Vendors Grid */}
                <div className="col-span-12 xl:col-span-7">
                    <CollapsibleSection
                        title={tr("Vendor Acquisitions")}
                        color="#a9d08e"
                        expanded={expandedSections.vendors}
                        onToggle={() => toggleSection('vendors')}
                        badge={logInfo.vendors.length}
                        icon="#vendor"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                            {logInfo.vendors.map((v, i) => {
                                const config = vendorConfigs[v.code as keyof typeof vendorConfigs];
                                const color = config?.color || '#333';
                                return (
                                    <div key={i} className="glass-panel p-4 rounded-xl border border-white/5 flex flex-col gap-3 hover:border-white/20 hover:bg-white/[0.02] transition-all cursor-default group">
                                        <div className="flex justify-between items-start">
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black text-black shadow-lg" style={{ backgroundColor: color }}>
                                                {v.code}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold">{tr("Balance")}</div>
                                                <div className="text-sm font-mono font-bold text-white group-hover:text-[var(--main-color)] transition-colors">{fmt(v.acq)}</div>
                                            </div>
                                        </div>
                                        <div className="mt-1">
                                            <div className="text-xs font-bold text-white/60 truncate group-hover:text-white transition-colors">{v.name}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CollapsibleSection>
                </div>

                {/* Right side: Expenses & Accounts */}
                <div className="col-span-12 xl:col-span-5 flex flex-col gap-10">
                    {/* Monthly Expenses */}
                    <CollapsibleSection
                        title={tr("Monthly Expenses")}
                        color="#76933c"
                        expanded={expandedSections.expenses}
                        onToggle={() => toggleSection('expenses')}
                        badge={logInfo.expenseGroups?.reduce((acc: number, g: any) => acc + g.items.length, 0) || 0}
                        icon="#expenses"
                    >
                        <div className="flex flex-col gap-4 pt-2">
                            {logInfo.expenseGroups?.map((group: any, i: number) => (
                                <div key={i} className="flex flex-col gap-2">
                                    <div className="flex items-center gap-3 px-1">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: group.color }}></div>
                                        <span className="text-[10px] uppercase tracking-widest font-bold opacity-40">{group.name}</span>
                                    </div>
                                    <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
                                        {group.items.map((exp: any, j: number) => (
                                            <div key={j} className="flex justify-between items-center p-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase tracking-wide text-white/40 group-hover:text-white/80 transition-colors">{exp.name}</span>
                                                </div>
                                                <span className="text-xs font-mono font-bold text-white">{fmt(exp.amount)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            <div className="flex justify-between items-center p-4 rounded-xl bg-[#76933c]/5 border border-[#76933c]/20 mt-2">
                                <span className="text-[10px] uppercase tracking-widest text-[#76933c] font-bold">{tr("Consolidated Forecast")}</span>
                                <span className="text-2xl font-mono font-bold text-[#76933c]">{fmt(logInfo.monthlyTotal)}</span>
                            </div>
                        </div>
                    </CollapsibleSection>

                    {/* Bank Accounts */}
                    <CollapsibleSection
                        title={tr("Capital Accounts")}
                        color="#00b0f0"
                        expanded={expandedSections.accounts}
                        onToggle={() => toggleSection('accounts')}
                        badge={logInfo.accounts.length}
                        icon="#wallet"
                    >
                        <div className="grid grid-cols-1 gap-3 pt-2">
                            {logInfo.accounts.map((acc: any, i: number) => {
                                const icon = acc.icon === 'boa' ? boaCardIcon : acc.icon === 'ramses' ? bbvaRamsesIcon : bbvaMarthaIcon;
                                return (
                                    <div key={i} className="glass-panel p-4 rounded-xl border border-white/5 flex items-center justify-between hover:border-white/20 transition-all group overflow-hidden relative">
                                        <div className="flex items-center gap-4 relative z-10">
                                            <div className="w-16 h-10 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                                                <img src={icon} alt={acc.name} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] uppercase tracking-widest text-white/20 font-bold group-hover:text-white/40 transition-colors">{acc.name}</span>
                                                <span className="text-xl font-mono font-bold text-white">{fmt(acc.amount)}</span>
                                            </div>
                                        </div>
                                        <div className="absolute right-0 top-0 bottom-0 w-1 opacity-40" style={{ backgroundColor: acc.color }}></div>
                                    </div>
                                );
                            })}
                        </div>
                    </CollapsibleSection>

                    {/* Legend */}
                    <div className="mt-auto pt-8 flex gap-6 opacity-30 flex-wrap justify-end">
                        {['ACQUISITION', 'EXPENSE', 'PRODUCTION', 'SUPPLIES', 'CRATES'].map((type, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{
                                    backgroundColor:
                                        type === 'ACQUISITION' ? '#a9d08e' :
                                            type === 'EXPENSE' ? '#e06666' :
                                                type === 'PRODUCTION' ? '#FFED00' :
                                                    type === 'SUPPLIES' ? '#F7941D' : '#8DC63F'
                                }}></div>
                                <span className="text-[9px] font-bold tracking-[0.2em] text-white/60">{type}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
