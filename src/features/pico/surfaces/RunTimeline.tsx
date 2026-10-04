import React from 'react';
import { tr } from '../../../lib/i18n';
import type { AgentRun, AgentRunEvent } from './types';
import { formatDuration, relativeTime } from './format';

const STATUS_CHIP: Record<string, string> = {
  running: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  succeeded: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  failed: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  cancelled: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30',
};
const STATUS_LABEL: Record<string, string> = {
  running: 'Running', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled',
};

const EVENT_LABEL: Record<string, string> = {
  RunStarted: 'Run started', StepStarted: 'Step', StepFinished: 'Step done',
  ToolCallStart: 'Tool call', ToolCallResult: 'Tool result', StateDelta: 'State update',
  RunFinished: 'Run finished', RunError: 'Error',
};

const keyOf = (e: AgentRunEvent) => String(e.payload?.id ?? e.payload?.tool ?? e.payload?.name ?? e.payload?.step ?? '');
const nameOf = (e: AgentRunEvent) => String(e.payload?.name ?? e.payload?.tool ?? e.payload?.step ?? '');

/** Duration of each finishing event, matched to the latest open start with the same key. */
function durations(events: AgentRunEvent[]): Map<number, number> {
  const open = new Map<string, number[]>();
  const out = new Map<number, number>();
  for (const e of events) {
    const at = Date.parse(e.at);
    if (e.type === 'StepStarted' || e.type === 'ToolCallStart') {
      const k = `${e.type === 'StepStarted' ? 's' : 't'}:${keyOf(e)}`;
      open.set(k, [...(open.get(k) ?? []), at]);
    } else if (e.type === 'StepFinished' || e.type === 'ToolCallResult') {
      const k = `${e.type === 'StepFinished' ? 's' : 't'}:${keyOf(e)}`;
      const stack = open.get(k);
      const start = stack?.pop();
      if (start !== undefined && !Number.isNaN(at)) out.set(e.seq, at - start);
    }
  }
  return out;
}

const RunCard: React.FC<{ run: AgentRun; now: number }> = ({ run, now }) => {
  const events = [...run.events].sort((a, b) => a.seq - b.seq);
  const dur = durations(events);
  const t0 = Date.parse(run.started_at);
  const end = run.finished_at ? Date.parse(run.finished_at) : now;
  const hasError = events.some((e) => e.type === 'RunError') || run.status === 'failed';

  return (
    <div className={`rounded-xl bg-black/40 border p-4 ${hasError ? 'border-rose-500/30' : 'border-white/5'}`}>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-bold text-white truncate">{run.workflow}</div>
          <div className="text-[10px] font-mono text-neutral-500">
            {run.device_id ?? '-'} · {relativeTime(run.started_at, now)}
            {!Number.isNaN(t0) && !Number.isNaN(end) ? ` · ${formatDuration(end - t0)}` : ''}
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-widest ${STATUS_CHIP[run.status] ?? STATUS_CHIP.cancelled}`}>
          {tr(STATUS_LABEL[run.status] ?? run.status)}
        </span>
      </div>

      {events.length === 0 ? (
        <p className="text-[10px] font-mono text-neutral-600">{tr('No telemetry yet')}</p>
      ) : (
        <ol className="relative border-l border-white/10 ml-1.5 space-y-2">
          {events.map((e) => {
            const isErr = e.type === 'RunError';
            const isTool = e.type === 'ToolCallStart' || e.type === 'ToolCallResult';
            const offset = Date.parse(e.at) - t0;
            const d = dur.get(e.seq);
            const detail = isErr ? String(e.payload?.message ?? e.payload?.error ?? '') : nameOf(e);
            return (
              <li key={e.seq} className="pl-4 relative">
                <span className={`absolute -left-[4px] top-1.5 w-2 h-2 rounded-full ${isErr ? 'bg-rose-400' : isTool ? 'bg-purple-400' : 'bg-neutral-400'}`} />
                <div className={`flex items-baseline gap-2 flex-wrap text-[10px] font-mono ${isErr ? 'text-rose-400' : 'text-neutral-300'}`}>
                  <span className="font-bold uppercase tracking-wider">{tr(EVENT_LABEL[e.type] ?? e.type)}</span>
                  {detail && <span className="text-neutral-400 break-words min-w-0">{detail}</span>}
                  {d !== undefined && <span className="text-amber-400">{formatDuration(d)}</span>}
                  {!Number.isNaN(offset) && <span className="text-neutral-600 ml-auto">+{formatDuration(Math.max(0, offset))}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export const RunTimeline: React.FC<{ runs: AgentRun[]; now: number }> = ({ runs, now }) => {
  if (runs.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-xs font-semibold text-neutral-500">{tr('No telemetry yet')}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {runs.map((r) => <RunCard key={r.id} run={r} now={now} />)}
    </div>
  );
};
