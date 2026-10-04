import React from 'react';
import { useAtomValue } from 'jotai/react';
import { userAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import { useArchiveBalances } from './useArchiveBalances';

const isDateStr = (val: any) => {
  if (typeof val !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val);
};

const formatValue = (val: any) => {
  if (val == null || val === '') return <span className="opacity-40">—</span>;
  if (typeof val === 'number') {
    return new Intl.NumberFormat('en-US').format(val);
  }
  if (isDateStr(val)) {
    return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  }
  return val;
};

const humaniseCol = (col: string) => {
  if (/^Col\d+$/.test(col)) {
    return col.replace('Col', 'Col ');
  }
  return col;
};

const LedgerContent: React.FC = () => {
  const { status, error, rows, columns } = useArchiveBalances();

  if (status === 'loading') {
    return (
      <div className="glass-panel flex h-full items-center justify-center p-8">
        <div className="text-[10px] font-mono text-white/40 uppercase animate-pulse">{tr('Loading...')}</div>
      </div>
    );
  }
  if (status === 'unavailable') {
    return (
      <div className="glass-panel flex h-full items-center justify-center p-8">
        <div className="text-[10px] font-black uppercase text-red-400">{tr('Archive Unavailable')}: {error}</div>
      </div>
    );
  }
  if (status === 'empty') {
    return (
      <div className="glass-panel flex h-full items-center justify-center p-8">
        <div className="text-[10px] font-black uppercase text-white/40">{tr('Archive Empty')}</div>
      </div>
    );
  }

  return (
    <div className="glass-panel flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 p-4 border-b border-white/5 items-center shrink-0">
        <h1 className="text-xl font-black tracking-tighter text-white/90 uppercase">{tr('Ledger')}</h1>
        <div className="ml-auto text-[9px] uppercase font-black tracking-widest text-white/20 whitespace-nowrap">
          {rows.length} {tr('Rows')}
        </div>
      </div>
      
      {/* Table Area */}
      <div 
        className="flex-1 overflow-auto custom-scrollbar p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)]"
        tabIndex={0}
      >
        <div className="rounded-2xl border border-white/5 overflow-hidden bg-white/[0.01] backdrop-blur-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5 bg-white/[0.02] whitespace-nowrap">
                <th className="px-4 py-3 sticky left-0 bg-black/80 z-10 border-r border-white/5">{tr('Label')}</th>
                {columns.map(col => (
                  <th key={col} className={`px-4 py-3 ${/^Col\d+$/.test(col) ? 'text-right' : ''}`}>
                    {humaniseCol(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-white/[0.04] group transition-all duration-200">
                  <td className="px-4 py-2 sticky left-0 bg-black/80 group-hover:bg-[#1a1a1a] transition-all whitespace-nowrap z-10 border-r border-white/5">
                    <span className="text-xs text-white/80 font-black">{row.payload?._label || '—'}</span>
                    {row.payload?._src_row != null && (
                      <span className="ml-2 text-[9px] font-mono text-white/30">#{row.payload._src_row}</span>
                    )}
                  </td>
                  {columns.map(col => {
                    const val = row.payload?.[col];
                    const isNum = typeof val === 'number';
                    return (
                      <td key={col} className={`px-4 py-2 text-xs text-white/70 whitespace-nowrap ${isNum ? 'text-right tabular-nums' : ''}`}>
                        {formatValue(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Footer */}
      <div className="p-3 border-t border-white/5 text-center shrink-0">
        <span className="text-[9px] text-white/30 uppercase tracking-widest font-black">
          {tr('These figures are copied from the 825 workbook and are not recalculated.')}
        </span>
      </div>
    </div>
  );
};

export default function ArchiveBalances() {
  const user = useAtomValue(userAtom);
  const isFinanceRole = user?.role === 'Developer' || user?.role === 'Admin';

  if (!isFinanceRole) {
    return (
      <div className="glass-panel flex h-full items-center justify-center p-8">
        <div className="text-sm font-black tracking-widest uppercase text-white/40 text-center">
          {tr('Access Restricted')}
          <br/>
          <span className="text-[10px] mt-2 block">{tr('You do not have permission to view the ledger.')}</span>
        </div>
      </div>
    );
  }

  return <LedgerContent />;
}
