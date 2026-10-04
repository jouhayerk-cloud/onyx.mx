import React from 'react';
import { AlertTriangle, Check, Package } from 'lucide-react';
import { tr, trf } from '../../../lib/i18n';
import type { PackingState } from './types';

export const PackingBoard: React.FC<{ packing: PackingState | null }> = ({ packing }) => {
  if (!packing) {
    return (
      <div className="py-6 text-center">
        <p className="text-xs font-semibold text-neutral-500">{tr('No telemetry yet')}</p>
      </div>
    );
  }

  const scannedOk = packing.expected.filter((id) => packing.scanned.includes(id));
  const missing = packing.expected.filter((id) => !packing.scanned.includes(id));
  const hasWrong = packing.wrong.length > 0;

  return (
    <div className={`rounded-xl bg-black/40 border p-4 space-y-3 ${hasWrong ? 'border-rose-500/40' : 'border-white/5'}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Package size={16} className="text-neutral-400 shrink-0" />
          <span className="text-xs font-bold text-white truncate">{packing.crate}</span>
        </div>
        <span className="text-xs font-mono font-bold text-emerald-400">
          {trf('{n} of {m} scanned', { n: scannedOk.length, m: packing.expected.length })}
        </span>
      </div>

      {hasWrong && (
        <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1.5">
          <AlertTriangle size={13} className="shrink-0" />
          {trf('{n} wrong items', { n: packing.wrong.length })}: {packing.wrong.join(', ')}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{tr('Scanned')}</div>
          {scannedOk.length === 0 ? (
            <span className="text-[10px] font-mono text-neutral-600">-</span>
          ) : (
            <ul className="text-[11px] font-mono text-emerald-400 space-y-0.5">
              {scannedOk.map((id) => <li key={id} className="flex items-center gap-1"><Check size={11} />{id}</li>)}
            </ul>
          )}
        </div>
        <div>
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{tr('Missing')}</div>
          {missing.length === 0 ? (
            <span className="text-[10px] font-mono text-neutral-600">-</span>
          ) : (
            <ul className="text-[11px] font-mono text-amber-400 space-y-0.5">
              {missing.map((id) => <li key={id}>{id}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
