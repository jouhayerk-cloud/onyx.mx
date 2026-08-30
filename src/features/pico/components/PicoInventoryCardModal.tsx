import React, { useEffect, useState } from 'react';
import { useSetAtom } from 'jotai';
import { PicoScanEvent } from '../../../lib/picoAtoms';
import { activeViewAtom, inventoryVendorFilterAtom } from '../../../lib/atoms';
import { VENDOR_COLORS, useDeviceControl } from '../useDeviceControl';
import { X, CheckCircle2, Package, Bot, Volume2, ArrowRight, Radio, DollarSign, Box } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface PicoInventoryCardModalProps {
  scanEvent: (PicoScanEvent & { actionTaken?: string }) | null;
  onClose: () => void;
  deviceId?: string;
  localIp?: string;
}

export const PicoInventoryCardModal: React.FC<PicoInventoryCardModalProps> = ({
  scanEvent,
  onClose,
  deviceId = 'onyxchan-default',
  localIp,
}) => {
  const setActiveView = useSetAtom(activeViewAtom);
  const setVendorFilter = useSetAtom(inventoryVendorFilterAtom);
  const { showInventoryCard, say, setFace } = useDeviceControl(deviceId, localIp);
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  if (!scanEvent) return null;

  // Resolve item from scan tag payload
  const tagUpper = (scanEvent.tagId || '').toUpperCase();
  
  useEffect(() => {
    // Attempt to query Supabase inventory for the scanned barcode/tag
    const fetchItem = async () => {
      setLoading(true);
      try {
        let query = supabase.from('inventory').select('*');
        // If it starts with INV-, maybe it's a UUID prefix or direct barcode
        if (tagUpper.startsWith('INV-')) {
          const rawTag = tagUpper.replace('INV-', '');
          query = query.or(`id.eq.${rawTag},book_barcode.eq.${rawTag}`);
        } else {
          query = query.or(`book_barcode.eq.${tagUpper},title.ilike.%${tagUpper}%`);
        }
        
        const { data, error } = await query.limit(1).maybeSingle();
        if (error) throw error;
        
        if (data) {
          setItem(data);
          
          // 1. Robot reaction
          setFace('happy');
          showInventoryCard(data.id, data.title, data.price, data.stock, data.vendor);

          // 2. Play web audio sound
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.31);
          } catch {}
        } else {
          setError('Item not found in inventory.');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch item');
      } finally {
        setLoading(false);
      }
    };
    
    fetchItem();
  }, [scanEvent.tagId]);

  const handleSpeakGreeting = () => {
    if (item) {
      say(`El artículo ${item.title} cuesta ${item.price} pesos`, 'es');
      setFace('happy');
    }
  };

  const handlePushToRobot = () => {
    if (item) {
      showInventoryCard(item.id, item.title, item.price, item.stock, item.vendor);
      setFace('happy');
    }
  };

  const handleViewInInventory = () => {
    if (item?.vendor) {
      setVendorFilter([item.vendor]);
    }
    setActiveView('inventory');
    onClose();
  };

  const vendorColor = item?.vendor ? (VENDOR_COLORS[item.vendor] || '#10B981') : '#10B981';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-md bg-neutral-900 border rounded-3xl p-6 shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden"
        style={{ borderColor: `${vendorColor}80` }}
      >
        {/* Holographic Glowing Header Gradient */}
        <div 
          className="absolute top-0 left-0 right-0 h-32 opacity-20 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at top, ${vendorColor}, transparent 70%)` }}
        />

        {/* Top Scan Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 relative z-10 mb-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: vendorColor }} />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: vendorColor }} />
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center gap-1.5">
              <Radio size={12} className="text-emerald-400" />
              Inventory Item Detected
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="p-10 text-center text-neutral-400 animate-pulse text-sm">
            Searching Supabase inventory...
          </div>
        )}
        
        {error && !loading && (
          <div className="p-6 text-center text-red-400 text-sm bg-red-950/30 rounded-xl border border-red-900/50 mb-4">
            {error}
          </div>
        )}

        {/* Item Hologram Card */}
        {item && !loading && (
          <div 
            className="p-5 rounded-2xl border mb-5 relative overflow-hidden transition-all duration-300"
            style={{ 
              backgroundColor: `${vendorColor}15`, 
              borderColor: `${vendorColor}40`,
              boxShadow: `0 0 30px ${vendorColor}15`
            }}
          >
            <div className="flex items-center gap-4 mb-4">
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0 border border-white/20 bg-black overflow-hidden relative"
              >
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <Package size={24} style={{ color: vendorColor }} />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold text-white tracking-wide line-clamp-2">{item.title}</h3>
                </div>
                <p className="text-xs text-neutral-300 font-mono mt-1">Vendor: {item.vendor || 'N/A'}</p>
                <div className="text-[10px] font-mono text-neutral-400 mt-1 flex items-center gap-2">
                  <span>Tag: <strong className="text-white">{scanEvent.tagId}</strong></span>
                  <span>•</span>
                  <span>{scanEvent.scanType}</span>
                  {scanEvent.rssi !== undefined && <span>({scanEvent.rssi} dBm)</span>}
                </div>
              </div>
            </div>

            {/* Details Pill List */}
            <div className="space-y-1.5 p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] font-mono text-neutral-300 grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
                <DollarSign size={12} className="text-emerald-400 shrink-0" />
                <span>Price: <strong className="text-white">${item.price || '0.00'}</strong></span>
              </div>
              <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
                <Box size={12} className="text-amber-400 shrink-0" />
                <span>Stock: <strong className="text-white">{item.stock ?? 'N/A'}</strong></span>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <CheckCircle2 size={12} className="text-blue-400 shrink-0" />
                <span className="truncate">Status: <strong className="text-white">{item.status || 'Active'}</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* Quick Hardware Actions */}
        {item && !loading && (
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
        )}

        {/* Bottom Primary Action */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold tracking-wide transition-colors"
          >
            Dismiss
          </button>
          
          {item && !loading && (
            <button
              onClick={handleViewInInventory}
              className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-1.5"
              style={{ backgroundColor: vendorColor }}
            >
              <Package size={14} />
              <span>View in DB</span>
              <ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
