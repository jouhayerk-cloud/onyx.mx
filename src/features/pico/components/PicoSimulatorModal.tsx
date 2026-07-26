import React, { useState } from 'react';
import { useSetAtom } from 'jotai';
import { picoRealtimePayloadAtom, PicoScanEvent } from '../../../lib/picoAtoms';
import { Zap, Radio, QrCode, Barcode, Shield, X, Send, Sliders } from 'lucide-react';

interface PicoSimulatorModalProps {
  onClose: () => void;
  deviceId?: string;
}

const PRESET_TAGS = [
  { label: 'Art Piece #104 (RFID)', id: 'SU1004AB', type: 'UHF_RFID', rssi: -45 },
  { label: 'Pallet Box A (RFID)', id: 'SU8821PL', type: 'UHF_RFID', rssi: -72 },
  { label: 'Secure NFC Token 9', id: 'NFC-SEC-0922', type: 'NFC', rssi: -30 },
  { label: 'Crate QR Manifest', id: 'CRATE-2026-001', type: 'QR', rssi: -35 },
  { label: 'Vendor Barcode #77', id: '8901234567890', type: 'BARCODE', rssi: -40 },
];

export const PicoSimulatorModal: React.FC<PicoSimulatorModalProps> = ({ onClose, deviceId = 'simulated-device-001' }) => {
  const setRealtimePayload = useSetAtom(picoRealtimePayloadAtom);
  const [scanType, setScanType] = useState<'UHF_RFID' | 'NFC' | 'QR' | 'BARCODE'>('UHF_RFID');
  const [tagId, setTagId] = useState('SU1004AB');
  const [rssi, setRssi] = useState(-50);

  const handlePresetSelect = (preset: typeof PRESET_TAGS[0]) => {
    setScanType(preset.type as any);
    setTagId(preset.id);
    setRssi(preset.rssi);
  };

  const handleInject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagId.trim()) return;

    const payload: PicoScanEvent = {
      deviceId,
      scanType,
      tagId: tagId.trim(),
      rssi: scanType === 'UHF_RFID' ? rssi : undefined,
      timestamp: Date.now(),
    };

    // Inject directly into the Jotai atom stream
    setRealtimePayload(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl p-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Zap size={20} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">Hardware Test Harness</h3>
              <p className="text-[11px] font-mono text-neutral-400">Simulate ESP32 telemetry & RFID scan injection</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Preset Quick Select */}
        <div className="mb-5">
          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
            Quick Test Presets
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_TAGS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handlePresetSelect(p)}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-mono text-neutral-300 transition-colors flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleInject} className="space-y-4">
          {/* Scan Type Selector */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">
              Sensor Protocol
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['UHF_RFID', 'NFC', 'QR', 'BARCODE'] as const).map(type => {
                const isSelected = scanType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setScanType(type)}
                    className={`py-2 px-1 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-500 text-white font-bold'
                        : 'bg-white/5 border-white/5 text-neutral-400 hover:text-neutral-200 text-xs'
                    }`}
                  >
                    {type === 'UHF_RFID' ? 'UHF RFID' : type}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tag ID Input */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">
              Scanned Tag / Barcode Payload
            </label>
            <input
              type="text"
              value={tagId}
              onChange={e => setTagId(e.target.value)}
              placeholder="e.g., SU1004AB"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-sm font-mono font-bold tracking-wider focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          {/* RSSI Distance Slider for UHF RFID */}
          {scanType === 'UHF_RFID' && (
            <div className="p-3.5 rounded-xl bg-black/30 border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Sliders size={12} className="text-cyan-400" />
                  Simulated Signal Strength (RSSI)
                </label>
                <span className={`text-xs font-mono font-bold ${rssi < -65 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {rssi} dBm {rssi < -65 ? '(Weak / Far)' : '(Strong / Near)'}
                </span>
              </div>
              <input
                type="range"
                min="-90"
                max="-30"
                value={rssi}
                onChange={e => setRssi(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] font-mono text-neutral-600 mt-1">
                <span>-90 dBm (Distant)</span>
                <span>-65 dBm (Cutoff)</span>
                <span>-30 dBm (Touch)</span>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold tracking-wide transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold tracking-wider uppercase transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
            >
              <Send size={14} />
              Inject Scan Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
