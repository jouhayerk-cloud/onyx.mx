import React from 'react';
import { Activity } from 'lucide-react';
import { tr } from '../../../lib/i18n';
import { FleetCards } from './FleetCards';
import { RunTimeline } from './RunTimeline';
import { CommandLifecycle } from './CommandLifecycle';
import { PackingBoard } from './PackingBoard';
import { packingStateOf } from './types';
import { useNow, type useDeviceFleet } from './useDeviceFleet';

type Fleet = ReturnType<typeof useDeviceFleet>;

const SubHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">{children}</h3>
);

export const FleetSection: React.FC<{ fleet: Fleet }> = ({ fleet }) => {
  const now = useNow();
  const { devices, telemetryFor, runs, commands, source, error } = fleet;
  const packing = runs.map(packingStateOf).find((p) => p !== null) ?? null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
          <Activity size={16} className="text-cyan-400" />
          {tr('Fleet')} ({devices.length})
        </h2>
        {source === 'mock' && (
          <span className="px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[9px] font-bold uppercase tracking-widest">
            {tr('Simulated data')}
          </span>
        )}
      </div>

      {source === 'none' && error && (
        <p className="text-[10px] font-mono text-neutral-500 break-words">
          {tr('Fleet telemetry is not available yet.')} {error}
        </p>
      )}

      <FleetCards devices={devices} telemetryFor={telemetryFor} now={now} />

      {(source !== 'none' || runs.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
          <div className="lg:col-span-7">
            <SubHeading>{tr('Agent runs')}</SubHeading>
            <RunTimeline runs={runs} now={now} />
          </div>
          <div className="lg:col-span-5 space-y-5">
            <div>
              <SubHeading>{tr('Packing check')}</SubHeading>
              <PackingBoard packing={packing} />
            </div>
            <div>
              <SubHeading>{tr('Commands')}</SubHeading>
              <CommandLifecycle commands={commands} now={now} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
