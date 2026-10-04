import React from 'react';
import { tr, trf } from '../../../../../lib/i18n';

interface HeadPoseGaugeProps {
  pan?: number;
  tilt?: number;
}

export const HeadPoseGauge: React.FC<HeadPoseGaugeProps> = ({ pan, tilt }) => {
  const hasData = pan !== undefined || tilt !== undefined;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-28 bg-black/40 rounded-xl border border-white/5 text-neutral-500 p-4">
        <span className="text-[10px] font-bold uppercase tracking-widest">{tr('Head Pose')}</span>
        <span className="text-xs mt-2">{tr('Not reported')}</span>
      </div>
    );
  }

  const panValue = pan ?? 0;
  const tiltValue = tilt ?? 0;

  // Pan is -90 to +90 (0 is straight ahead). Top-down arc.
  // Center is (50,50), radius 40. Arc from (-90) -> (90).
  const panRad = panValue * Math.PI / 180;
  const panX = 50 + 40 * Math.sin(panRad);
  const panY = 50 - 40 * Math.cos(panRad);

  // Tilt is 0 to 90 (0 is flat, 90 is looking down). Side arc.
  // Center is (10,10), radius 40. Arc from 0 -> 90.
  const tiltRad = tiltValue * Math.PI / 180;
  const tiltX = 10 + 40 * Math.cos(tiltRad);
  const tiltY = 10 + 40 * Math.sin(tiltRad);

  return (
    <div 
      className="bg-black/40 border border-white/5 p-4 rounded-xl flex flex-col justify-between" 
      aria-label={trf('Head pose: Pan {pan} degrees, Tilt {tilt} degrees', { pan: panValue, tilt: tiltValue })}
    >
      <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">{tr('Head Pose')}</div>
      <div className="flex gap-4 w-full justify-around items-center">
        {/* Pan Dial */}
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 100 50" className="w-24 h-12 overflow-visible" role="img" aria-label={tr('Pan dial')}>
            {/* Background arc from -90 to 90 */}
            <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="currentColor" className="text-white/10" strokeWidth="6" strokeLinecap="round" />
            <line x1="50" y1="50" x2={panX} y2={panY} stroke="currentColor" className="text-cyan-400" strokeWidth="3" strokeLinecap="round" />
            <circle cx={panX} cy={panY} r="3" fill="currentColor" className="text-cyan-400" />
            <circle cx="50" cy="50" r="2" fill="currentColor" className="text-white/50" />
          </svg>
          <div className="text-[10px] text-neutral-400 font-mono mt-2">{tr('Pan')} {panValue.toFixed(0)}°</div>
        </div>

        {/* Tilt Arc */}
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 50 50" className="w-12 h-12 overflow-visible" role="img" aria-label={tr('Tilt arc')}>
            {/* Background arc from 0 to 90 */}
            <path d="M 50 10 A 40 40 0 0 1 10 50" fill="none" stroke="currentColor" className="text-white/10" strokeWidth="6" strokeLinecap="round" />
            <line x1="10" y1="10" x2={tiltX} y2={tiltY} stroke="currentColor" className="text-indigo-400" strokeWidth="3" strokeLinecap="round" />
            <circle cx={tiltX} cy={tiltY} r="3" fill="currentColor" className="text-indigo-400" />
            <circle cx="10" cy="10" r="2" fill="currentColor" className="text-white/50" />
          </svg>
          <div className="text-[10px] text-neutral-400 font-mono mt-2">{tr('Tilt')} {tiltValue.toFixed(0)}°</div>
        </div>
      </div>
    </div>
  );
};
