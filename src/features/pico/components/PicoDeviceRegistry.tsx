import React, { useState } from 'react';
import { PicoDevice } from '../../../lib/picoAtoms';
import { Plus, Shield, Terminal, Cpu, Check, X, AlertCircle, Radio } from 'lucide-react';

interface PicoDeviceRegistryProps {
  onRegisterDevice: (device: Omit<PicoDevice, 'id' | 'last_seen_at' | 'is_active'>) => void;
  onClose?: () => void;
}

const HARDWARE_MODELS = [
  { id: 'M5Stack Tab5', label: 'M5Stack Tab5 IoT Development Kit (ESP32-P4)', role: 'Developer' },
  { id: 'M5StackChan', label: 'M5StackChan AI Desktop Robot (ESP32-S3)', role: 'Admin' },
  { id: 'ATOM Lite', label: 'ATOM Lite ESP32 IoT Development Kit', role: 'Vendor' },
  { id: 'AtomS3R-CAM', label: 'AtomS3R-CAM AI Chatbot Kit (8MB PSRAM)', role: 'Vendor' },
  { id: 'M5StickS3', label: 'M5StickS3 ESP32S3 Mini IoT Dev Kit', role: 'Staff' },
  { id: 'CoreS3', label: 'M5Stack CoreS3 ESP32S3 IoT Development Kit', role: 'User' },
];

const ACCESSORY_OPTIONS = [
  { id: 'UHF_RFID_JRD4035', label: 'UHF RFID Unit (JRD-4035)' },
  { id: 'NFC_ST25R3916', label: 'NFC Universal Unit (ST25R3916)' },
  { id: 'QR_SCANNER_STM32F030', label: 'QR Code Scanner Unit (STM32F030)' },
  { id: 'BARCODE_BASE_2', label: 'ATOMIC Barcode/QR-Code Scanner 2 Base' },
  { id: 'QR_MODULE_13_2', label: 'QR Code Scanner Module 13.2' },
];

export const PicoDeviceRegistry: React.FC<PicoDeviceRegistryProps> = ({ onRegisterDevice, onClose }) => {
  const [deviceName, setDeviceName] = useState('');
  const [deviceMac, setDeviceMac] = useState('');
  const [selectedModel, setSelectedModel] = useState(HARDWARE_MODELS[4].id); // Default M5StickS3
  const [assignedRole, setAssignedRole] = useState('Staff');
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>(['UHF_RFID_JRD4035']);
  const [error, setError] = useState('');

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    const found = HARDWARE_MODELS.find(m => m.id === modelId);
    if (found) {
      setAssignedRole(found.role);
    }
  };

  const toggleAccessory = (accId: string) => {
    if (selectedAccessories.includes(accId)) {
      setSelectedAccessories(selectedAccessories.filter(id => id !== accId));
    } else {
      setSelectedAccessories([...selectedAccessories, accId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceName.trim() || !deviceMac.trim()) {
      setError('Please provide a Device Name and a valid MAC Address / Chip ID.');
      return;
    }

    // Format check basic MAC string
    const formattedMac = deviceMac.toUpperCase().replace(/[^A-F0-9:]/g, '');

    onRegisterDevice({
      device_name: deviceName.trim(),
      device_mac: formattedMac,
      hardware_model: selectedModel,
      assigned_role: assignedRole,
      owner_user_id: 'local-user',
      owner_email: 'admin@onyx.mx',
      accessories: selectedAccessories,
      firmware_version: '1.0.0',
    });

    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-neutral-900 border border-white/10 rounded-2xl p-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Terminal size={20} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">Link M5Stack Terminal</h3>
              <p className="text-[11px] font-mono text-neutral-400">Register hardware MAC & assign user access role</p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Device Name */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">
              Terminal Identifier / Name
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              placeholder="e.g., North Dock Scanner #1"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-purple-500 transition-colors"
              required
            />
          </div>

          {/* MAC Address */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">
              ESP32 Chip ID / MAC Address
            </label>
            <input
              type="text"
              value={deviceMac}
              onChange={e => setDeviceMac(e.target.value)}
              placeholder="e.g., 24:0A:C4:00:11:22"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-sm font-mono uppercase focus:outline-none focus:border-purple-500 transition-colors"
              required
            />
          </div>

          {/* Hardware Model Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">
                Hardware Configuration
              </label>
              <select
                value={selectedModel}
                onChange={e => handleModelChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-purple-500 transition-colors"
              >
                {HARDWARE_MODELS.map(m => (
                  <option key={m.id} value={m.id} className="bg-neutral-900 text-white">
                    {m.id} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Role Assignment */}
            <div>
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5">
                Assigned Access Role
              </label>
              <select
                value={assignedRole}
                onChange={e => setAssignedRole(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-purple-500 transition-colors"
              >
                {(['Developer', 'Admin', 'Vendor', 'Staff', 'User'] as const).map(role => (
                  <option key={role} value={role} className="bg-neutral-900 text-white">
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Accessories Selection */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
              Attached Sensor Accessories
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 rounded-xl bg-black/30 border border-white/5">
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
                    <span className="text-[11px] font-mono truncate">{acc.label}</span>
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                      isSelected ? 'bg-purple-500 border-purple-400' : 'border-neutral-600'
                    }`}>
                      {isSelected && <Check size={12} className="text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold tracking-wide transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold tracking-wider uppercase transition-all shadow-lg shadow-purple-500/20 flex items-center gap-2"
            >
              <Plus size={14} />
              Register Terminal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
