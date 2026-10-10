import React from 'react';
import { BatteryCharging, Battery, Wifi, Cpu, AlertCircle } from 'lucide-react';
import { tr, trf } from '../../../lib/i18n';
import { connectivity, type Connectivity, type DeviceState, type TelemetryPoint } from './types';
import { relativeTime } from './format';
import { TelemetrySparkline } from './TelemetrySparkline';

const CHIP: Record<Connectivity, string> = {
  online: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  stale: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  offline: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30',
};
const CHIP_LABEL: Record<Connectivity, string> = { online: 'Online', stale: 'Stale', offline: 'Offline' };

interface FleetCardsProps {
  onSelect?: (deviceId: string) => void;
  devices: DeviceState[];
  telemetryFor: (deviceId: string) => TelemetryPoint[];
  now: number;
}

const Metric: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{label}</div>
    <div className="text-xs font-mono font-bold text-white">{children}</div>
  </div>
);

/** Card grid of fleet devices with their latest telemetry; onSelect reports the chosen device. */
export const FleetCards: React.FC<FleetCardsProps> = ({ devices, telemetryFor, now, onSelect }) => {
  if (devices.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-xs font-semibold text-neutral-500">{tr('No telemetry yet')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {devices.map((d) => {
        const conn = connectivity(d, now);
        const sessionOpen = !!d.session_open_until && Date.parse(d.session_open_until) > now;
        return (
          <div key={d.device_id} className={`rounded-xl bg-black/40 border border-white/5 p-4 space-y-3${onSelect ? ' cursor-pointer hover:border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2' : ''}`}
            {...(onSelect ? { role: 'button', tabIndex: 0, 'aria-label': `${tr('Open device')} ${d.device_id}`, onClick: () => onSelect(d.device_id), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(d.device_id); } } } : {})}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Cpu size={14} className="text-neutral-400 shrink-0" />
                  <span className="text-xs font-bold text-white truncate">{d.device_id}</span>
                </div>
                <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                  {tr('Last seen')} {relativeTime(d.last_checkin_at, now)}
                </div>
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-widest ${CHIP[conn]}`}>
                {tr(CHIP_LABEL[conn])}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Metric label={tr('Battery')}>
                {d.battery_pct === null ? (
                  <span className="text-neutral-600">{tr('No telemetry yet')}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    {d.charging ? <BatteryCharging size={12} /> : <Battery size={12} />}
                    {d.battery_pct}%{d.charging ? ` ${tr('charging')}` : ''}
                  </span>
                )}
              </Metric>
              <Metric label={tr('Signal (RSSI)')}>
                {d.rssi === null ? (
                  <span className="text-neutral-600">{tr('No telemetry yet')}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-cyan-400"><Wifi size={12} />{d.rssi} {tr('dBm')}</span>
                )}
              </Metric>
              <Metric label={tr('Firmware')}>{d.fw_version ?? <span className="text-neutral-600">-</span>}</Metric>
              <Metric label={tr('Session')}>
                {sessionOpen ? (
                  <span className="text-emerald-400">{trf('Open until {time}', { time: new Date(d.session_open_until!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</span>
                ) : (
                  <span className="text-neutral-500">{tr('Closed')}</span>
                )}
              </Metric>
              <Metric label={tr('State')}>{d.state ?? <span className="text-neutral-600">-</span>}</Metric>
              <Metric label={tr('Active workflow')}>{d.active_workflow ?? <span className="text-neutral-600">{tr('None')}</span>}</Metric>
            </div>

            {d.last_error && (
              <div className="flex items-start gap-1.5 text-[10px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1.5">
                <AlertCircle size={12} className="shrink-0 mt-px" />
                <span className="break-words min-w-0">{d.last_error}</span>
              </div>
            )}

            <TelemetrySparkline points={telemetryFor(d.device_id)} />
          </div>
        );
      })}
    </div>
  );
};
