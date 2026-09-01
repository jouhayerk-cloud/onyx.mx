import React, { useState } from 'react';
import { useAtomValue } from 'jotai';
import { userAtom } from '../../../lib/atoms';
import { PicoDevice } from '../../../lib/picoAtoms';
import { Plus, Terminal, Check, X, AlertCircle, Bot, Box, Smartphone, Monitor, Bluetooth, Sparkles, UserCheck, RefreshCw } from 'lucide-react';
import { tr } from '../../../lib/i18n';

interface PicoDeviceRegistryProps {
  onRegisterDevice: (device: Omit<PicoDevice, 'id' | 'last_seen_at' | 'is_active'>) => void;
  onClose?: () => void;
}

interface HardwarePreset {
  id: string;
  name: string;
  subtitle: string;
  role: string;
  icon: any;
  defaultAccessories: string[];
  defaultNamePrefix: string;
}

const HARDWARE_PRESETS: HardwarePreset[] = [
  {
    id: 'M5StackChan',
    name: 'StackChan Robot',
    subtitle: 'CoreS3 + Dual Servos + ST25R3916 NFC',
    role: 'Admin',
    icon: Bot,
    defaultAccessories: ['NFC_ST25R3916', 'SERVO_PAN_TILT'],
    defaultNamePrefix: 'OnyxChan Robot',
  },
  {
    id: 'ATOM Lite',
    name: 'ATOM Lite',
    subtitle: 'ESP32 Wireless Scanner',
    role: 'Vendor',
    icon: Box,
    defaultAccessories: ['BARCODE_BASE_2'],
    defaultNamePrefix: 'ATOM Scanner',
  },
  {
    id: 'M5StickS3',
    name: 'M5StickS3',
    subtitle: 'Handheld Mobile IoT Terminal',
    role: 'Staff',
    icon: Smartphone,
    defaultAccessories: ['UHF_RFID_JRD4035'],
    defaultNamePrefix: 'StickS3 Mobile',
  },
  {
    id: 'Cardputer ADV',
    name: 'Cardputer ADV',
    subtitle: 'ESP32-S3 Mini Pocket Computer',
    role: 'Developer',
    icon: Terminal,
    defaultAccessories: ['QR_SCANNER_STM32F030'],
    defaultNamePrefix: 'Cardputer Dev',
  },
  {
    id: 'CoreS3',
    name: 'CoreS3 Station',
    subtitle: 'Fixed Desktop Dashboard Terminal',
    role: 'User',
    icon: Monitor,
    defaultAccessories: ['NFC_ST25R3916', 'QR_MODULE_13_2'],
    defaultNamePrefix: 'CoreS3 Base',
  },
];

const ACCESSORY_OPTIONS = [
  { id: 'NFC_ST25R3916', label: 'NFC Universal Unit (ST25R3916)' },
  { id: 'SERVO_PAN_TILT', label: 'Dual Pan/Tilt Servos' },
  { id: 'UHF_RFID_JRD4035', label: 'UHF RFID Long-Range Unit (JRD-4035)' },
  { id: 'QR_SCANNER_STM32F030', label: 'QR Code Scanner Unit (STM32F030)' },
  { id: 'BARCODE_BASE_2', label: 'ATOMIC Barcode Scanner Base' },
  { id: 'QR_MODULE_13_2', label: 'QR Code Scanner Module 13.2' },
];

export const PicoDeviceRegistry: React.FC<PicoDeviceRegistryProps> = ({ onRegisterDevice, onClose }) => {
  const currentUser = useAtomValue(userAtom);
  
  const [selectedPresetId, setSelectedPresetId] = useState('M5StackChan');
  const [deviceName, setDeviceName] = useState('OnyxChan Robot #1');
  const [deviceMac, setDeviceMac] = useState('');
  const [assignedEmail, setAssignedEmail] = useState(currentUser?.email || '');
  const [assignedRole, setAssignedRole] = useState('Admin');
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>(['NFC_ST25R3916', 'SERVO_PAN_TILT']);
  const [isScanningBle, setIsScanningBle] = useState(false);
  const [bleStatus, setBleStatus] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Preset switch handler
  const handleSelectPreset = (preset: HardwarePreset) => {
    setSelectedPresetId(preset.id);
    setSelectedAccessories(preset.defaultAccessories);
    setAssignedRole(preset.role);
    if (!deviceName || HARDWARE_PRESETS.some(p => deviceName.startsWith(p.defaultNamePrefix))) {
      setDeviceName(`${preset.defaultNamePrefix} #1`);
    }
  };

  const toggleAccessory = (accId: string) => {
    if (selectedAccessories.includes(accId)) {
      setSelectedAccessories(selectedAccessories.filter(id => id !== accId));
    } else {
      setSelectedAccessories([...selectedAccessories, accId]);
    }
  };

  // Web Bluetooth auto-scan & pair
  const handleScanBluetooth = async () => {
    setError('');
    setBleStatus('Searching for nearby OnyxChan / M5Stack devices...');
    setIsScanningBle(true);

    try {
      if (!('bluetooth' in navigator)) {
        throw new Error('Web Bluetooth is not supported on this browser. Please use Chrome, Edge, or enter the MAC manually.');
      }

      // @ts-ignore
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['0000fff0-0000-1000-8000-00805f9b34fb', 'generic_access'],
      });

      if (device) {
        setBleStatus(`Connected to: ${device.name || 'M5Stack Device'}`);
        if (device.name) {
          setDeviceName(device.name);
          if (device.name.toLowerCase().includes('stackchan') || device.name.toLowerCase().includes('onyxchan')) {
            handleSelectPreset(HARDWARE_PRESETS[0]);
          }
        }
        
        // Generate formatted ID if MAC not exposed by standard Web Bluetooth API
        const syntheticMac = device.id ? device.id.slice(0, 17).toUpperCase() : '24:D7:EB:12:34:56';
        setDeviceMac(syntheticMac);
        setBleStatus(`Paired successfully with ${device.name || 'Device'}!`);
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        setError(err.message || 'Bluetooth scanning failed.');
      }
      setBleStatus(null);
    } finally {
      setIsScanningBle(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceName.trim()) {
      setError('Please enter a device name.');
      return;
    }
    if (!deviceMac.trim()) {
      setError('Please provide a MAC Address / Chip ID (or use Bluetooth Scan).');
      return;
    }

    const formattedMac = deviceMac.toUpperCase().replace(/[^A-F0-9:]/g, '');

    onRegisterDevice({
      device_name: deviceName.trim(),
      device_mac: formattedMac,
      hardware_model: selectedPresetId,
      assigned_role: assignedRole,
      owner_user_id: currentUser?.id || 'local-user',
      owner_email: assignedEmail.trim() || currentUser?.email || 'ramses@jouhayerk.com',
      accessories: selectedAccessories,
      firmware_version: '2.0.0',
    });

    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-xl bg-neutral-900 border border-white/10 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center">
              <Bot size={20} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">{tr("Link Hardware Terminal")}</h3>
              <p className="text-[11px] font-mono text-neutral-400">{tr("Pair StackChan, ATOM, or StickS3 to your Onyx.mx account")}</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-rose-400 text-xs">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 1-Click Hardware Presets */}
        <div className="mb-5">
          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Sparkles size={12} className="text-purple-400" />
            {tr("Select Hardware Type")}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {HARDWARE_PRESETS.map(preset => {
              const Icon = preset.icon;
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                    isSelected
                      ? 'bg-purple-600/20 border-purple-500 text-white shadow-lg shadow-purple-500/10'
                      : 'bg-black/40 border-white/5 text-neutral-400 hover:text-white hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Icon size={18} className={isSelected ? 'text-purple-300' : 'text-neutral-400'} />
                    {isSelected && <span className="w-2 h-2 rounded-full bg-purple-400 shadow-sm" />}
                  </div>
                  <div className="text-xs font-bold mt-1 text-white">{preset.name}</div>
                  <div className="text-[9px] font-mono text-neutral-400 line-clamp-1">{preset.subtitle}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Web Bluetooth One-Click Pair Banner */}
        <div className="mb-5 p-3.5 rounded-xl bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
              <Bluetooth size={16} className="text-purple-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">{tr("Auto-Discover via Bluetooth")}</div>
              <div className="text-[10px] text-neutral-400 font-mono">
                {bleStatus || 'Search for nearby OnyxChan BLE beacon to auto-fill MAC'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleScanBluetooth}
            disabled={isScanningBle}
            className="w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-[11px] font-bold tracking-wider uppercase transition-colors shrink-0 flex items-center justify-center gap-1.5"
          >
            {isScanningBle ? <RefreshCw size={12} className="animate-spin" /> : <Bluetooth size={12} />}
            {isScanningBle ? 'Scanning...' : 'Scan BLE'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Device Name & MAC Input */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">
                {tr("Device Name")}
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                placeholder={tr("e.g., OnyxChan Robot #1")}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-purple-500 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">
                {tr("ESP32 MAC Address")}
              </label>
              <input
                type="text"
                value={deviceMac}
                onChange={e => setDeviceMac(e.target.value)}
                placeholder={tr("e.g., 24:D7:EB:12:34:56")}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-mono uppercase focus:outline-none focus:border-purple-500 transition-colors"
                required
              />
            </div>
          </div>

          {/* Assigned User with Quick-Assign Button */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                {tr("Assigned User (Email)")}
              </label>
              {currentUser?.email && (
                <button
                  type="button"
                  onClick={() => setAssignedEmail(currentUser.email)}
                  className="text-[10px] font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1"
                >
                  <UserCheck size={11} />
                  Assign to Me ({currentUser.email.split('@')[0]})
                </button>
              )}
            </div>
            <input
              type="email"
              value={assignedEmail}
              onChange={e => setAssignedEmail(e.target.value)}
              placeholder={tr("e.g., ramses@jouhayerk.com")}
              className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Role Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">
                {tr("Assigned Access Role")}
              </label>
              <select
                value={assignedRole}
                onChange={e => setAssignedRole(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-purple-500 transition-colors"
              >
                {(['Developer', 'Admin', 'Vendor', 'Staff', 'User'] as const).map(role => (
                  <option key={role} value={role} className="bg-neutral-900 text-white">
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">
                {tr("Firmware Runtime")}
              </label>
              <div className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/5 text-neutral-400 text-xs font-mono">
                {tr("UIFlow 2.0 (MicroPython)")}
              </div>
            </div>
          </div>

          {/* Attached Hardware Accessories */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">
              {tr("Active Hardware Sensors / Features")}
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-28 overflow-y-auto p-2 rounded-xl bg-black/30 border border-white/5">
              {ACCESSORY_OPTIONS.map(acc => {
                const isSelected = selectedAccessories.includes(acc.id);
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => toggleAccessory(acc.id)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-purple-500/15 border-purple-500/40 text-white'
                        : 'bg-white/5 border-white/5 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span className="text-[10px] font-mono truncate">{acc.label}</span>
                    <div className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${
                      isSelected ? 'bg-purple-500 border-purple-400' : 'border-neutral-600'
                    }`}>
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-5">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold tracking-wide transition-colors"
              >
                {tr("Cancel")}
              </button>
            )}
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold tracking-wider uppercase transition-all shadow-lg shadow-purple-500/20 flex items-center gap-2"
            >
              <Plus size={14} />
              {tr("Link Device")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
