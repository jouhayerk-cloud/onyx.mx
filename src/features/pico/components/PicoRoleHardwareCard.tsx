import React from 'react';
import { PicoDevice, PicoSession } from '../../../lib/picoAtoms';
import { Cpu, Wifi, BatteryCharging, Radio, Shield, Zap, Terminal, Activity, CheckCircle2, AlertCircle, Unplug } from 'lucide-react';

interface PicoRoleHardwareCardProps {
  device: PicoDevice;
  session?: PicoSession | null;
  onDisconnect?: (deviceId: string) => void;
  onSimulateScan?: (deviceId: string) => void;
  onConfigure?: (deviceId: string) => void;
}

export const PicoRoleHardwareCard: React.FC<PicoRoleHardwareCardProps> = ({
  device,
  session,
  onDisconnect,
  onSimulateScan,
  onConfigure,
}) => {
  const isConnected = session?.status === 'connected' && device.is_active;

  // Role Color Styling
  const getRoleBadgeStyle = (role: string) => {
    switch (role.toLowerCase()) {
      case 'developer':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'admin':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'vendor':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'staff':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'user':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30';
    }
  };

  const getHardwareIcon = (model: string) => {
    if (model.includes('Tab5')) return <Terminal className="text-purple-400" size={20} />;
    if (model.includes('StackChan')) return <Zap className="text-rose-400" size={20} />;
    if (model.includes('Atom') || model.includes('CAM')) return <Activity className="text-amber-400" size={20} />;
    if (model.includes('StickS3')) return <Radio className="text-cyan-400" size={20} />;
    return <Cpu className="text-emerald-400" size={20} />;
  };

  return (
    <div className={`relative group p-6 rounded-2xl border transition-all duration-300 backdrop-blur-xl ${
      isConnected 
        ? 'bg-neutral-900/60 border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.05)]' 
        : 'bg-neutral-950/40 border-white/5 opacity-75 hover:opacity-100 hover:border-white/10'
    }`}>
      {/* Top Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform duration-300">
            {getHardwareIcon(device.hardware_model)}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-white tracking-wide">{device.device_name}</h3>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${getRoleBadgeStyle(device.assigned_role)}`}>
                {device.assigned_role}
              </span>
            </div>
            <p className="text-[11px] font-mono text-neutral-400 flex items-center gap-2">
              <span className="text-neutral-500">MAC:</span> {device.device_mac}
              <span className="text-neutral-600">•</span>
              <span className="text-neutral-300 font-semibold">{device.hardware_model}</span>
            </p>
          </div>
        </div>

        {/* Live Status Indicator */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
            isConnected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-neutral-800/40 text-neutral-500 border-neutral-700/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
            {isConnected ? 'Connected' : 'Offline'}
          </div>
        </div>
      </div>

      {/* Metrics & Accessories Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-y border-white/5 my-4 bg-black/20 rounded-xl px-4">
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Battery</span>
          <div className="flex items-center gap-1.5 text-xs font-mono text-neutral-200 mt-0.5">
            <BatteryCharging size={13} className={session?.battery && session.battery < 20 ? 'text-rose-400' : 'text-emerald-400'} />
            {session?.battery !== undefined ? `${session.battery}%` : 'N/A'}
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Signal (RSSI)</span>
          <div className="flex items-center gap-1.5 text-xs font-mono text-neutral-200 mt-0.5">
            <Wifi size={13} className="text-cyan-400" />
            {session?.rssi !== undefined ? `${session.rssi} dBm` : '-65 dBm'}
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Firmware</span>
          <div className="text-xs font-mono text-neutral-300 mt-0.5">
            v{device.firmware_version || '1.0.0'}
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Accessories</span>
          <div className="text-[11px] font-semibold text-neutral-300 mt-0.5 truncate" title={device.accessories.join(', ')}>
            {device.accessories && device.accessories.length > 0 ? device.accessories.length + ' Unit(s)' : 'None'}
          </div>
        </div>
      </div>

      {/* Accessory Badges */}
      {device.accessories && device.accessories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {device.accessories.map((acc, index) => (
            <span key={index} className="px-2 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] font-mono text-neutral-300 flex items-center gap-1.5">
              <Radio size={11} className="text-amber-400" />
              {acc.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Bottom Actions Bar */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-[10px] font-mono text-neutral-500">
          Last seen: <span className="text-neutral-400">{new Date(device.last_seen_at).toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-2">
          {onSimulateScan && (
            <button
              onClick={() => onSimulateScan(device.id)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-[11px] font-semibold tracking-wider transition-colors border border-white/10 flex items-center gap-1.5"
            >
              <Zap size={12} className="text-amber-400" />
              Simulate Scan
            </button>
          )}
          {onConfigure && (
            <button
              onClick={() => onConfigure(device.id)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 text-[11px] font-semibold tracking-wider transition-colors border border-white/5"
            >
              Configure
            </button>
          )}
          {isConnected && onDisconnect && (
            <button
              onClick={() => onDisconnect(device.id)}
              title="Disconnect Session"
              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
            >
              <Unplug size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
