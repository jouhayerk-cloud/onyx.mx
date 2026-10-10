import React, { useState, useEffect, Suspense } from 'react';
import { useDeviceFleet, useNow } from '../surfaces/useDeviceFleet';
import { connectivity } from '../surfaces/types';
import { FleetSection } from '../surfaces/FleetSection';
import { ViewSkeleton } from '../../../components/ui/ViewSkeleton';
import { tr } from '../../../lib/i18n';
import { PicoBridgeView } from '../PicoBridgeView';

const ScansTab = React.lazy(() => import('./ScansTab'));
const WorkflowsTab = React.lazy(() => import('./WorkflowsTab'));
const AdminTab = React.lazy(() => import('./AdminTab'));
const DeviceDetailDrawer = React.lazy(() => import('./detail/DeviceDetailDrawer').then(m => ({ default: m.DeviceDetailDrawer })));

const TABS = ['Fleet', 'Scans', 'Workflows', 'Control', 'Admin'] as const;
type TabType = typeof TABS[number];

/** Top-level Pico devices screen with tabs for the fleet, scans, workflows, control and admin. */
export const DevicesView: React.FC = () => {
  const fleet = useDeviceFleet();
  const now = useNow();
  const [activeTab, setActiveTab] = useState<TabType>('Fleet');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('onyx.devices.tab') as TabType;
      if (saved && TABS.includes(saved)) {
        setActiveTab(saved);
      }
    } catch (e) {}
  }, []);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    try {
      sessionStorage.setItem('onyx.devices.tab', tab);
    } catch (e) {}
  };

  let online = 0;
  let stale = 0;
  let offline = 0;
  fleet.devices.forEach(d => {
    const c = connectivity(d, now);
    if (c === 'online') online++;
    else if (c === 'stale') stale++;
    else offline++;
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-transparent text-white p-4 sm:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-black tracking-widest text-white uppercase">{tr('Devices')}</h1>
          <div className="flex items-center gap-2">
            {fleet.source === 'mock' && (
              <span className="px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[9px] font-bold uppercase tracking-widest">
                {tr('Simulated data')}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase tracking-widest">
              {online} {tr('Online')}
            </span>
            <span className="px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[9px] font-bold uppercase tracking-widest">
              {stale} {tr('Stale')}
            </span>
            <span className="px-2 py-0.5 rounded-full border border-neutral-500/40 bg-neutral-500/10 text-neutral-400 text-[9px] font-bold uppercase tracking-widest">
              {offline} {tr('Offline')}
            </span>
          </div>
        </div>
      </div>

      <div role="tablist" className="flex items-center gap-2 border-b border-white/10 pb-2 mb-4 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-2 text-sm font-bold tracking-wider uppercase transition-all whitespace-nowrap rounded-t-lg ${
              activeTab === tab 
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-white/5' 
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tr(tab)}
          </button>
        ))}
      </div>

      <div className="flex-1">
        <Suspense fallback={<ViewSkeleton />}>
          {activeTab === 'Fleet' && <FleetSection fleet={fleet} onSelect={setSelectedDeviceId} />}
          {activeTab === 'Scans' && <ScansTab devices={fleet.devices} />}
          {activeTab === 'Workflows' && <WorkflowsTab runs={fleet.runs} devices={fleet.devices} />}
          {activeTab === 'Control' && <PicoBridgeView hideHeader={true} hideFleet={true} />}
          {activeTab === 'Admin' && <AdminTab devices={fleet.devices} />}
        </Suspense>
      </div>
      {selectedDeviceId && (
        <Suspense fallback={null}>
          <DeviceDetailDrawer
            deviceId={selectedDeviceId}
            onClose={() => setSelectedDeviceId(null)}
            devices={fleet.devices}
            telemetryFor={fleet.telemetryFor}
            runs={fleet.runs}
            commands={fleet.commands}
          />
        </Suspense>
      )}
    </div>
  );
};

export default DevicesView;
