import React, { useEffect, useState, Suspense } from 'react';
import { X } from 'lucide-react';
import { tr } from '../../../../lib/i18n';
import type { DeviceState, TelemetryPoint, AgentRun, CommandRow } from '../../surfaces/types';
import { connectivity } from '../../surfaces/types';
import type { DeviceProfile } from '../profiles/deviceProfiles';
import { profileFor } from '../profiles/deviceProfiles';
import { readExtra } from '../twin/deviceExtra';
import { CommandLifecycle } from '../../surfaces/CommandLifecycle';
import { RunTimeline } from '../../surfaces/RunTimeline';

const StackChanTwin = React.lazy(() => import('../twin/StackChanTwin').then(m => ({ default: m.StackChanTwin })));
const StickS3Twin = React.lazy(() => import('../twin/StickS3Twin').then(m => ({ default: m.StickS3Twin })));
const TelemetryCharts = React.lazy(() => import('./TelemetryCharts').then(m => ({ default: m.TelemetryCharts })));

interface DeviceDetailDrawerProps {
  deviceId: string | null;
  onClose: () => void;
  devices: DeviceState[];
  telemetryFor: (id: string) => TelemetryPoint[];
  runs: AgentRun[];
  commands: CommandRow[];
}

const CHIP: Record<string, string> = {
  online: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30',
  stale: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30',
  offline: 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-500/10 dark:text-neutral-400 dark:border-neutral-500/30',
};
const CHIP_LABEL: Record<string, string> = { online: 'Online', stale: 'Stale', offline: 'Offline' };

export const DeviceDetailDrawer: React.FC<DeviceDetailDrawerProps> = ({
  deviceId,
  onClose,
  devices,
  telemetryFor,
  runs,
  commands,
}) => {
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<'overview' | 'telemetry' | 'commands' | 'runs' | 'info'>('overview');
  const [range, setRange] = useState<'1h' | '24h' | '7d'>('1h');

  useEffect(() => {
    if (!deviceId) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deviceId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (deviceId) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [deviceId, onClose]);

  if (!deviceId) return null;

  const device = devices.find(d => d.device_id === deviceId);
  if (!device) return null;

  const hwModel = (device as any).hardware_model;
  const profile = profileFor(hwModel);
  const conn = connectivity(device, now);
  const extra = readExtra(device);
  const points = telemetryFor(deviceId);
  const deviceRuns = runs.filter(r => r.device_id === deviceId);
  const deviceCommands = commands.filter(c => c.target_device === deviceId);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm sm:items-end md:items-stretch transition-opacity motion-reduce:transition-none"
      aria-modal="true"
      role="dialog"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      
      {/* Drawer Panel */}
      <div className="relative w-full max-h-[90vh] md:max-h-none md:w-[480px] bg-white dark:bg-[#121212] border-t md:border-t-0 md:border-l border-neutral-200 dark:border-white/10 flex flex-col rounded-t-2xl md:rounded-none overflow-hidden shadow-2xl transition-transform motion-reduce:transition-none translate-y-0 md:translate-x-0">
        
        {/* Header */}
        <div className="flex-none p-4 md:p-6 border-b border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white truncate">{device.device_id}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="px-2 py-0.5 rounded-full border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 text-[10px] font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-widest">
                  {profile.shortLabel}
                </span>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${CHIP[conn]}`}>
                  {tr(CHIP_LABEL[conn])}
                </span>
                {device.fw_version && (
                  <span className="px-2 py-0.5 rounded-full border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 text-[10px] font-mono text-neutral-600 dark:text-neutral-400">
                    v{device.fw_version}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/10 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-white/50"
              aria-label={tr('Close')}
            >
              <X size={20} />
            </button>
          </div>

          {/* Segmented Control */}
          <div className="flex p-1 bg-neutral-200/50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-lg overflow-x-auto hide-scrollbar">
            {['overview', 'telemetry', 'commands', 'runs', 'info'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={`flex-1 min-w-[80px] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-white/50 ${
                  tab === t
                    ? 'bg-white text-neutral-900 dark:bg-white/10 dark:text-white shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-white/5'
                }`}
              >
                {tr(t.charAt(0).toUpperCase() + t.slice(1))}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          {tab === 'overview' && (
            <Suspense fallback={<div className="py-8 text-center text-xs font-mono text-neutral-500">{tr('Loading...')}</div>}>
              {profile.model === 'M5StackChan' ? (
                <StackChanTwin device={device} points={points} extra={extra} />
              ) : profile.model === 'M5StickS3' ? (
                <StickS3Twin device={device} points={points} extra={extra} />
              ) : (
                <div className="rounded-xl bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/5 p-6 text-center space-y-2">
                  <div className="text-neutral-600 dark:text-neutral-400 font-bold">{tr('Unknown device model')}</div>
                  <div className="text-xs text-neutral-500 font-mono">{hwModel || tr('Not reported')}</div>
                </div>
              )}
            </Suspense>
          )}

          {tab === 'telemetry' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <div className="flex p-0.5 bg-neutral-200/50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-md">
                  {['1h', '24h', '7d'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r as any)}
                      className={`px-3 py-1 text-[10px] font-bold rounded transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-white/50 ${
                        range === r
                          ? 'bg-white text-neutral-900 dark:bg-white/10 dark:text-white shadow-sm'
                          : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-300'
                      }`}
                    >
                      {tr(r)}
                    </button>
                  ))}
                </div>
              </div>
              <Suspense fallback={<div className="py-8 text-center text-xs font-mono text-neutral-500">{tr('Loading...')}</div>}>
                <TelemetryCharts points={points} profile={profile} range={range} />
              </Suspense>
            </div>
          )}

          {tab === 'commands' && (
            <CommandLifecycle commands={deviceCommands} now={now} />
          )}

          {tab === 'runs' && (
            <RunTimeline runs={deviceRuns} now={now} />
          )}

          {tab === 'info' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">{tr('Device Info')}</h3>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{tr('ID')}</dt>
                  <dd className="mt-1 text-xs font-mono text-neutral-900 dark:text-white break-all bg-neutral-100 dark:bg-black/20 p-2 rounded border border-neutral-200 dark:border-white/5">{device.device_id}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{tr('Role')}</dt>
                  <dd className="mt-1 text-xs font-mono text-neutral-900 dark:text-white">{(device as any).role ?? <span className="text-neutral-500">{tr('Not reported')}</span>}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{tr('Interval')}</dt>
                  <dd className="mt-1 text-xs font-mono text-neutral-900 dark:text-white">{device.checkin_interval_s !== null ? `${device.checkin_interval_s}s` : <span className="text-neutral-500">{tr('Not reported')}</span>}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{tr('Last check-in')}</dt>
                  <dd className="mt-1 text-xs font-mono text-neutral-900 dark:text-white">{device.last_checkin_at ? new Date(device.last_checkin_at).toLocaleString() : <span className="text-neutral-500">{tr('Not reported')}</span>}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{tr('Session open until')}</dt>
                  <dd className="mt-1 text-xs font-mono text-neutral-900 dark:text-white">{device.session_open_until ? new Date(device.session_open_until).toLocaleString() : <span className="text-neutral-500">{tr('Not reported')}</span>}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
