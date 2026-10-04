import React, { useState, useEffect } from 'react';
import { DeviceState } from '../surfaces/types';
import { useDeviceScans, ScanEvent } from './useDeviceScans';
import { useNow } from '../surfaces/useDeviceFleet';
import { useDatabase } from '../../../lib/hooks';
import { tr } from '../../../lib/i18n';
import { Package, AlertTriangle, Search, Clock, Smartphone, Hash, Tag, MapPin, CheckCircle } from 'lucide-react';

const formatRelativeTime = (time: string, now: number) => {
  const diff = now - new Date(time).getTime();
  if (Number.isNaN(diff) || diff < 0) return tr('Just now');
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec} ${tr('seconds ago')}`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${tr('minutes ago')}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${tr('hours ago')}`;
  const days = Math.floor(hr / 24);
  return `${days} ${tr('days ago')}`;
};

const ScanRow: React.FC<{
  scan: ScanEvent;
  device: DeviceState | undefined;
  now: number;
  db: any;
}> = ({ scan, device, now, db }) => {
  const [expanded, setExpanded] = useState(false);
  const [item, setItem] = useState<any>(null);
  const [loadingItem, setLoadingItem] = useState(true);

  const payload = scan.payload || {};
  const isWrong = payload.wrong === true || payload.status === 'wrong';
  const tagId = payload.tagId || payload.barcode || payload.tag || '';
  const scanType = payload.scanType || payload.type || tr('Unknown Type');
  
  const itemId = payload.item_id || tagId;

  useEffect(() => {
    let active = true;
    if (!db || !db.inventory || !itemId) {
      setLoadingItem(false);
      return;
    }
    
    const lookup = async () => {
      try {
        let doc = await db.inventory.findOne({ selector: { id: itemId } }).exec();
        
        if (!doc) {
           doc = await db.inventory.findOne({ selector: { book_barcode: itemId } }).exec();
        }
        
        if (active) {
          setItem(doc ? doc.toJSON() : null);
          setLoadingItem(false);
        }
      } catch (err) {
        if (active) setLoadingItem(false);
      }
    };
    
    lookup();
    return () => { active = false; };
  }, [db, itemId]);

  const deviceName = device?.device_id || scan.device_id;
  const timeStr = formatRelativeTime(scan.occurred_at, now);

  return (
    <div className={`flex flex-col mb-3 rounded-xl border transition-colors overflow-hidden ${
      isWrong ? 'bg-red-950/20 border-red-900/50' : 'bg-neutral-900 border-white/5'
    }`}>
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4 flex-1 overflow-hidden">
          <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-black/40 border border-white/10 text-neutral-400 shrink-0">
            {isWrong ? <AlertTriangle size={18} className="text-red-400" /> : <Search size={18} className="text-emerald-400" />}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm truncate ${isWrong ? 'text-red-400' : 'text-neutral-200'}`}>
                {loadingItem ? '...' : (item ? item.title : tr('Unknown item'))}
              </span>
              {isWrong && (
                <span className="text-[10px] uppercase tracking-wider font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full shrink-0">
                  {tr('Wrong item')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-neutral-500">
              <span className="flex items-center gap-1.5 truncate">
                <Smartphone size={10} />
                {deviceName}
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <Clock size={10} />
                {timeStr}
              </span>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-4 border-t border-white/5 bg-black/20 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
            <div className="flex flex-col gap-1">
              <span className="text-neutral-500 flex items-center gap-1"><Hash size={12}/> {tr('Tag:')}</span>
              <span className="text-neutral-300 font-semibold">{tagId || tr('N/A')}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-neutral-500 flex items-center gap-1"><Tag size={12}/> {tr('Type:')}</span>
              <span className="text-neutral-300">{scanType}</span>
            </div>
          </div>

          <div className="bg-neutral-900 border border-white/5 rounded-lg p-3 grid grid-cols-2 gap-3 text-[11px]">
            <div className="flex flex-col gap-1 col-span-2">
              <span className="text-neutral-500 font-mono flex items-center gap-1"><Package size={12}/> {tr('Vendor:')}</span>
              <span className="text-neutral-300">{loadingItem ? '...' : (item?.vendor || item?.vendor_id || tr('Unknown item'))}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-neutral-500 font-mono flex items-center gap-1"><CheckCircle size={12}/> {tr('Status:')}</span>
              <span className="text-neutral-300">{loadingItem ? '...' : (item?.status || tr('N/A'))}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-neutral-500 font-mono flex items-center gap-1"><MapPin size={12}/> {tr('Location:')}</span>
              <span className="text-neutral-300">{loadingItem ? '...' : (item?.location || tr('N/A'))}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ScansTab: React.FC<{ devices: DeviceState[] }> = ({ devices }) => {
  const { status, scans } = useDeviceScans();
  const [filterDevice, setFilterDevice] = useState<string | null>(null);
  const db = useDatabase();
  const now = useNow();

  const filteredScans = filterDevice 
    ? scans.filter(s => s.device_id === filterDevice)
    : scans;

  return (
    <div className="flex flex-col h-full w-full">
      {/* Filter Chips */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 shrink-0 hide-scrollbar">
        <button
          onClick={() => setFilterDevice(null)}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide whitespace-nowrap transition-colors ${
            filterDevice === null 
              ? 'bg-emerald-500 text-black' 
              : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white border border-white/5'
          }`}
        >
          {tr('All Devices')}
        </button>
        {devices.map(d => (
          <button
            key={d.device_id}
            onClick={() => setFilterDevice(d.device_id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide whitespace-nowrap transition-colors ${
              filterDevice === d.device_id 
                ? 'bg-emerald-500 text-black' 
                : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white border border-white/5'
            }`}
          >
            {d.device_id}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {status === 'loading' && (
          <div className="flex items-center justify-center h-40 text-neutral-500 text-sm font-mono animate-pulse">
            {tr('Loading...')}
          </div>
        )}
        
        {status === 'unavailable' && (
          <div className="flex flex-col items-center justify-center h-40 text-neutral-500 bg-neutral-900/50 rounded-2xl border border-white/5 border-dashed">
            <Package size={24} className="mb-2 opacity-50" />
            <span className="text-sm font-mono">{tr('Unavailable')}</span>
          </div>
        )}

        {status === 'empty' && (
          <div className="flex flex-col items-center justify-center h-40 text-neutral-500 bg-neutral-900/50 rounded-2xl border border-white/5 border-dashed">
            <Search size={24} className="mb-2 opacity-50" />
            <span className="text-sm font-mono">{tr('No telemetry yet')}</span>
          </div>
        )}

        {status === 'ready' && filteredScans.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-neutral-500 bg-neutral-900/50 rounded-2xl border border-white/5 border-dashed">
            <Search size={24} className="mb-2 opacity-50" />
            <span className="text-sm font-mono">{tr('No telemetry yet')}</span>
          </div>
        )}

        {status === 'ready' && filteredScans.map(scan => (
          <ScanRow 
            key={scan.id} 
            scan={scan} 
            device={devices.find(d => d.device_id === scan.device_id)}
            now={now}
            db={db}
          />
        ))}
      </div>
    </div>
  );
};

export default ScansTab;
