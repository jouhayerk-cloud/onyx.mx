import React, { useEffect, useState } from 'react';
import { useSetAtom } from 'jotai';
import { PicoScanEvent } from '../../../lib/picoAtoms';
import { activeViewAtom, inventoryVendorFilterAtom } from '../../../lib/atoms';
import { VENDOR_COLORS, useDeviceControl } from '../useDeviceControl';
import { Shield, Sparkles, X, CheckCircle2, User, Package, CreditCard, Bot, Volume2, ArrowRight, Radio } from 'lucide-react';

interface PicoVendorCardModalProps {
  scanEvent: (PicoScanEvent & { actionTaken?: string }) | null;
  onClose: () => void;
  deviceId?: string;
  localIp?: string;
}

interface VendorProfile {
  name: string;
  color: string;
  role: string;
  totalItems: number;
  paymentStatus: 'Paid' | 'Pending' | 'Partial' | 'Verified';
  greeting: string;
  details: string[];
}

const VENDOR_PROFILES: Record<string, VendorProfile> = {
  Martha: {
    name: 'Martha',
    color: VENDOR_COLORS['Martha'] || '#4f2068',
    role: 'Master Artisan / Vendor',
    totalItems: 42,
    paymentStatus: 'Verified',
    greeting: '¡Bienvenida Martha! Tus piezas artesanales están catalogadas.',
    details: ['Catalog: 42 Items', 'Manifest: Crate #2026-M4', 'Status: Ready for Shipping'],
  },
  Ramses: {
    name: 'Ramses',
    color: VENDOR_COLORS['Ramses'] || '#737104',
    role: 'Lead Architect / Admin',
    totalItems: 88,
    paymentStatus: 'Verified',
    greeting: 'Welcome Ramses. System diagnostics nominal.',
    details: ['Role: Lead Architect', 'Security: Level 5 Admin', 'Access: Full Hardware Hub'],
  },
  Alejandra: {
    name: 'Alejandra',
    color: VENDOR_COLORS['Alejandra'] || '#1a6b5a',
    role: 'Studio Vendor / Curator',
    totalItems: 31,
    paymentStatus: 'Pending',
    greeting: '¡Hola Alejandra! Lote de piezas recibido en almacén.',
    details: ['Catalog: 31 Items', 'Manifest: Crate #2026-A1', 'Status: Quality Inspection'],
  },
  Carolina: {
    name: 'Carolina',
    color: VENDOR_COLORS['Carolina'] || '#8b2252',
    role: 'Fine Jewelry Vendor',
    totalItems: 19,
    paymentStatus: 'Verified',
    greeting: '¡Hola Carolina! Joyería asegurada en bóveda.',
    details: ['Catalog: 19 Items', 'Vault: Secure Unit 3', 'Status: Inspected & Verified'],
  },
};

export const PicoVendorCardModal: React.FC<PicoVendorCardModalProps> = ({
  scanEvent,
  onClose,
  deviceId = 'onyxchan-default',
  localIp,
}) => {
  const setActiveView = useSetAtom(activeViewAtom);
  const setVendorFilter = useSetAtom(inventoryVendorFilterAtom);
  const { showVendorCard, say, setFace } = useDeviceControl(deviceId, localIp);

  if (!scanEvent) return null;

  // Resolve vendor from scan tag payload
  const tagUpper = (scanEvent.tagId || '').toUpperCase();
  let matchedVendorKey = 'Martha'; // Default for demo NFC scans

  if (tagUpper.includes('RAMSES') || tagUpper.includes('SU1004') || tagUpper.includes('SEC-0922')) {
    matchedVendorKey = 'Ramses';
  } else if (tagUpper.includes('MARTHA') || tagUpper.includes('SU8821')) {
    matchedVendorKey = 'Martha';
  } else if (tagUpper.includes('ALEJANDRA') || tagUpper.includes('CRATE-2026')) {
    matchedVendorKey = 'Alejandra';
  } else if (tagUpper.includes('CAROLINA') || tagUpper.includes('890123')) {
    matchedVendorKey = 'Carolina';
  }

  const profile = VENDOR_PROFILES[matchedVendorKey] || VENDOR_PROFILES.Martha;

  // Play audio chime and push to robot display on mount
  useEffect(() => {
    // 1. Robot reaction
    setFace('happy');
    showVendorCard(profile.name, `${profile.name} Verified`, profile.details, 'tag');

    // 2. Play web audio sound
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch {}
  }, [scanEvent.tagId]);

  const handleSpeakGreeting = () => {
    say(profile.greeting, profile.name === 'Ramses' ? 'en' : 'es');
    setFace('happy');
  };

  const handlePushToRobot = () => {
    showVendorCard(profile.name, `${profile.name} NFC Card`, profile.details, 'tag');
    setFace('happy');
  };

  const handleViewInInventory = () => {
    setVendorFilter([profile.name]);
    setActiveView('inventory');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-md bg-neutral-900 border rounded-3xl p-6 shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden"
        style={{ borderColor: `${profile.color}80` }}
      >
        {/* Holographic Glowing Header Gradient */}
        <div 
          className="absolute top-0 left-0 right-0 h-32 opacity-20 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at top, ${profile.color}, transparent 70%)` }}
        />

        {/* Top Scan Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 relative z-10 mb-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: profile.color }} />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: profile.color }} />
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center gap-1.5">
              <Radio size={12} className="text-emerald-400" />
              NFC Vendor Card Detected
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Vendor Hologram Card */}
        <div 
          className="p-5 rounded-2xl border mb-5 relative overflow-hidden transition-all duration-300"
          style={{ 
            backgroundColor: `${profile.color}15`, 
            borderColor: `${profile.color}40`,
            boxShadow: `0 0 30px ${profile.color}15`
          }}
        >
          <div className="flex items-center gap-4 mb-4">
            <div 
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shrink-0 border border-white/20"
              style={{ backgroundColor: profile.color }}
            >
              {profile.name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-wide">{profile.name}</h3>
                <span 
                  className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border text-white"
                  style={{ backgroundColor: `${profile.color}40`, borderColor: profile.color }}
                >
                  {profile.paymentStatus}
                </span>
              </div>
              <p className="text-xs text-neutral-300 font-mono">{profile.role}</p>
              <div className="text-[10px] font-mono text-neutral-400 mt-1 flex items-center gap-2">
                <span>Tag: <strong className="text-white">{scanEvent.tagId}</strong></span>
                <span>•</span>
                <span>{scanEvent.scanType}</span>
                {scanEvent.rssi !== undefined && <span>({scanEvent.rssi} dBm)</span>}
              </div>
            </div>
          </div>

          {/* Details Pill List */}
          <div className="space-y-1.5 p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] font-mono text-neutral-300">
            {profile.details.map((detail, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                <span>{detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Hardware Actions */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <button
            onClick={handlePushToRobot}
            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 hover:border-purple-500/40"
          >
            <Bot size={14} className="text-purple-400" />
            Push to LCD
          </button>
          
          <button
            onClick={handleSpeakGreeting}
            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 hover:border-purple-500/40"
          >
            <Volume2 size={14} className="text-amber-400" />
            Robot Speak
          </button>
        </div>

        {/* Bottom Primary Action */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold tracking-wide transition-colors"
          >
            Dismiss
          </button>
          
          <button
            onClick={handleViewInInventory}
            className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-1.5"
            style={{ backgroundColor: profile.color }}
          >
            <Package size={14} />
            <span>Open Items</span>
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};
