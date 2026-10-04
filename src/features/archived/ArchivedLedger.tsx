import React from 'react';
import { useAtomValue } from 'jotai/react';
import { userAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import { useArchiveBalances } from '../archive/useArchiveBalances';

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
  if (typeof val === 'object') return JSON.stringify(val);
  if (typeof val === 'boolean') return String(val);
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
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="text-[10px] font-mono text-white/40 uppercase animate-pulse">{tr('Loading...')}</div>
      </div>
    );
  }
  if (status === 'unavailable') {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="text-[10px] font-black uppercase text-red-400">{tr('Archive Unavailable')}: {error}</div>
      </div>
    );
  }
  if (status === 'empty') {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="text-[10px] font-black uppercase text-white/40">{tr('Archive Empty')}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden w-full">
      {/* KPI Strip */}
      <div className="flex items-center gap-4 p-4 border-b border-white/5 shrink-0">
        <div className="glass-tile flex flex-col justify-center px-4 py-2 min-w-[120px] rounded-md">
          <span className="text-[9px] font-black tracking-widest text-white/40 uppercase">{tr('Rows')}</span>
          <span className="text-xl font-light tabular-nums text-white/90">{rows.length}</span>
        </div>
      </div>
      
      {/* Table Area - SLAB style */}
      <div 
        className="flex-1 overflow-auto custom-scrollbar p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)]"
        tabIndex={0}
      >
        <div className="rounded-xl border border-white/5 overflow-hidden bg-white/[0.01]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[9px] uppercase tracking-widest text-white/40 border-b border-white/5 bg-white/[0.02] whitespace-nowrap">
                <th className="px-4 py-3 sticky left-0 bg-[var(--slab)] z-10 border-r border-white/5 font-bold">
                  {tr('Label')}
                </th>
                {columns.map(col => (
                  <th key={col} className={`px-4 py-3 font-bold ${/^Col\d+$/.test(col) ? 'text-right' : ''}`}>
                    {humaniseCol(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-white/[0.04] transition-colors duration-150">
                  <td className="px-4 py-2 sticky left-0 bg-[var(--slab)] z-10 border-r border-white/5 whitespace-nowrap">
                    <span className="text-[11px] text-white/90 font-black tracking-wide">{row.payload?._label || '—'}</span>
                    {row.payload?._src_row != null && (
                      <span className="ml-2 text-[9px] font-mono text-white/40">#{row.payload._src_row}</span>
                    )}
                  </td>
                  {columns.map(col => {
                    const val = row.payload?.[col];
                    const isNum = typeof val === 'number';
                    return (
                      <td key={col} className={`px-4 py-2 text-[11px] text-white/70 whitespace-nowrap ${isNum ? 'text-right tabular-nums' : ''}`}>
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
