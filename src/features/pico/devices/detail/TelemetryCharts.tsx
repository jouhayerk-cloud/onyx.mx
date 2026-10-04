import React, { useMemo, useState } from 'react';
import { tr, trf } from '../../../../lib/i18n';
import type { TelemetryPoint } from '../../surfaces/types';
import type { DeviceProfile } from '../profiles/deviceProfiles';
import { AlertCircle } from 'lucide-react';

interface TelemetryChartsProps {
  points: TelemetryPoint[];
  profile: DeviceProfile;
  range: '1h' | '24h' | '7d';
  onRangeChange?: (range: '1h' | '24h' | '7d') => void;
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({ points, profile, range, onRangeChange }) => {
  const sorted = useMemo(() => {
    return [...points].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [points]);

  if (sorted.length === 0) {
    return (
      <div className="py-8 text-center bg-black/40 rounded-xl border border-white/5">
        <p className="text-sm font-semibold text-neutral-500">{tr('No telemetry yet')}</p>
      </div>
    );
  }

  // Determine latest values
  const latest = sorted[sorted.length - 1];
  const now = Date.now();
  const latestAt = new Date(latest.at).getTime();
  const EXPECTED_INTERVAL_MS = 60_000;

  // Alerts
  const alerts: string[] = [];
  
  if (profile.battery && latest.battery_pct !== null && latest.battery_pct < profile.battery.lowPct) {
    alerts.push(tr('Low Battery'));
  }
  
  const rssiProfile = profile.telemetry.find(t => t.key === 'rssi');
  if (rssiProfile?.warnBelow !== undefined && latest.rssi !== null && latest.rssi < rssiProfile.warnBelow) {
    alerts.push(tr('Weak Signal'));
  }
  
  const tempProfile = profile.telemetry.find(t => t.key === 'temp_c');
  if (tempProfile?.warnAbove !== undefined && latest.temp_c !== null && latest.temp_c > tempProfile.warnAbove) {
    alerts.push(tr('High Temperature'));
  }
  
  if (now - latestAt > 2.5 * EXPECTED_INTERVAL_MS) {
    alerts.push(tr('Stale/Dropout'));
  }

  // Pre-calculate data series
  const seriesBattery = sorted.map(p => ({ at: new Date(p.at).getTime(), value: p.battery_pct }));
  const seriesRssi = sorted.map(p => ({ at: new Date(p.at).getTime(), value: p.rssi }));
  const seriesHeap = sorted.map(p => ({ at: new Date(p.at).getTime(), value: p.heap_free }));
  const seriesTemp = sorted.map(p => ({ at: new Date(p.at).getTime(), value: p.temp_c }));

  // Gaps
  const seriesGaps: Array<{ at: number; value: number }> = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].at).getTime();
    const curr = new Date(sorted[i].at).getTime();
    seriesGaps.push({ at: curr, value: (curr - prev) / 1000 }); // gap in seconds
  }

  const rangeMs = range === '1h' ? 3600_000 : range === '24h' ? 86400_000 : 7 * 86400_000;
  const minTime = Math.max(now - rangeMs, sorted.length > 0 ? new Date(sorted[0].at).getTime() : now);
  const maxTime = now;

  return (
    <div className="space-y-4">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div className="flex items-center gap-1.5 text-red-400 font-bold text-xs uppercase tracking-wider">
            <AlertCircle size={14} />
            {tr('Alerts')}
          </div>
          {alerts.map((a, i) => (
            <span key={i} className="text-xs text-red-300 font-medium px-2 py-0.5 bg-red-500/20 rounded-full">
              {a}
            </span>
          ))}
        </div>
      )}

      {/* Range Selector */}
      <div className="flex justify-end gap-1">
        {(['1h', '24h', '7d'] as const).map(r => (
          <button
            key={r}
            onClick={() => onRangeChange?.(r)}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
              range === r 
                ? 'bg-white text-black' 
                : 'text-neutral-400 hover:text-white hover:bg-white/10'
            } ${!onRangeChange ? 'cursor-default' : ''}`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Charts */}
      {profile.battery && (
        <LineChart 
          title={tr('Battery')}
          data={seriesBattery}
          unit="%"
          minY={profile.battery.minVolt ? 0 : 0} // usually 0-100 for pct
          maxY={100}
          warnBelow={profile.battery.lowPct}
          criticalBelow={profile.battery.criticalPct}
          minTime={minTime}
          maxTime={maxTime}
          color="var(--chart-battery, #10b981)"
          fillBelow={true} // Shading for battery
        />
      )}
      
      {rssiProfile && (
        <LineChart 
          title={tr('Signal (RSSI)')}
          data={seriesRssi}
          unit="dBm"
          minY={rssiProfile.min}
          maxY={rssiProfile.max}
          warnBelow={rssiProfile.warnBelow}
          minTime={minTime}
          maxTime={maxTime}
          color="var(--chart-rssi, #3b82f6)"
        />
      )}

      {profile.telemetry.find(t => t.key === 'heap_free') && (
        <LineChart 
          title={tr('Free Heap')}
          data={seriesHeap}
          unit="KB"
          minY={profile.telemetry.find(t => t.key === 'heap_free')!.min}
          maxY={profile.telemetry.find(t => t.key === 'heap_free')!.max}
          minTime={minTime}
          maxTime={maxTime}
          color="var(--chart-heap, #8b5cf6)"
        />
      )}

      {tempProfile && (
        <LineChart 
          title={tr('Temperature')}
          data={seriesTemp}
          unit="°C"
          minY={tempProfile.min}
          maxY={tempProfile.max}
          warnAbove={tempProfile.warnAbove}
          minTime={minTime}
          maxTime={maxTime}
          color="var(--chart-temp, #f59e0b)"
        />
      )}

      <LineChart 
        title={tr('Check-in Gap')}
        data={seriesGaps}
        unit="s"
        minY={0}
        maxY={Math.max(150, ...seriesGaps.map(g => g.value))}
        warnAbove={150} // 2.5 intervals of 60s
        minTime={minTime}
        maxTime={maxTime}
        color="var(--chart-gap, #ef4444)"
      />
    </div>
  );
}

// Chart Component

interface LineChartProps {
  title: string;
  data: Array<{ at: number; value: number | null }>;
  unit: string;
  minY: number;
  maxY: number;
  warnBelow?: number;
  warnAbove?: number;
  criticalBelow?: number;
  minTime: number;
  maxTime: number;
  color: string;
  fillBelow?: boolean;
}

function LineChart({ title, data, unit, minY, maxY, warnBelow, warnAbove, criticalBelow, minTime, maxTime, color, fillBelow }: LineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Filter valid data
  const validData = data.filter(d => d.value !== null) as Array<{ at: number; value: number }>;
  
  if (validData.length === 0) {
    return (
      <div className="bg-black/40 rounded-xl border border-white/5 p-4 flex flex-col items-center justify-center h-40">
        <h3 className="text-xs font-bold text-neutral-400 mb-2 uppercase tracking-widest">{title}</h3>
        <span className="text-neutral-500 text-sm font-medium">{tr('Not reported')}</span>
      </div>
    );
  }

  const actMin = Math.min(...validData.map(d => d.value));
  const actMax = Math.max(...validData.map(d => d.value));
  const latest = validData[validData.length - 1].value;
  
  // Ensure we span the actual values if they exceed the profile boundaries
  const plotMinY = Math.min(minY, actMin);
  const plotMaxY = Math.max(maxY, actMax);
  const rangeY = plotMaxY - plotMinY || 1;
  const rangeX = maxTime - minTime || 1;

  const width = 800;
  const height = 120;
  
  const toX = (at: number) => ((at - minTime) / rangeX) * width;
  const toY = (val: number) => height - ((val - plotMinY) / rangeY) * height;

  const pathD = validData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(d.at).toFixed(1)} ${toY(d.value).toFixed(1)}`).join(' ');
  const areaD = fillBelow ? `${pathD} L ${toX(validData[validData.length - 1].at).toFixed(1)} ${height} L ${toX(validData[0].at).toFixed(1)} ${height} Z` : '';

  const getHoverAt = (e: React.MouseEvent<SVGSVGElement> | React.FocusEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ('clientX' in e ? e.clientX : rect.left + rect.width / 2) - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const time = minTime + ratio * rangeX;
    
    // Find closest point
    let closestIdx = 0;
    let minDiff = Infinity;
    validData.forEach((d, i) => {
      const diff = Math.abs(d.at - time);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });
    return closestIdx;
  };

  const activePoint = hoverIndex !== null ? validData[hoverIndex] : validData[validData.length - 1];

  return (
    <div className="bg-black/40 rounded-xl border border-white/5 p-4 flex flex-col space-y-2 group">
      <div className="flex justify-between items-baseline">
        <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{title}</h3>
        <div className="text-right">
          <span className="text-xl font-mono font-bold text-white transition-all">
            {activePoint.value.toFixed(1)}
            <span className="text-xs text-neutral-500 ml-1">{unit}</span>
          </span>
        </div>
      </div>
      
      <div className="relative w-full h-[120px]" aria-label={`${title} chart. ${trf('Min: {0}', [actMin.toFixed(1)])}, ${trf('Max: {0}', [actMax.toFixed(1)])}, ${trf('Latest: {0}', [latest.toFixed(1)])}`}>
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="absolute inset-0 w-full h-full overflow-visible focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded"
          preserveAspectRatio="none"
          onMouseMove={e => setHoverIndex(getHoverAt(e))}
          onMouseLeave={() => setHoverIndex(null)}
          onFocus={e => setHoverIndex(getHoverAt(e))}
          onBlur={() => setHoverIndex(null)}
          tabIndex={0}
        >
          <defs>
            {fillBelow && (
              <linearGradient id={`grad-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            )}
          </defs>

          {/* Warn/Critical Bands */}
          {warnBelow !== undefined && (
            <rect x="0" y={toY(warnBelow)} width={width} height={height - toY(warnBelow)} fill="rgba(234, 179, 8, 0.1)" />
          )}
          {criticalBelow !== undefined && (
            <rect x="0" y={toY(criticalBelow)} width={width} height={height - toY(criticalBelow)} fill="rgba(239, 68, 68, 0.1)" />
          )}
          {warnAbove !== undefined && (
            <rect x="0" y="0" width={width} height={toY(warnAbove)} fill="rgba(234, 179, 8, 0.1)" />
          )}

          {/* Grid lines for Min and Max */}
          <line x1="0" y1={toY(plotMaxY)} x2={width} y2={toY(plotMaxY)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="0" y1={toY(plotMinY)} x2={width} y2={toY(plotMinY)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

          {/* Area Fill */}
          {fillBelow && areaD && (
            <path d={areaD} fill={`url(#grad-${title.replace(/\s+/g, '')})`} className="transition-all duration-300" />
          )}

          {/* Line Path */}
          <path 
            d={pathD} 
            fill="none" 
            stroke={color} 
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="transition-all duration-300"
          />

          {/* Hover indicator */}
          {hoverIndex !== null && (
            <>
              <line 
                x1={toX(activePoint.at)} 
                y1="0" 
                x2={toX(activePoint.at)} 
                y2={height} 
                stroke="rgba(255,255,255,0.2)" 
                strokeWidth="1" 
              />
              <circle 
                cx={toX(activePoint.at)} 
                cy={toY(activePoint.value)} 
                r="4" 
                fill={color}
                stroke="var(--color-bg, #000)"
                strokeWidth="2"
              />
            </>
          )}
        </svg>
      </div>

      <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
        <span>{new Date(minTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span>{new Date(maxTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}
