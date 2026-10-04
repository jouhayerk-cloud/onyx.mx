import React from 'react';
import { BatteryCharging, Battery, Wifi, Mic, Volume2, Radio } from 'lucide-react';
import { tr, trf } from '../../../../lib/i18n';
import { type DeviceState, type TelemetryPoint } from '../../surfaces/types';
import { type DeviceExtra } from './deviceExtra';
import { StackChanFace } from './stackchan/StackChanFace';
import { HeadPoseGauge } from './stackchan/HeadPoseGauge';

interface StackChanTwinProps {
  device: DeviceState;
  points: TelemetryPoint[];
  extra?: DeviceExtra;
}

const formatUptime = (s: number) => {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
};

const getBars = (rssi: number) => {
  if (rssi > -50) return '████';
  if (rssi > -70) return '███_';
  if (rssi > -80) return '██__';
  if (rssi > -90) return '█___';
  return '____';
};

const StatusChip: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; active?: boolean; alert?: boolean; empty?: boolean }> = ({ label, value, icon, active, alert, empty }) => {
  let colorClass = 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30';
  if (empty) {
     colorClass = 'bg-neutral-800/10 text-neutral-600 border-neutral-700/30';
  } else if (alert) {
     colorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
  } else if (active) {
     colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  } else {
     colorClass = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
  }

  return (
    <div className={`flex flex-col gap-1.5 p-2.5 rounded-xl border ${colorClass}`}>
      <div className="flex items-center gap-1.5 opacity-80">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-xs font-mono font-bold mt-auto min-h-[1rem]">{value}</div>
    </div>
  );
};

const MicMeter = ({ level }: { level?: number }) => {
  if (level === undefined) return <span>{tr('Not reported')}</span>;
  const pct = Math.max(0, Math.min(100, Math.round(level * 100)));
  return (
    <div className="flex items-center gap-2 w-full" aria-label={trf('Mic level: {pct}%', { pct })}>
      <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0">{pct}%</span>
    </div>
  );
};

const Fact: React.FC<{ label: string; value: React.ReactNode; isError?: boolean }> = ({ label, value, isError }) => (
  <div className="flex flex-col py-2 border-b border-white/5 last:border-0">
    <dt className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{label}</dt>
    <dd className={`text-xs font-mono break-words ${isError ? 'text-rose-400' : 'text-white'}`}>{value}</dd>
  </div>
);

export const StackChanTwin: React.FC<StackChanTwinProps> = ({ device, points, extra }) => {
  const now = Date.now();
  const sessionOpen = !!device.session_open_until && Date.parse(device.session_open_until) > now;
  const isCharging = device.charging === true;

  const battValue = device.battery_pct === null ? tr('Not reported') : `${device.battery_pct}%`;
  const extraBatt = [];
  if (extra?.vbat_mv !== undefined) extraBatt.push(`${extra.vbat_mv} ${tr('mV')}`);
  if (extra?.charge_ma !== undefined) extraBatt.push(`${extra.charge_ma} ${tr('mA')}`);

  const temp = extra?.chip_temp_c ?? device.temp_c;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full max-w-5xl mx-auto">
      
      {/* Left Column: Avatar & Head Pose */}
      <div className="md:col-span-5 flex flex-col gap-4">
        <div className="p-3 bg-black/40 border border-white/5 rounded-[1.25rem] shadow-sm">
          <StackChanFace expression={extra?.expression} />
        </div>
        <HeadPoseGauge pan={extra?.head_pan_deg} tilt={extra?.head_tilt_deg} />
      </div>
      
      {/* Right Column: Chips & Facts */}
      <div className="md:col-span-7 flex flex-col gap-6">
        
        {/* Status Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatusChip 
            label={tr('Voice Session')} 
            icon={<Mic size={14} />} 
            active={sessionOpen} 
            empty={!device.session_open_until}
            value={!device.session_open_until ? tr('Not reported') : sessionOpen ? tr('Open') : tr('Closed')} 
          />
          <StatusChip 
            label={tr('NFC Unit')} 
            icon={<Radio size={14} />} 
            active={extra?.nfc === 'ready'} 
            alert={extra?.nfc === 'error'}
            empty={!extra?.nfc}
            value={!extra?.nfc ? tr('Not reported') : extra.nfc} 
          />
          <StatusChip 
            label={tr('Microphone')} 
            icon={<Mic size={14} />} 
            empty={extra?.mic_level === undefined}
            value={<MicMeter level={extra?.mic_level} />}
          />
          <StatusChip 
            label={tr('Speaker')} 
            icon={<Volume2 size={14} />} 
            empty={extra?.volume === undefined}
            value={extra?.volume === undefined ? tr('Not reported') : `${extra.volume}%`}
          />
          <StatusChip 
            label={tr('Battery')} 
            icon={isCharging ? <BatteryCharging size={14} /> : <Battery size={14} />} 
            active={isCharging}
            alert={device.battery_pct !== null && device.battery_pct < 20 && !isCharging}
            empty={device.battery_pct === null}
            value={
              <div className="flex flex-col gap-0.5">
                <div>{battValue} {isCharging ? `(${tr('charging')})` : ''}</div>
                {extraBatt.length > 0 && <div className="text-[9px] opacity-70 font-normal">{extraBatt.join(', ')}</div>}
              </div>
            }
          />
          <StatusChip 
            label={tr('Wi-Fi')} 
            icon={<Wifi size={14} />} 
            empty={device.rssi === null}
            alert={device.rssi !== null && device.rssi < -85}
            value={device.rssi === null ? tr('Not reported') : (
              <div className="flex justify-between w-full items-center" aria-label={trf('Signal {rssi} dBm', { rssi: device.rssi })}>
                <span>{device.rssi} {tr('dBm')}</span>
                <span className="tracking-[0.1em] text-[10px] opacity-80">{getBars(device.rssi)}</span>
              </div>
            )}
          />
        </div>

        {/* Definition List */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 bg-black/40 border border-white/5 rounded-xl p-4 m-0">
          <Fact label={tr('Firmware')} value={device.fw_version ?? <span className="text-neutral-600">{tr('Not reported')}</span>} />
          <Fact label={tr('Uptime')} value={extra?.uptime_s === undefined ? <span className="text-neutral-600">{tr('Not reported')}</span> : formatUptime(extra.uptime_s)} />
          <Fact label={tr('Temperature')} value={temp === null || temp === undefined ? <span className="text-neutral-600">{tr('Not reported')}</span> : `${temp} ${tr('°C')}`} />
          <Fact label={tr('Last Error')} isError={!!device.last_error} value={device.last_error ?? <span className="text-neutral-500">{tr('None')}</span>} />
        </dl>
      </div>
    </div>
  );
};
