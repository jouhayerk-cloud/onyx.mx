import React, { useState } from 'react';
import { useAtom } from 'jotai';
import { picoWorkflowStateAtom, activePicoSessionAtom } from '../../../lib/picoAtoms';
import { Play, Square, Volume2, Lightbulb, MessageSquare, Send, CheckCircle2, AlertTriangle, Layers, Package, Tag, Compass } from 'lucide-react';

interface PicoWorkflowManagerProps {
  onSendFeedback?: (payload: { beep?: string; ledColor?: string; displayMsg?: string }) => void;
  onSetWorkflow?: (workflow: 'idle' | 'labeling' | 'packing' | 'cataloging' | 'tracking', metadata?: any) => void;
}

export const PicoWorkflowManager: React.FC<PicoWorkflowManagerProps> = ({ onSendFeedback, onSetWorkflow }) => {
  const [activeWorkflow, setActiveWorkflow] = useAtom(picoWorkflowStateAtom);
  const [session] = useAtom(activePicoSessionAtom);

  const [targetCrateId, setTargetCrateId] = useState('CRATE-2026-001');
  const [displayMsg, setDisplayMsg] = useState('Verified: Item Ready');
  const [ledColor, setLedColor] = useState('#10B981'); // Green default
  const [beepPattern, setBeepPattern] = useState<'success' | 'error' | 'double'>('success');

  const workflows: { id: 'idle' | 'labeling' | 'packing' | 'cataloging' | 'tracking'; label: string; icon: any; desc: string }[] = [
    { id: 'idle', label: 'Idle / Free Scan', icon: Layers, desc: 'Scans trigger standard item lookup & detail preview' },
    { id: 'labeling', label: 'Rapid Labeling', icon: Tag, desc: 'Scans auto-queue thermal BLE label print jobs' },
    { id: 'packing', label: 'Crate Packing', icon: Package, desc: 'Scans append inventory item IDs directly into target crate' },
    { id: 'cataloging', label: 'AI Cataloging', icon: Compass, desc: 'AtomS3R-CAM triggers photo capture & Voice AI metadata sync' },
    { id: 'tracking', label: 'UHF Tracking', icon: RadioIcon, desc: 'Continuous UHF RFID sweep logging signal RSSI & location' },
  ];

  function RadioIcon(props: any) {
    return (
      <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
        <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
        <circle cx="12" cy="12" r="2" />
        <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
        <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
      </svg>
    );
  }

  const handleWorkflowChange = (wId: 'idle' | 'labeling' | 'packing' | 'cataloging' | 'tracking') => {
    setActiveWorkflow(wId);
    if (onSetWorkflow) {
      onSetWorkflow(wId, wId === 'packing' ? { targetCrateId } : {});
    }
  };

  const handleTransmitFeedback = () => {
    if (onSendFeedback) {
      onSendFeedback({
        beep: beepPattern,
        ledColor,
        displayMsg,
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 rounded-2xl bg-neutral-950/60 border border-white/5 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Layers size={16} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">Terminal Workflow Suite</h3>
            <p className="text-[10px] font-mono text-neutral-400">Configure active warehouse mode & broadcast feedback commands</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono font-bold uppercase text-neutral-300">
          <span>Active:</span>
          <span className="text-indigo-400">{activeWorkflow.toUpperCase()}</span>
        </div>
      </div>

      {/* Workflow Mode Cards */}
      <div>
        <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">
          Select Operational Mode
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {workflows.map(w => {
            const Icon = w.icon;
            const isSelected = activeWorkflow === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => handleWorkflowChange(w.id)}
                className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all duration-300 ${
                  isSelected
                    ? 'bg-indigo-600/20 border-indigo-500/60 shadow-[0_0_20px_rgba(99,102,241,0.15)] text-white scale-[1.02]'
                    : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/5 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-indigo-500 text-white' : 'bg-white/5 text-neutral-400'}`}>
                    <Icon size={16} />
                  </div>
                  {isSelected && <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />}
                </div>
                <span className="text-xs font-bold tracking-wide mb-1">{w.label}</span>
                <span className="text-[9px] font-mono text-neutral-500 line-clamp-2 leading-relaxed">{w.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Workflow Metadata Configuration */}
      {activeWorkflow === 'packing' && (
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 animate-fade-in flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package size={20} className="text-amber-400 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Target Crate Assignment</h4>
              <p className="text-[10px] font-mono text-neutral-400">Scanned UHF RFID / Barcodes will be auto-appended to this crate manifest</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={targetCrateId}
              onChange={e => setTargetCrateId(e.target.value)}
              placeholder="e.g., CRATE-2026-001"
              className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-white text-xs font-mono uppercase focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => handleWorkflowChange('packing')}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase transition-colors"
            >
              Bind Crate
            </button>
          </div>
        </div>
      )}

      {/* Direct Hardware Feedback Suite */}
      <div className="pt-4 border-t border-white/5">
        <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">
          Transmit Hardware Feedback Command (OLED Screen / Buzzer / RGB LED)
        </label>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Beep Pattern */}
          <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300 mb-2">
              <Volume2 size={14} className="text-cyan-400" />
              <span>Audio Buzzer Alert</span>
            </div>
            <select
              value={beepPattern}
              onChange={e => setBeepPattern(e.target.value as any)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-white text-xs font-mono focus:outline-none"
            >
              <option value="success">Success (2 Short Beeps)</option>
              <option value="error">Error (Long Low Buzz)</option>
              <option value="double">Double Alert Beep</option>
            </select>
          </div>

          {/* LED Color */}
          <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300 mb-2">
              <Lightbulb size={14} className="text-amber-400" />
              <span>RGB LED Strip Color</span>
            </div>
            <div className="flex items-center gap-2">
              {(['#10B981', '#F43F5E', '#3B82F6', '#F59E0B', '#8B5CF6'] as const).map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setLedColor(color)}
                  style={{ backgroundColor: color }}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    ledColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                />
              ))}
              <input
                type="color"
                value={ledColor}
                onChange={e => setLedColor(e.target.value)}
                className="w-7 h-7 rounded-full bg-transparent border-0 cursor-pointer"
              />
            </div>
          </div>

          {/* OLED Display Message */}
          <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300 mb-2">
              <MessageSquare size={14} className="text-emerald-400" />
              <span>LCD / OLED Screen Text</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={displayMsg}
                onChange={e => setDisplayMsg(e.target.value)}
                placeholder="e.g., Verified: Art #104"
                className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-white text-xs font-mono focus:outline-none"
              />
              <button
                type="button"
                onClick={handleTransmitFeedback}
                className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 transition-colors shadow-md shadow-indigo-500/20"
                title="Send Command to Hardware"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
