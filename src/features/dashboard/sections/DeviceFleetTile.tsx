import React from 'react';
import { Cpu, Wifi, WifiOff, Clock } from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { activeViewAtom } from '../../../lib/atoms';
import { useDeviceFleet } from '../../pico/surfaces/useDeviceFleet';
import { connectivity } from '../../pico/surfaces/types';
import { tr } from '../../../lib/i18n';

export const DeviceFleetTile: React.FC = () => {
    const { devices, source, error } = useDeviceFleet();
    const setActiveView = useSetAtom(activeViewAtom);

    if (source === 'none' || error) {
        return (
            <div className="p-4 bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3 text-(--text-color-secondary)">
                    <Cpu size={20} />
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest">{tr("Telemetry")}</p>
                        <p className="text-sm font-medium">{tr("No telemetry yet")}</p>
                    </div>
                </div>
                <button onClick={() => setActiveView('devices')} className="text-[10px] font-black uppercase tracking-widest bg-(--main-color)/10 text-(--main-color) px-3 py-1.5 rounded-lg hover:bg-(--main-color)/20 transition-colors">
                    {tr("Devices")}
                </button>
            </div>
        );
    }

    const now = Date.now();
    let online = 0, stale = 0, offline = 0;

    devices.forEach(d => {
        const state = connectivity(d, now);
        if (state === 'online') online++;
        else if (state === 'stale') stale++;
        else offline++;
    });

    return (
        <div className="p-4 bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-2xl flex items-center justify-between group">
            <div className="flex items-center gap-4">
                <div className="text-(--main-color) p-2 bg-(--main-color)/10 rounded-lg">
                    <Cpu size={20} />
                </div>
                <div className="flex gap-4">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1"><Wifi size={10} /> {tr("Online")}</span>
                        <span className="text-lg font-mono font-black text-(--text-color)">{online}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1"><Clock size={10} /> {tr("Stale")}</span>
                        <span className="text-lg font-mono font-black text-(--text-color)">{stale}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-widest text-rose-400 flex items-center gap-1"><WifiOff size={10} /> {tr("Offline")}</span>
                        <span className="text-lg font-mono font-black text-(--text-color)">{offline}</span>
                    </div>
                </div>
            </div>
            <button onClick={() => setActiveView('devices')} className="text-[10px] font-black uppercase tracking-widest bg-(--main-color)/10 text-(--main-color) px-3 py-1.5 rounded-lg hover:bg-(--main-color)/20 transition-colors shrink-0">
                {tr("Devices")}
            </button>
        </div>
    );
};
