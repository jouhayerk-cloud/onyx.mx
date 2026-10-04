import React from 'react';
import { tr } from '../../../lib/i18n';
import type { TelemetryPoint } from './types';

interface SeriesProps {
  label: string;
  unit: string;
  color: string;
  points: { t: number; v: number }[];
}

const W = 160;
const H = 36;

/** One series, drawn to scale between its own real min and max. */
const Series: React.FC<SeriesProps> = ({ label, unit, color, points }) => {
  if (points.length < 2) {
    return (
      <div>
        <div className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">{label}</div>
        <div className="text-[10px] font-mono text-neutral-600">{tr('No telemetry yet')}</div>
      </div>
    );
  }
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const t0 = points[0].t;
  const span = Math.max(1, points[points.length - 1].t - t0);
  const range = max - min || 1; // flat series draws as a centred line
  const x = (t: number) => ((t - t0) / span) * W;
  const y = (v: number) => (max === min ? H / 2 : H - 2 - ((v - min) / range) * (H - 4));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{label}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color }}>{last.v}{unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-9" role="img" aria-label={label}>
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[9px] font-mono text-neutral-500">
        <span>{tr('min')} {min}{unit}</span>
        <span>{tr('max')} {max}{unit}</span>
      </div>
    </div>
  );
};

export const TelemetrySparkline: React.FC<{ points: TelemetryPoint[] }> = ({ points }) => {
  const series = (pick: (p: TelemetryPoint) => number | null) =>
    points.flatMap((p) => {
      const v = pick(p);
      const t = Date.parse(p.at);
      return v === null || Number.isNaN(t) ? [] : [{ t, v }];
    });

  return (
    <div className="grid grid-cols-2 gap-3">
      <Series label={tr('Battery')} unit="%" color="#34d399" points={series((p) => p.battery_pct)} />
      <Series label={tr('Signal (RSSI)')} unit=" dBm" color="#22d3ee" points={series((p) => p.rssi)} />
    </div>
  );
};
