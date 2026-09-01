import React, { useState } from 'react';
import { PicoScanEvent } from '../../../lib/picoAtoms';
import { Radio, QrCode, Barcode, Shield, Trash2, Filter, CheckCircle2, ArrowRight } from 'lucide-react';
import { tr } from '../../../lib/i18n';

interface PicoLiveLogProps {
  logs: (PicoScanEvent & { actionTaken?: string })[];
  onClearLogs?: () => void;
}

export const PicoLiveLog: React.FC<PicoLiveLogProps> = ({ logs, onClearLogs }) => {
  const [filter, setFilter] = useState<'ALL' | 'UHF_RFID' | 'NFC' | 'QR' | 'BARCODE'>('ALL');

  const filteredLogs = logs.filter(log => filter === 'ALL' || log.scanType === filter);

  const getIcon = (type: string) => {
    switch (type) {
      case 'UHF_RFID':
        return <Radio className="text-cyan-400" size={16} />;
      case 'NFC':
        return <Shield className="text-emerald-400" size={16} />;
      case 'QR':
        return <QrCode className="text-amber-400" size={16} />;
      case 'BARCODE':
        return <Barcode className="text-purple-400" size={16} />;
      default:
        return <Radio className="text-neutral-400" size={16} />;
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'UHF_RFID':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'NFC':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'QR':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'BARCODE':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      default:
        return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20';
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950/60 border border-white/5 rounded-2xl p-6 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Radio size={16} className="text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">{tr("Live Hardware Feed")}</h3>
            <p className="text-[10px] font-mono text-neutral-400">{tr("Real-time scan interception & event triggers")}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Filter Pills */}
          <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/5">
            {(['ALL', 'UHF_RFID', 'NFC', 'QR', 'BARCODE'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-wider uppercase transition-colors ${
                  filter === type 
                    ? 'bg-white/15 text-white shadow-sm' 
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {type === 'ALL' ? tr("All Scans") : type.replace('_', ' ')}
              </button>
            ))}
          </div>

          {onClearLogs && logs.length > 0 && (
            <button
              onClick={onClearLogs}
              title={tr("Clear Feed")}
              className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/10 text-neutral-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/20 transition-all"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Log Feed List */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[360px] scrollbar-thin scrollbar-thumb-white/10">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Radio size={32} className="text-neutral-700 mb-3 animate-pulse" />
            <p className="text-xs font-semibold text-neutral-500">{tr("No telemetry intercepted yet")}</p>
            <p className="text-[10px] font-mono text-neutral-600 mt-1">
              {tr("Trigger a scan from a connected M5Stack terminal or run a simulation.")}
            </p>
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div
              key={index}
              className="group flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                  {getIcon(log.scanType)}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono font-bold text-white tracking-wider">{log.tagId}</span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${getBadgeColor(log.scanType)}`}>
                      {log.scanType.replace('_', ' ')}
                    </span>
                    {log.rssi !== undefined && (
                      <span className="text-[10px] font-mono text-neutral-500">
                        ({log.rssi} {tr("dBm)")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400">
                    <span className="text-neutral-600">{tr("Action:")}</span>
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 size={12} />
                      {log.actionTaken || tr("LOGGED_TO_AUDIT")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-[10px] font-mono text-neutral-500 group-hover:text-neutral-400 transition-colors">
                {new Date(log.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
