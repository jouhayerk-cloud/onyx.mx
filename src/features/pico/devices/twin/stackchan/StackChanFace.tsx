import React from 'react';
import { tr, trf } from '../../../../../lib/i18n';
import { Monitor } from 'lucide-react';

/** Renders the StackChan screen as an SVG face for an expression, or a placeholder if none. */
export const StackChanFace: React.FC<{ expression?: string }> = ({ expression }) => {
  const expr = expression || 'not_reported';
  
  if (expr === 'not_reported') {
    return (
      <div className="w-full h-full aspect-[4/3] flex flex-col items-center justify-center bg-black/40 rounded-xl border border-white/5 text-neutral-500" aria-label={tr('Screen not reported')}>
        <Monitor size={48} className="mb-3 opacity-30" />
        <span className="text-xs font-semibold">{tr('Not reported')}</span>
      </div>
    );
  }

  const ex = expression.toLowerCase();
  
  let leftEye = <circle cx="100" cy="100" r="16" fill="white" />;
  let rightEye = <circle cx="220" cy="100" r="16" fill="white" />;
  let mouth = <path d="M 140 160 Q 160 160 180 160" stroke="white" strokeWidth="8" strokeLinecap="round" fill="none" />;
  
  let label = null;
  const isKnown = ['happy', 'sad', 'angry', 'surprised', 'sleepy', 'listening', 'speaking', 'neutral'].includes(ex);

  switch (ex) {
    case 'happy':
      leftEye = <path d="M 80 100 Q 100 70 120 100" stroke="white" strokeWidth="8" strokeLinecap="round" fill="none" />;
      rightEye = <path d="M 200 100 Q 220 70 240 100" stroke="white" strokeWidth="8" strokeLinecap="round" fill="none" />;
      mouth = <path d="M 130 150 Q 160 180 190 150" stroke="white" strokeWidth="8" strokeLinecap="round" fill="none" />;
      break;
    case 'sad':
      leftEye = <path d="M 80 90 Q 100 80 120 110" stroke="white" strokeWidth="8" strokeLinecap="round" fill="none" />;
      rightEye = <path d="M 200 110 Q 220 80 240 90" stroke="white" strokeWidth="8" strokeLinecap="round" fill="none" />;
      mouth = <path d="M 140 170 Q 160 150 180 170" stroke="white" strokeWidth="8" strokeLinecap="round" fill="none" />;
      break;
    case 'angry':
      leftEye = <path d="M 80 80 L 120 100" stroke="white" strokeWidth="8" strokeLinecap="round" />;
      rightEye = <path d="M 200 100 L 240 80" stroke="white" strokeWidth="8" strokeLinecap="round" />;
      mouth = <path d="M 140 160 Q 160 150 180 160" stroke="white" strokeWidth="8" strokeLinecap="round" fill="none" />;
      break;
    case 'surprised':
      leftEye = <circle cx="100" cy="100" r="20" fill="none" stroke="white" strokeWidth="8" />;
      rightEye = <circle cx="220" cy="100" r="20" fill="none" stroke="white" strokeWidth="8" />;
      mouth = <circle cx="160" cy="165" r="12" fill="none" stroke="white" strokeWidth="8" />;
      break;
    case 'sleepy':
      leftEye = <path d="M 80 100 L 120 100" stroke="white" strokeWidth="8" strokeLinecap="round" />;
      rightEye = <path d="M 200 100 L 240 100" stroke="white" strokeWidth="8" strokeLinecap="round" />;
      break;
    case 'listening':
      mouth = <path d="M 150 160 Q 160 160 170 160" stroke="white" strokeWidth="8" strokeLinecap="round" fill="none" />;
      break;
    case 'speaking':
      mouth = <ellipse cx="160" cy="160" rx="16" ry="12" fill="white" />;
      break;
    case 'neutral':
      break;
    default:
      label = <text x="160" y="210" fill="white" fontSize="16" textAnchor="middle" opacity="0.5" fontWeight="bold">{ex}</text>;
      break;
  }

  return (
    <div 
      className="w-full h-full aspect-[4/3] bg-amber-500 rounded-xl overflow-hidden shadow-inner flex items-center justify-center relative border border-black/10" 
      aria-label={trf('Screen showing {expression}', { expression: isKnown ? ex : 'unknown' })}
    >
      <svg viewBox="0 0 320 240" className="w-full h-full drop-shadow-md">
        {leftEye}
        {rightEye}
        {mouth}
        {label}
      </svg>
    </div>
  );
};
