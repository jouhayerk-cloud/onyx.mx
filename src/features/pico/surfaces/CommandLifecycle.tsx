import React from 'react';
import { tr } from '../../../lib/i18n';
import type { CommandRow, CommandStatus } from './types';
import { relativeTime } from './format';

const ORDER: CommandStatus[] = ['queued', 'leased', 'acked', 'failed', 'expired'];
const CHIP: Record<CommandStatus, string> = {
  queued: 'bg-neutral-500/10 text-neutral-300 border-neutral-500/30',
  leased: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  acked: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  failed: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  expired: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
};
const LABEL: Record<CommandStatus, string> = {
  queued: 'Queued', leased: 'Leased', acked: 'Acked', failed: 'Failed', expired: 'Expired',
};

const Chip: React.FC<{ status: CommandStatus; count?: number }> = ({ status, count }) => (
  <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-widest whitespace-nowrap ${CHIP[status]}`}>
    {tr(LABEL[status])}{count !== undefined ? ` ${count}` : ''}
  </span>
);

export const CommandLifecycle: React.FC<{ commands: CommandRow[]; now: number }> = ({ commands, now }) => {
  if (commands.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-xs font-semibold text-neutral-500">{tr('No telemetry yet')}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {ORDER.map((s) => <Chip key={s} status={s} count={commands.filter((c) => c.status === s).length} />)}
      </div>
      <ul className="divide-y divide-white/5">
        {commands.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <span className="text-xs font-mono font-bold text-white">{c.action}</span>
              <span className="text-[10px] font-mono text-neutral-500"> {c.target_device} · {relativeTime(c.created_at, now)}</span>
            </div>
            <Chip status={c.status} />
          </li>
        ))}
      </ul>
    </div>
  );
};
