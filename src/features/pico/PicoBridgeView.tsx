import React, { useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { picoDevicesAtom, activePicoSessionAtom, picoRssiThresholdAtom, PicoDevice, PicoScanEvent } from '../../lib/picoAtoms';
import { PicoRoleHardwareCard } from './components/PicoRoleHardwareCard';
import { PicoDeviceRegistry } from './components/PicoDeviceRegistry';
import { PicoWorkflowManager } from './components/PicoWorkflowManager';
import { PicoLiveLog } from './components/PicoLiveLog';
import { PicoRealtimeController } from './components/PicoRealtimeController';
import { PicoSimulatorModal } from './components/PicoSimulatorModal';
import { Terminal, Plus, Zap, Sliders, Radio, Shield, RefreshCw, Unplug, AlertCircle } from 'lucide-react';

export function PicoBridgeView() {
  const [devices, setDevices] = useAtom(picoDevicesAtom);
  const [activeSession, setActiveSession] = useAtom(activePicoSessionAtom);
  const [rssiThreshold, setRssiThreshold] = useAtom(picoRssiThresholdAtom);

  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [selectedSimDeviceId, setSelectedSimDeviceId] = useState<string | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);

  const [scanLogs, setScanLogs] = useState<(PicoScanEvent & { actionTaken?: string })[]>([]);

  // Default seed device if registry is empty
  const defaultDevices: PicoDevice[] = devices.length > 0 ? devices : [
    {
      id: 'pico-dev-01',
      device_name: 'Warehouse North Dock #1',
      device_mac: '24:0A:C4:00:11:22',
      hardware_model: 'M5StickS3 ESP32S3 Mini IoT Dev Kit',
      assigned_role: 'Staff',
      owner_user_id: 'local-admin',
      owner_email: 'admin@onyx.mx',
      accessories: ['UHF_RFID_JRD4035', 'QR_SCANNER_STM32F030'],
      firmware_version: '1.2.0',
      is_active: true,
      last_seen_at: new Date().toISOString(),
    },
    {
      id: 'pico-dev-02',
      device_name: 'AI Robotics Controller',
      device_mac: '30:AE:A4:12:88:99',
      hardware_model: 'M5StackChan AI Desktop Robot (ESP32-S3)',
      assigned_role: 'Admin',
      owner_user_id: 'local-admin',
      owner_email: 'admin@onyx.mx',
      accessories: ['NFC_ST25R3916', 'BARCODE_BASE_2'],
      firmware_version: '2.0.1',
      is_active: true,
      last_seen_at: new Date(Date.now() - 3600000).toISOString(),
    }
  ];

  const activeDevicesList = devices.length > 0 ? devices : defaultDevices;

  const handleRegisterDevice = (newDev: Omit<PicoDevice, 'id' | 'last_seen_at' | 'is_active'>) => {
    const created: PicoDevice = {
      ...newDev,
      id: 'pico-' + Math.random().toString(36).substr(2, 9),
      is_active: true,
      last_seen_at: new Date().toISOString(),
    };
    setDevices([...activeDevicesList, created]);
    setIsRegistryOpen(false);
  };

  const handleDisconnect = (deviceId: string) => {
    if (activeSession && activeSession.device_id === deviceId) {
      setActiveSession(null);
    }
    setDevices(activeDevicesList.map(d => d.id === deviceId ? { ...d, is_active: false } : d));
  };

  const handleOpenSimulator = (deviceId?: string) => {
    setSelectedSimDeviceId(deviceId);
    setIsSimulatorOpen(true);
  };

  const handleLogScan = (log: PicoScanEvent & { actionTaken?: string }) => {
    setScanLogs(prev => [log, ...prev].slice(0, 100)); // Keep last 100 scans
  };

  const handleSendFeedback = (payload: { beep?: string; ledColor?: string; displayMsg?: string }) => {
    console.log('[PicoBridge Broadcast] Transmitting feedback to M5Stack terminals:', payload);
    // Add audio/visual confirmation in dashboard
    const simulatedResponseLog: PicoScanEvent & { actionTaken?: string } = {
      deviceId: activeDevicesList[0]?.id || 'global-broadcast',
      scanType: 'NFC',
      tagId: `CMD: ${payload.displayMsg || payload.beep}`,
      timestamp: Date.now(),
      actionTaken: `TRANSMITTED_FEEDBACK (${payload.ledColor || 'BEEP'})`,
    };
    handleLogScan(simulatedResponseLog);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-neutral-950 text-white p-6 sm:p-10 space-y-8 animate-fade-in">
      {/* Background Realtime Interceptor */}
      <PicoRealtimeController onLogScan={handleLogScan} />

      {/* Top HUD Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-8 border-b border-white/10">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600/20 to-indigo-600/20 border border-purple-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.15)]">
            <Terminal size={28} className="text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <h1 className="text-xl font-black uppercase tracking-[0.4em] text-white">PicoBridge</h1>
              <span className="px-2.5 py-0.5 rounded bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[9px] font-black tracking-widest uppercase shadow-sm">
                Hidden Gateway
              </span>
            </div>
            <p className="text-xs font-mono text-neutral-400">
              Real-time M5Stack & ESP32 Hardware Integration • RFID / NFC / Barcode Edge Telemetry
            </p>
          </div>
        </div>

        {/* Top Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            title="Antenna & Signal Settings"
            className={`p-2.5 rounded-xl border transition-all ${
              showSettings 
                ? 'bg-purple-500/20 border-purple-500 text-white' 
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-neutral-400 hover:text-white'
            }`}
          >
            <Sliders size={18} />
          </button>

          <button
            onClick={() => handleOpenSimulator()}
            className="px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 shadow-sm"
          >
            <Zap size={16} />
            Simulate Telemetry
          </button>

          <button
            onClick={() => setIsRegistryOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold tracking-wider uppercase transition-all shadow-lg shadow-purple-500/20 flex items-center gap-2"
          >
            <Plus size={16} />
            Link M5Stack Terminal
          </button>
        </div>
      </div>

      {/* RSSI Cutoff & Antenna Settings Banner */}
      {showSettings && (
        <div className="p-5 rounded-2xl bg-neutral-900/80 border border-purple-500/30 backdrop-blur-xl animate-fade-in flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Radio size={22} className="text-cyan-400 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">UHF RFID Signal Cutoff (RSSI Threshold)</h4>
              <p className="text-[11px] font-mono text-neutral-400">
                Ignore UHF RFID tag reads below this signal strength to prevent reading distant warehouse crates.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 min-w-[240px]">
            <input
              type="range"
              min="-90"
              max="-40"
              value={rssiThreshold}
              onChange={e => setRssiThreshold(Number(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-purple-400 shrink-0 min-w-[60px]">
              {rssiThreshold} dBm
            </span>
          </div>
        </div>
      )}

      {/* Grid Section 1: Linked Terminals & Roles */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
            <Shield size={16} className="text-purple-400" />
            Linked Hardware Terminals ({activeDevicesList.length})
          </h2>
          <span className="text-[11px] font-mono text-neutral-500">
            Role-mapped permissions active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeDevicesList.map(device => (
            <PicoRoleHardwareCard
              key={device.id}
              device={device}
              session={
                device.id === activeDevicesList[0]?.id 
                  ? {
                      session_id: 'sess-active',
                      device_id: device.id,
                      user_id: device.owner_user_id,
                      active_workflow: 'idle',
                      workflow_metadata: {},
                      status: device.is_active ? 'connected' : 'disconnected',
                      battery: 88,
                      rssi: -48,
                      activeAccessory: device.accessories[0],
                      connected_at: new Date().toISOString(),
                    }
                  : null
              }
              onDisconnect={handleDisconnect}
              onSimulateScan={id => handleOpenSimulator(id)}
            />
          ))}
        </div>
      </div>

      {/* Grid Section 2: Workflow Manager & Realtime Telemetry Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4">
        <div className="lg:col-span-7">
          <PicoWorkflowManager onSendFeedback={handleSendFeedback} />
        </div>
        <div className="lg:col-span-5">
          <PicoLiveLog logs={scanLogs} onClearLogs={() => setScanLogs([])} />
        </div>
      </div>

      {/* Modals */}
      {isRegistryOpen && (
        <PicoDeviceRegistry
          onRegisterDevice={handleRegisterDevice}
          onClose={() => setIsRegistryOpen(false)}
        />
      )}

      {isSimulatorOpen && (
        <PicoSimulatorModal
          deviceId={selectedSimDeviceId}
          onClose={() => setIsSimulatorOpen(false)}
        />
      )}
    </div>
  );
}
