import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Play } from 'lucide-react';
import { tr } from '../../../lib/i18n';
import type { AgentRun, DeviceState } from '../surfaces/types';
import { useNow } from '../surfaces/useDeviceFleet';
import { RunTimeline } from '../surfaces/RunTimeline';
import { PackingBoard } from '../surfaces/PackingBoard';
import { packingStateOf } from '../surfaces/types';
import { formatDuration, relativeTime } from '../surfaces/format';

const STATUS_CHIP: Record<string, string> = {
  running: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  succeeded: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  failed: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  cancelled: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30',
};

const STATUS_LABEL: Record<string, string> = {
  running: 'Running', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled',
};

const WorkflowCard: React.FC<{
  title: string;
  steps: string[];
  roles: string;
  devicesText: string;
}> = ({ title, steps, roles, devicesText }) => {
  return (
    <div className="rounded-xl bg-black/40 border border-white/5 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <button 
          disabled 
          title={tr('Starts from the device; remote start comes with the firmware')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-neutral-500 border border-white/5 cursor-not-allowed text-xs font-bold"
        >
          <Play size={12} />
          {tr('Start')}
        </button>
      </div>
      
      <div>
        <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-2">{tr('Steps')}</div>
        <ol className="list-decimal list-inside text-xs text-neutral-300 space-y-1 ml-1 font-mono">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
        <div>
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{tr('Roles')}</div>
          <div className="text-xs font-mono text-neutral-300">{roles}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{tr('Supported Devices')}</div>
          <div className="text-xs font-mono text-neutral-300">{devicesText}</div>
        </div>
      </div>
    </div>
  );
};

const RunRow: React.FC<{ run: AgentRun; now: number }> = ({ run, now }) => {
  const [expanded, setExpanded] = useState(false);
  const t0 = Date.parse(run.started_at);
  const end = run.finished_at ? Date.parse(run.finished_at) : now;
  const dur = !Number.isNaN(t0) && !Number.isNaN(end) ? end - t0 : null;
  const packing = packingStateOf(run);

  return (
    <div className="rounded-xl bg-black/40 border border-white/5 overflow-hidden">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors gap-4 flex-wrap"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="text-neutral-400 shrink-0">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">{run.workflow}</div>
            <div className="text-[10px] font-mono text-neutral-500">
              {run.device_id ?? '-'} · {relativeTime(run.started_at, now)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {dur !== null && (
            <div className="text-[10px] font-mono text-neutral-400 text-right">
              {formatDuration(dur)}
            </div>
          )}
          <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-widest ${STATUS_CHIP[run.status] ?? STATUS_CHIP.cancelled}`}>
            {tr(STATUS_LABEL[run.status] ?? run.status)}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="p-4 pt-0 border-t border-white/5 space-y-4">
          <div className="mt-4">
            {run.workflow === 'packing_check' && (
              <div className="mb-4">
                <PackingBoard packing={packing} />
              </div>
            )}
            <RunTimeline runs={[run]} now={now} />
          </div>
        </div>
      )}
    </div>
  );
};

export const WorkflowsTab: React.FC<{ runs: AgentRun[]; devices: DeviceState[] }> = ({ runs, devices }) => {
  const now = useNow();

  const getSupportedDevices = () => {
    const matching = devices.filter((d: any) => {
       const hw = d.hardware_model;
       return hw === 'StickS3' || hw === 'StackChan' || hw === 'StickS3 staff device';
    });
    if (matching.length > 0) return matching.map(d => d.device_id).join(', ');
    return tr('StickS3 staff device, StackChan');
  };
  const devicesText = getSupportedDevices();

  // Summary stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  let runsToday = 0;
  let errorsToday = 0;
  let totalDur = 0;
  let durCount = 0;

  for (const r of runs) {
    const start = Date.parse(r.started_at);
    if (!Number.isNaN(start) && start >= todayMs) {
      runsToday++;
      if (r.status === 'failed') errorsToday++;
    }
    const end = r.finished_at ? Date.parse(r.finished_at) : null;
    if (!Number.isNaN(start) && end !== null && !Number.isNaN(end)) {
      totalDur += (end - start);
      durCount++;
    }
  }

  const avgDur = durCount > 0 ? totalDur / durCount : 0;
  const sortedRuns = [...runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-black/40 border border-white/5 p-4">
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{tr('Runs Today')}</div>
          <div className="text-lg font-mono font-bold text-white">{runsToday}</div>
        </div>
        <div className="rounded-xl bg-black/40 border border-white/5 p-4">
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{tr('Errors Today')}</div>
          <div className="text-lg font-mono font-bold text-rose-400">{errorsToday}</div>
        </div>
        <div className="rounded-xl bg-black/40 border border-white/5 p-4">
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{tr('Avg Duration')}</div>
          <div className="text-lg font-mono font-bold text-cyan-400">{durCount > 0 ? formatDuration(avgDur) : '-'}</div>
        </div>
      </div>

      {/* Workflows */}
      <div>
        <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">{tr('Available Workflows')}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <WorkflowCard 
            title={tr('Item lookup')}
            steps={[
              tr('Scan'),
              tr('Resolve the tag over the device call endpoint'),
              tr('Show the item card'),
              tr('Optional open in app'),
            ]}
            roles={tr('Admin, Developer, Staff')}
            devicesText={devicesText}
          />
          <WorkflowCard 
            title={tr('Packing check')}
            steps={[
              tr('Choose a crate'),
              tr('Scan items in'),
              tr('N of M counter'),
              tr('Wrong-item alert'),
              tr('Result written back'),
            ]}
            roles={tr('Admin, Developer, Staff')}
            devicesText={devicesText}
          />
        </div>
      </div>

      {/* History */}
      <div>
        <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">{tr('Run History')}</h2>
        {sortedRuns.length === 0 ? (
          <div className="py-8 text-center rounded-xl bg-black/40 border border-white/5">
            <p className="text-xs font-semibold text-neutral-500">{tr('No telemetry yet')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedRuns.map(run => (
              <RunRow key={run.id} run={run} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowsTab;
