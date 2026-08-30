import React, { useState } from 'react';
import { Bluetooth, RefreshCw, CheckCircle2, AlertCircle, Shield, Bot, Zap, BatteryCharging, Radio, X, ArrowRight, Sparkles } from 'lucide-react';
import { useBleDevice, BleState } from '../useBleDevice';
import { PicoDevice } from '../../../lib/picoAtoms';

interface PicoBleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDevicePaired: (device: PicoDevice) => void;
}

export const PicoBleModal: React.FC<PicoBleModalProps> = ({ isOpen, onClose, onDevicePaired }) => {
  const { state, pair, disconnect, isWebBluetoothSupported } = useBleDevice();
  const [isPairing, setIsPairing] = useState(false);

  if (!isOpen) return null;

  const handleStartPairing = async () => {
    setIsPairing(true);
    try {
      const pairedDevice = await pair();
      if (pairedDevice) {
        onDevicePaired(pairedDevice);
      }
    } finally {
      setIsPairing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-neutral-900 border border-purple-500/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(168,85,247,0.2)] relative overflow-hidden">
        
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent" />

        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shadow-inner">
              <Bluetooth size={20} className="text-purple-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">Web Bluetooth (BLE) Pairing</h3>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[9px] font-black uppercase tracking-widest border border-purple-500/30">
                  Chrome / Edge
                </span>
              </div>
              <p className="text-[11px] font-mono text-neutral-400">Discover and pair directly with <strong className="text-purple-300">OnyxChan-XXXX</strong></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Web Bluetooth Support Check */}
        {!isWebBluetoothSupported && (
          <div className="mb-5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-300 text-xs">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block mb-1">Web Bluetooth Not Detected</strong>
              Your browser does not support the Web Bluetooth API. Please launch Onyx.mx in <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> with Bluetooth enabled on your computer or mobile device.
            </div>
          </div>
        )}

        {/* Status Display Card */}
        <div className="p-5 rounded-2xl bg-black/50 border border-white/10 mb-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
          {state.status === 'connected' ? (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3 text-emerald-400 animate-bounce">
                <CheckCircle2 size={32} />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">Paired & Connected!</h4>
              <p className="text-xs font-mono text-emerald-400 font-bold mb-4">{state.deviceName}</p>
              
              <div className="grid grid-cols-3 gap-3 w-full max-w-xs p-3 rounded-xl bg-white/5 border border-white/5 text-center">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block mb-0.5">Battery</span>
                  <span className="text-xs font-mono font-bold text-emerald-400 flex items-center justify-center gap-1">
                    <BatteryCharging size={12} />
                    {state.batteryLevel ?? 92}%
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block mb-0.5">Channel</span>
                  <span className="text-xs font-mono font-bold text-purple-300">BLE UART</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block mb-0.5">Status</span>
                  <span className="text-xs font-mono font-bold text-cyan-400">Active</span>
                </div>
              </div>
            </>
          ) : isPairing || state.status === 'scanning' || state.status === 'connecting' ? (
            <>
              <div className="w-16 h-16 rounded-full bg-purple-600/20 border border-purple-500/40 flex items-center justify-center mb-3 text-purple-400">
                <RefreshCw size={28} className="animate-spin" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">Searching for OnyxChan BLE Beacons...</h4>
              <p className="text-xs font-mono text-neutral-400">
                Select your <strong>OnyxChan-XXXX</strong> or M5Stack CoreS3 in the browser prompt.
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-purple-600/10 border border-purple-500/20 flex items-center justify-center mb-3 text-purple-400">
                <Bot size={32} />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">Ready to Pair Robot</h4>
              <p className="text-xs font-mono text-neutral-400 max-w-sm">
                Ensure your StackChan desktop robot is powered on with BLE firmware active.
              </p>
            </>
          )}

          {state.lastError && (
            <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-rose-400 text-xs text-left w-full">
              <AlertCircle size={16} className="shrink-0" />
              <span>{state.lastError}</span>
            </div>
          )}
        </div>

        {/* Pairing Instructions */}
        <div className="space-y-2 mb-6 text-xs text-neutral-400 bg-white/[0.02] p-4 rounded-xl border border-white/5 font-mono">
          <div className="flex items-center gap-2 text-neutral-300 font-bold uppercase text-[10px] tracking-wider mb-1">
            <Sparkles size={12} className="text-purple-400" />
            Quick Pairing Guide:
          </div>
          <div className="flex items-start gap-2">
            <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-300 text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
            <span>Power on your M5Stack CoreS3 / StackChan robot.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-300 text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
            <span>Click <strong>"Start BLE Discovery"</strong> below to open the native browser BLE picker.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-300 text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
            <span>Select <strong>OnyxChan-XXXX</strong> from the device list to establish zero-latency control.</span>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold tracking-wide transition-colors"
          >
            {state.status === 'connected' ? 'Done' : 'Cancel'}
          </button>
          
          {state.status === 'connected' ? (
            <button
              type="button"
              onClick={disconnect}
              className="px-4 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold tracking-wider uppercase transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              disabled={isPairing || !isWebBluetoothSupported}
              onClick={handleStartPairing}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold tracking-wider uppercase transition-all shadow-lg shadow-purple-500/25 flex items-center gap-2"
            >
              {isPairing ? <RefreshCw size={14} className="animate-spin" /> : <Bluetooth size={14} />}
              {isPairing ? 'Pairing...' : 'Start BLE Discovery'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
