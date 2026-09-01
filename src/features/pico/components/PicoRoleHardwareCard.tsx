import React, { useState } from 'react';
import { PicoDevice, PicoSession } from '../../../lib/picoAtoms';
import { useDeviceControl, OnyxChanFace } from '../useDeviceControl';
import { Cpu, Wifi, BatteryCharging, Radio, Shield, Zap, Terminal, Activity, CheckCircle2, AlertCircle, Unplug, Bot, Box, Smartphone, Monitor, User, Smile, MessageSquare, Send, Sparkles } from 'lucide-react';

interface PicoRoleHardwareCardProps {
  device: PicoDevice;
  session?: PicoSession | null;
  currentExpression?: string;
  onExpressionChange?: (expression: string) => void;
  onTtsSend?: (text: string) => void;
  onDisconnect?: (deviceId: string) => void;
  onSimulateScan?: (deviceId: string) => void;
  onConfigure?: (deviceId: string) => void;
}

export const PicoRoleHardwareCard: React.FC<PicoRoleHardwareCardProps> = ({
  device,
  session,
  currentExpression = 'Neutral',
  onExpressionChange,
  onTtsSend,
  onDisconnect,
  onSimulateScan,
  onConfigure,
}) => {
  const isConnected = session?.status === 'connected' && device.is_active;
  const isStackChan = device.hardware_model.includes('StackChan');
  
  const [ttsMessage, setTtsMessage] = useState('');
  const [faceExpression, setFaceExpression] = useState(currentExpression);

  const { setFace, say, showVendorCard, isDirectConnected } = useDeviceControl(device.device_mac || device.id || device.device_name, device.local_ip);

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
    if (model.includes('StackChan')) return <Bot className="text-rose-400" size={20} />;
    if (model.includes('ATOM')) return <Box className="text-amber-400" size={20} />;
    if (model.includes('StickS3') || model.includes('Cardputer')) return <Smartphone className="text-cyan-400" size={20} />;
    if (model.includes('CoreS3')) return <Monitor className="text-emerald-400" size={20} />;
    return <Cpu className="text-emerald-400" size={20} />;
  };

  // Sync external expression updates from simulator
  React.useEffect(() => {
    if (currentExpression) {
      setFaceExpression(currentExpression);
    }
  }, [currentExpression]);

  return (
    <div className={`relative group p-6 rounded-2xl border transition-all duration-300 backdrop-blur-xl ${
      isConnected 
        ? 'bg-neutral-900/60 border-emerald-500/30 shadow-[0_0_30px_rgba(168,85,247,0.08)]' 
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
            <div className="text-[11px] font-mono text-neutral-400 flex items-center gap-2">
              <span>MAC: {device.device_mac || '24:D7:EB:00:00:01'}</span>
              <span>•</span>
              <span className="text-neutral-500">{device.hardware_model}</span>
            </div>
            {device.owner_email && (
              <div className="text-[10px] font-mono text-purple-400/80 mt-0.5 flex items-center gap-1">
                <User size={10} />
                <span>Assigned to: <strong className="text-purple-300">{device.owner_email}</strong></span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold tracking-wider uppercase border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-400 text-[10px] font-bold tracking-wider uppercase border border-white/5">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-2 mb-5 p-3 rounded-xl bg-black/40 border border-white/5 text-center">
        <div>
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
            <BatteryCharging size={10} className="text-emerald-400" />
            Battery
          </div>
          <div className="text-xs font-mono font-bold text-emerald-400">{session?.battery ?? 88}%</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
            <Wifi size={10} className="text-cyan-400" />
            Signal (RSSI)
          </div>
          <div className="text-xs font-mono font-bold text-cyan-400">{session?.rssi ?? -48} dBm</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
            <Shield size={10} className="text-purple-400" />
            Firmware
          </div>
          <div className="text-xs font-mono font-bold text-neutral-300">v{device.firmware_version}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
            <Zap size={10} className="text-amber-400" />
            Accessories
          </div>
          <div className="text-xs font-mono font-bold text-neutral-300">{device.accessories.length} Unit(s)</div>
        </div>
      </div>

      {/* Accessories Badges */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {device.accessories.map((acc, idx) => (
          <span 
            key={idx}
            className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-[9px] font-mono text-amber-300/80 flex items-center gap-1"
          >
            <Radio size={10} className="text-amber-400" />
            {acc.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      {/* StackChan Robot Remote Controls */}
      {isStackChan && (
        <div className="mb-5 p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-purple-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Robot Remote</span>
            </div>
            <span className={`text-[9px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
              isDirectConnected
                ? 'text-cyan-300 bg-cyan-500/20 border-cyan-500/30'
                : 'text-purple-300 bg-purple-500/20 border-purple-500/30'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isDirectConnected ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`} />
              {isDirectConnected ? `WS: ${device.local_ip || 'LAN'}` : 'Supabase Only'}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Face Expression</label>
              <div className="flex items-center gap-2">
                <Smile size={14} className="text-neutral-400 shrink-0" />
                <select 
                  value={faceExpression}
                  onChange={(e) => {
                    const newExpr = e.target.value;
                    setFaceExpression(newExpr);
                    onExpressionChange?.(newExpr);
                    const mapped: OnyxChanFace = newExpr === 'Happy' ? 'happy' : newExpr === 'Angry' ? 'alert' : newExpr === 'Sad' ? 'calm' : newExpr === 'Sleepy' ? 'sleepy' : 'calm';
                    setFace(mapped);
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:border-purple-500 outline-none"
                >
                  {/* value is the wire protocol the onChange handler and the
                      hardware read — it stays English. Only the label is
                      translated. */}
                  <option value="Neutral">Neutral</option>
                  <option value="Happy">Happy</option>
                  <option value="Angry">Angry</option>
                  <option value="Sad">Sad</option>
                  <option value="Sleepy">Sleepy</option>
                  <option value="Doubt">Doubt</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Vendor Action</label>
              <button 
                onClick={() => {
                  showVendorCard('Ramses', device.device_name, [
                    'Status: Active Online',
                    'Role: ' + device.assigned_role,
                    'Battery: 98%',
                    'MAC: ' + (device.device_mac || 'Connected')
                  ]);
                }}
                className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg px-2 py-1 text-[11px] font-bold tracking-wider uppercase transition-colors"
              >
                Push Display Card
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Text to Speech (TTS)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MessageSquare size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input 
                  type="text" 
                  value={ttsMessage}
                  onChange={(e) => setTtsMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && ttsMessage.trim()) {
                      onTtsSend?.(ttsMessage.trim());
                      say(ttsMessage.trim());
                      setTtsMessage('');
                    }
                  }}
                  placeholder="Say something..." 
                  className="w-full bg-black/40 border border-white/10 rounded-lg pl-7 pr-2 py-1.5 text-xs text-white focus:border-purple-500 outline-none"
                />
              </div>
              <button 
                onClick={() => {
                  if (ttsMessage.trim()) {
                    onTtsSend?.(ttsMessage.trim());
                    say(ttsMessage.trim());
                    setTtsMessage('');
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 transition-colors"
              >
                <Send size={12} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Send</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Actions Bar */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-[10px] font-mono text-neutral-500">
          Last seen: <span className="text-neutral-400">{new Date(device.last_seen_at).toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-2">
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
