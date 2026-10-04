import React from 'react';
import { Battery, BatteryCharging, Wifi, QrCode, ScanLine, AlertCircle } from 'lucide-react';
import { tr } from '../../../../lib/i18n';
import type { DeviceState, TelemetryPoint, PackingState } from '../../surfaces/types';
import type { DeviceExtra } from './deviceExtra';

interface StickS3TwinProps {
  device: DeviceState;
  points: TelemetryPoint[];
  extra?: DeviceExtra;
  packing?: PackingState | null;
}

const Metric: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{label}</div>
    <div className="text-xs font-mono font-bold text-white">{children}</div>
  </div>
);

export const StickS3Twin: React.FC<StickS3TwinProps> = ({ device, points, extra, packing }) => {
  const renderScreen = () => {
    const screenState = extra?.screen || 'unknown';
    
    switch (screenState) {
      case 'idle':
        return (
          <div className="flex flex-col items-center justify-center h-full bg-black text-white p-2 text-center">
            <ScanLine size={28} className="mb-3 text-neutral-400" />
            <span className="text-xs font-bold">{tr('Ready to scan')}</span>
          </div>
        );
      case 'scan':
        return (
          <div className="flex flex-col items-center justify-center h-full bg-black text-white p-2 text-center">
            <QrCode size={28} className="mb-3 text-emerald-400" />
            <span className="text-xs font-mono break-all line-clamp-2 px-2 text-emerald-300">
              {extra?.last_scan || tr('Scanning...')}
            </span>
          </div>
        );
      case 'item':
        return (
          <div className="flex flex-col h-full bg-black text-white overflow-hidden relative">
             <div className="absolute left-0 top-0 bottom-0 w-2 bg-blue-500"></div>
             <div className="pl-5 p-3 flex flex-col h-full justify-between">
               <div className="text-sm font-bold line-clamp-2 mt-1">{extra?.last_scan || tr('Unknown Item')}</div>
               <div className="self-start px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase mb-1">
                 {tr('Scanned')}
               </div>
             </div>
          </div>
        );
      case 'packing': {
        const nOfM = packing ? `${packing.scanned.length} / ${packing.expected.length}` : '- / -';
        const isWrong = packing?.wrong && packing.wrong.length > 0;
        return (
          <div className={`flex flex-col items-center justify-center h-full p-2 text-center ${isWrong ? 'bg-rose-950 text-white' : 'bg-black text-white'}`}>
            <div className={`text-[10px] font-mono uppercase tracking-wider mb-2 ${isWrong ? 'text-rose-200/70' : 'text-neutral-400'}`}>
              {packing?.crate || tr('No Crate')}
            </div>
            <div className={`text-3xl font-bold tracking-tight ${isWrong ? 'text-rose-400' : 'text-emerald-400'}`}>
              {nOfM}
            </div>
            {isWrong && (
              <div className="text-[10px] text-rose-300 font-bold bg-rose-900/80 px-2 py-1 rounded mt-2 flex items-center gap-1.5 shadow-sm">
                <AlertCircle size={12} />
                {tr('Wrong item')}
              </div>
            )}
          </div>
        );
      }
      case 'offline':
        return (
          <div className="flex flex-col items-center justify-center h-full bg-black text-neutral-400 p-2 text-center">
            <Wifi size={28} className="mb-3 opacity-30" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{tr('Offline')}</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center h-full bg-black text-neutral-700">
            <span className="text-[10px] uppercase tracking-widest">{tr('No signal')}</span>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center pt-2">
        {/* The top button hint */}
        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3 translate-x-14">
          {tr('BTN B')}
        </div>
        
        {/* Device Container */}
        <div className="glass-panel p-3.5 rounded-[1.25rem] flex items-center gap-5 shadow-xl">
          <div className="w-[240px] h-[135px] bg-black rounded-md overflow-hidden relative shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)] ring-1 ring-white/5 shrink-0">
            {renderScreen()}
          </div>
          
          <div className="flex flex-col items-center justify-center gap-2.5 pr-1">
            <div className="w-9 h-9 rounded-full border border-white/5 flex items-center justify-center text-[10px] font-bold text-neutral-400 bg-neutral-900/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
              M5
            </div>
            <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">{tr('BTN A')}</span>
          </div>
        </div>

        {/* The bottom button hint */}
        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-3 -translate-x-20">
          {tr('PWR')}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 rounded-xl bg-black/40 border border-white/5">
        <Metric label={tr('Scanner Unit')}>
          <div className="flex flex-col gap-1.5 items-start">
            {extra?.scanner === 'ready' ? (
              <span className="px-2 py-0.5 rounded border border-emerald-500/20 text-emerald-400 text-[9px] uppercase font-bold tracking-wider">{tr('Ready')}</span>
            ) : extra?.scanner === 'error' ? (
              <span className="px-2 py-0.5 rounded border border-rose-500/20 text-rose-400 text-[9px] uppercase font-bold tracking-wider">{tr('Error')}</span>
            ) : (
              <span className="px-2 py-0.5 rounded border border-neutral-500/20 text-neutral-400 text-[9px] uppercase font-bold tracking-wider">{tr('None')}</span>
            )}
            <span className="text-[10px] text-neutral-500">{tr('QR/barcode on Grove')}</span>
          </div>
        </Metric>

        <Metric label={tr('Battery (PMIC)')}>
          {device.battery_pct !== null || extra?.vbat_mv !== undefined || extra?.charge_ma !== undefined ? (
            <div className="flex flex-col gap-1.5">
              {device.battery_pct !== null && (
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  {device.charging ? <BatteryCharging size={14} /> : <Battery size={14} />}
                  {device.battery_pct}%{device.charging ? ` ${tr('charging')}` : ''}
                </span>
              )}
              {(extra?.vbat_mv !== undefined || extra?.charge_ma !== undefined) && (
                <span className="text-[10px] text-neutral-500 font-sans">
                  {extra?.vbat_mv !== undefined ? `${extra.vbat_mv}mV` : ''}
                  {extra?.vbat_mv !== undefined && extra?.charge_ma !== undefined ? ' · ' : ''}
                  {extra?.charge_ma !== undefined ? `${extra.charge_ma}mA` : ''}
                </span>
              )}
            </div>
          ) : (
            <span className="text-neutral-600">{tr('Not reported')}</span>
          )}
        </Metric>

        <Metric label={tr('Signal')}>
          {device.rssi !== null ? (
            <div className="flex items-center gap-2">
              <div className="flex items-end gap-0.5 h-3">
                <div className={`w-1 bg-cyan-400 rounded-sm ${device.rssi >= -90 ? 'h-1.5' : 'h-1 bg-cyan-900'}`}></div>
                <div className={`w-1 bg-cyan-400 rounded-sm ${device.rssi >= -80 ? 'h-2' : 'h-1 bg-cyan-900'}`}></div>
                <div className={`w-1 bg-cyan-400 rounded-sm ${device.rssi >= -70 ? 'h-2.5' : 'h-1 bg-cyan-900'}`}></div>
                <div className={`w-1 bg-cyan-400 rounded-sm ${device.rssi >= -60 ? 'h-3' : 'h-1 bg-cyan-900'}`}></div>
              </div>
              <span className="text-cyan-400">
                {device.rssi} {tr('dBm')}
              </span>
            </div>
          ) : (
            <span className="text-neutral-600">{tr('Not reported')}</span>
          )}
        </Metric>

        <Metric label={tr('Firmware')}>
          {device.fw_version || <span className="text-neutral-600">{tr('Not reported')}</span>}
        </Metric>

        <Metric label={tr('Uptime')}>
          {extra?.uptime_s !== undefined ? (
            <span>{extra.uptime_s}s</span>
          ) : (
            <span className="text-neutral-600">{tr('Not reported')}</span>
          )}
        </Metric>

        <Metric label={tr('Chip Temp')}>
          {extra?.chip_temp_c !== undefined ? (
            <span>{extra.chip_temp_c}°C</span>
          ) : (
            <span className="text-neutral-600">{tr('Not reported')}</span>
          )}
        </Metric>

        <Metric label={tr('Last Scan')}>
          {extra?.last_scan ? (
            <span className="break-all text-white font-sans text-xs">{extra.last_scan}</span>
          ) : (
            <span className="text-neutral-600">{tr('Not reported')}</span>
          )}
        </Metric>

        <Metric label={tr('Offline Queue')}>
          {extra?.offline_queue_len !== undefined ? (
            <span>{extra.offline_queue_len} {tr('items')}</span>
          ) : (
            <span className="text-neutral-600">{tr('Not reported')}</span>
          )}
        </Metric>

        <Metric label={tr('Active workflow')}>
          {device.active_workflow ? (
            <span className="text-neutral-300 font-sans text-xs">{device.active_workflow}</span>
          ) : (
            <span className="text-neutral-600">{tr('Not reported')}</span>
          )}
        </Metric>
      </div>
    </div>
  );
};
