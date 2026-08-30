import React from 'react';
import { Wifi, Radio, Zap, RefreshCw, Activity, CheckCircle2, AlertCircle, Shield, Globe } from 'lucide-react';
import { StackChanSocketState } from '../useStackChanSocket';

interface PicoDualChannelMonitorProps {
  directSocket: StackChanSocketState;
  isDirectConnected: boolean;
  localIp?: string;
  onReconnectDirect: () => void;
  supabaseChannelStatus?: 'connected' | 'connecting' | 'error' | 'disconnected';
  eventCount?: number;
  className?: string;
}

export const PicoDualChannelMonitor: React.FC<PicoDualChannelMonitorProps> = ({
  directSocket,
  isDirectConnected,
  localIp = '192.168.1.137',
  onReconnectDirect,
  supabaseChannelStatus = 'connected',
  eventCount = 0,
  className = '',
}) => {
  const getLatencyBadge = (latency: number | null) => {
    if (latency === null) return null;
    if (latency < 30) {
      return <span className="text-emerald-400 font-mono text-[10px] font-bold">{latency}ms (Zero-Lag)</span>;
    }
    if (latency < 100) {
      return <span className="text-amber-400 font-mono text-[10px] font-bold">{latency}ms (Fast)</span>;
    }
    return <span className="text-rose-400 font-mono text-[10px] font-bold">{latency}ms (Slow)</span>;
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
      {/* Channel 1: Direct LAN WebSocket */}
      <div className={`p-4 rounded-2xl border transition-all duration-300 backdrop-blur-xl ${
        isDirectConnected
          ? 'bg-cyan-950/30 border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
          : directSocket.status === 'connecting'
          ? 'bg-amber-950/20 border-amber-500/30'
          : 'bg-neutral-900/60 border-white/10'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
              isDirectConnected 
                ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400' 
                : 'bg-white/5 border-white/10 text-neutral-400'
            }`}>
              <Wifi size={16} className={isDirectConnected ? 'animate-pulse' : ''} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Channel 1: Direct LAN WS</h4>
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                  isDirectConnected
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                    : directSocket.status === 'connecting'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                }`}>
                  {isDirectConnected ? 'Active / 0-Latency' : directSocket.status.toUpperCase()}
                </span>
              </div>
              <p className="text-[10px] font-mono text-neutral-400">Local ESP32 WebSocket bridge (Factory & Custom)</p>
            </div>
          </div>

          {!isDirectConnected && (
            <button
              onClick={onReconnectDirect}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-300 text-xs transition-colors flex items-center gap-1"
              title="Retry Direct Connection"
            >
              <RefreshCw size={12} className={directSocket.status === 'connecting' ? 'animate-spin' : ''} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5 text-center text-[10px] font-mono">
          <div>
            <span className="text-neutral-500 block uppercase text-[8px] font-bold">Target IP</span>
            <span className="text-neutral-200 font-bold truncate block">{localIp}</span>
          </div>
          <div>
            <span className="text-neutral-500 block uppercase text-[8px] font-bold">Latency</span>
            {isDirectConnected ? getLatencyBadge(directSocket.latencyMs) : <span className="text-neutral-500">N/A</span>}
          </div>
          <div>
            <span className="text-neutral-500 block uppercase text-[8px] font-bold">Protocol</span>
            <span className="text-cyan-400 font-bold">ws://:80/ws</span>
          </div>
        </div>
      </div>

      {/* Channel 2: Supabase Realtime (WAN Cloud) */}
      <div className={`p-4 rounded-2xl border transition-all duration-300 backdrop-blur-xl ${
        supabaseChannelStatus === 'connected'
          ? 'bg-purple-950/30 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.1)]'
          : 'bg-neutral-900/60 border-white/10'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Globe size={16} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Channel 2: Supabase Realtime</h4>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[8px] font-black uppercase tracking-widest border border-purple-500/30">
                  Global WAN
                </span>
              </div>
              <p className="text-[10px] font-mono text-neutral-400">Cloud telemetry relay & remote multi-device sync</p>
            </div>
          </div>

          <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            <CheckCircle2 size={11} />
            Subscribed
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5 text-center text-[10px] font-mono">
          <div>
            <span className="text-neutral-500 block uppercase text-[8px] font-bold">Channel</span>
            <span className="text-neutral-200 font-bold truncate block">pico-bridge-global</span>
          </div>
          <div>
            <span className="text-neutral-500 block uppercase text-[8px] font-bold">Telemetry</span>
            <span className="text-purple-300 font-bold">{eventCount} Events</span>
          </div>
          <div>
            <span className="text-neutral-500 block uppercase text-[8px] font-bold">Security</span>
            <span className="text-emerald-400 font-bold">TLS WSS</span>
          </div>
        </div>
      </div>
    </div>
  );
};
