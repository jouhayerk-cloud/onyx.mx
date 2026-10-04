import React from 'react';
import { useAtomValue } from 'jotai/react';
import { userAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import { useArchiveBalances } from '../archive/useArchiveBalances';
import { formatNumber } from './archiveFormat';

const isDateStr = (val: any) => {
  if (typeof val !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val);
};

const formatValue = (val: any) => {
  if (val == null || val === '') return <span className="opacity-40">—</span>;
  if (typeof val === 'number') {
    return formatNumber(val, 2);
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
      <div className="flex w-full items-center justify-center p-12">
        <div className="text-[10px] font-mono opacity-40 uppercase animate-pulse">{tr('Loading...')}</div>
      </div>
    );
  }
  if (status === 'unavailable') {
    return (
      <div className="flex w-full items-center justify-center p-12">
        <div className="text-[10px] font-black uppercase text-red-400">{tr('Archive Unavailable')}: {error}</div>
      </div>
    );
  }
  if (status === 'empty') {
    return (
      <div className="flex w-full items-center justify-center p-12">
        <div className="text-[10px] font-black uppercase opacity-40">{tr('Archive Empty')}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full px-4 pb-6 pt-3 min-h-full">
      <div className="flex items-center gap-4 mb-4">
        <div className="arch-glass flex flex-col justify-center px-4 py-2 min-w-[120px] rounded-xl">
          <span className="text-[9px] font-black tracking-widest opacity-40 uppercase">{tr('Rows')}</span>
          <span className="text-xl font-light tabular-nums opacity-90">{rows.length}</span>
        </div>
      </div>
      
      <div 
        className="flex-1 w-full relative focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)]"
        tabIndex={0}
      >
        <div className="rounded-xl overflow-x-auto no-scrollbar pb-8">
          <table className="w-full text-left border-collapse">
            <thead className="arch-th sticky z-20" style={{ top: 'var(--app-topbar-h, 0px)' }}>
              <tr className="text-[9px] uppercase tracking-widest opacity-50 whitespace-nowrap">
                <th className="px-4 py-3 sticky left-0 arch-th z-30 font-bold border-r border-black/5">
                  {tr('Label')}
                </th>
                {columns.map(col => (
                  <th key={col} className={`px-4 py-3 font-bold ${/^Col\d+$/.test(col) ? 'text-right' : ''}`}>
                    {humaniseCol(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((row, i) => (
                <tr key={i} className="arch-row transition-colors duration-150">
                  <td className="px-4 py-2 sticky left-0 arch-row z-10 border-r border-black/5 whitespace-nowrap">
                    <span className="text-[11px] opacity-90 font-black tracking-wide">{String(row.payload?._label ?? '—')}</span>
                    {row.payload?._src_row != null && (
                      <span className="ml-2 text-[9px] font-mono opacity-40">#{row.payload._src_row}</span>
                    )}
                  </td>
                  {columns.map(col => {
                    const val = row.payload?.[col];
                    const isNum = typeof val === 'number';
                    return (
                      <td key={col} className={`px-4 py-2 text-[11px] opacity-70 whitespace-nowrap ${isNum ? 'text-right tabular-nums font-mono' : ''}`}>
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
      
      <div className="mt-8 text-center">
        <span className="text-[9px] opacity-40 uppercase tracking-widest font-black">
          {tr('These figures are copied from the 825 workbook and are not recalculated.')}
        </span>
      </div>
    </div>
  );
};

export const ArchivedLedger: React.FC = () => {
  const user = useAtomValue(userAtom);
  const isFinanceRole = user?.role === 'Developer' || user?.role === 'Admin';
  if (!isFinanceRole) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-sm font-black tracking-widest uppercase opacity-40">{tr('Access Restricted')}</div>
      </div>
    );
  }
  return <LedgerContent />;
};
