import React from 'react';
import { tr, trf } from '../../lib/i18n';

export interface ArchivedHeaderProps {
  season: string;
  sourceFile: string;
  importedAt: string;
  vendorCount: number;
  totalQuantity: number;
  totalWeight: number;
  totalUsd: number | null;
  scopeLabel: string;
  itemsInScope: number;
}

export const ArchivedHeader: React.FC<ArchivedHeaderProps> = ({
  season,
  sourceFile,
  importedAt,
  vendorCount,
  totalQuantity,
  totalWeight,
  totalUsd,
  scopeLabel,
  itemsInScope,
}) => {
  const fmtUSD = (v: number | null) =>
    v == null
      ? '—'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(v);

  return (
    <div className="flex flex-col shrink-0">
      <div className="flex gap-4 p-4 border-b border-white/5 items-center bg-black/20">
        <div className="flex flex-col">
          <h1 className="text-xl font-black tracking-tighter text-white/90 uppercase">{tr("Archived")}</h1>
          <span className="text-[10px] font-mono text-white/50">{tr("Season")}: {season}</span>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{tr("Source File")}</span>
            <span className="text-xs font-mono font-bold text-white">{sourceFile}</span>
          </div>
          {importedAt && (
            <div className="flex flex-col items-end">
              <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{tr("Imported")}</span>
              <span className="text-xs font-mono font-bold text-white">{new Date(importedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4 p-4 border-b border-white/5 bg-black/20 overflow-x-auto custom-scrollbar">
        <div className="flex flex-col bg-white/[0.02] border border-white/5 p-3 rounded-2xl min-w-[140px] tabular-nums">
          <span className="text-[9px] font-black tracking-widest text-white/40 uppercase">{tr("Vendors")}</span>
          <span className="text-xl font-mono font-bold text-white mt-1">{vendorCount}</span>
        </div>
        <div className="flex flex-col bg-white/[0.02] border border-white/5 p-3 rounded-2xl min-w-[140px] tabular-nums">
          <span className="text-[9px] font-black tracking-widest text-white/40 uppercase line-clamp-1" title={scopeLabel}>
            {trf("Items in {scope}", { scope: scopeLabel })}
          </span>
          <span className="text-xl font-mono font-bold text-white mt-1">{itemsInScope}</span>
        </div>
        <div className="flex flex-col bg-white/[0.02] border border-white/5 p-3 rounded-2xl min-w-[140px] tabular-nums">
          <span className="text-[9px] font-black tracking-widest text-white/40 uppercase">{tr("Total Quantity")}</span>
          <span className="text-xl font-mono font-bold text-white mt-1">{totalQuantity}</span>
        </div>
        <div className="flex flex-col bg-white/[0.02] border border-white/5 p-3 rounded-2xl min-w-[140px] tabular-nums">
          <span className="text-[9px] font-black tracking-widest text-white/40 uppercase">{tr("Total Weight (KG)")}</span>
          <span className="text-xl font-mono font-bold text-white mt-1">{totalWeight.toFixed(2)}</span>
        </div>
        {totalUsd !== null && (
          <div className="flex flex-col bg-white/[0.02] border border-white/5 p-3 rounded-2xl min-w-[140px] tabular-nums">
            <span className="text-[9px] font-black tracking-widest text-white/40 uppercase">{tr("Page Total (USD)")}</span>
            <span className="text-xl font-mono font-bold text-[var(--main-color)] mt-1">{fmtUSD(totalUsd)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
