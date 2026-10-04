import React, { memo } from 'react';
import { FaceExpression, EXPRESSIONS, ShapeSpec } from './expressions';
import { trf } from '../../../lib/i18n';

const STYLES = `
  @keyframes onyx-blink {
    0%, 96% { transform: scaleY(1); }
    98% { transform: scaleY(0.1); }
    100% { transform: scaleY(1); }
  }
  @keyframes onyx-speak {
    0% { transform: scaleY(1); }
    50% { transform: scaleY(var(--onyx-speak, 0)); }
    100% { transform: scaleY(1); }
  }
  @keyframes onyx-dot {
    0%, 100% { opacity: 0.3; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1.2); }
  }
  .onyx-face-eyes {
    transform-origin: 160px 100px;
    animation: onyx-blink 4.2s infinite linear;
    transition: transform 90ms linear;
    transform-box: fill-box;
  }
  .onyx-face-mouth {
    transform-origin: 160px 160px;
    transition: transform 90ms linear;
    transform-box: fill-box;
  }
  .onyx-face-mouth-speak {
    animation: onyx-speak 150ms infinite ease-in-out;
  }
  .onyx-face-dot {
    animation: onyx-dot 1.4s infinite ease-in-out;
    transform-origin: center;
    transform-box: fill-box;
  }
  .onyx-face-dot-1 { animation-delay: 0s; }
  .onyx-face-dot-2 { animation-delay: 0.2s; }
  .onyx-face-dot-3 { animation-delay: 0.4s; }
  @media (prefers-reduced-motion: reduce) {
    .onyx-face-eyes, .onyx-face-mouth, .onyx-face-mouth-speak, .onyx-face-dot {
      animation: none !important;
      transition: none !important;
    }
  }
`;

function renderShape(shape: ShapeSpec, key: string | number) {
  const { type, ...props } = shape;
  if (type === 'path') return <path key={key} {...props} />;
  if (type === 'circle') return <circle key={key} {...props} />;
  if (type === 'ellipse') return <ellipse key={key} {...props} />;
  if (type === 'line') return <line key={key} {...props} />;
  if (type === 'text') return <text key={key} {...props}>{props.text}</text>;
  return null;
}

export interface OnyxFaceProps {
  expression: FaceExpression;
  speakingLevel?: number;
  size?: number;
  tone?: 'amber' | 'emerald' | 'mono';
  className?: string;
  title?: string;
}

export const OnyxFace = memo(function OnyxFace({
  expression,
  speakingLevel = 0,
  size = 40,
  tone = 'amber',
  className = '',
  title,
}: OnyxFaceProps) {
  const height = size * 0.75;
  const ariaLabel = title || trf('Onyx assistant face: {expression}', { expression });

  let bgClass = 'bg-amber-500 text-black';
  if (tone === 'emerald') bgClass = 'bg-emerald-950 text-emerald-500';
  if (tone === 'mono') bgClass = 'bg-zinc-900 text-white';

  const speakScale = speakingLevel > 0 ? 0.2 + speakingLevel * 1.5 : 1;
  const isSpeaking = expression === 'speaking' && speakingLevel > 0;
  
  const expressionKeys = Object.keys(EXPRESSIONS) as FaceExpression[];
  
  return (
    <div 
      className={`relative inline-flex items-center justify-center rounded-xl overflow-hidden ${bgClass} ${className}`}
      style={{ width: size, height }}
      aria-label={ariaLabel}
      role="img"
    >
      <style>{STYLES}</style>
      <svg 
        viewBox="0 0 320 240" 
        className="w-full h-full"
        style={{ '--onyx-speak': speakScale } as React.CSSProperties}
      >
        {expressionKeys.map(key => {
          const spec = EXPRESSIONS[key];
          const isActive = key === expression;
          return (
            <g 
              key={key}
              stroke="currentColor" 
              strokeWidth="8" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              style={{
                opacity: isActive ? 1 : 0,
                transition: 'opacity 120ms linear',
                pointerEvents: isActive ? 'auto' : 'none'
              }}
            >
              <g className="onyx-face-eyes" style={{ transform: 'translate(calc(var(--onyx-gx, 0) * 14px), calc(var(--onyx-gy, 0) * 9px))' }}>
                {renderShape(spec.left, 'l')}
                {renderShape(spec.right, 'r')}
              </g>
              <g className={`onyx-face-mouth ${key === 'speaking' && isSpeaking ? 'onyx-face-mouth-speak' : ''}`} style={{ transform: 'translate(calc(var(--onyx-gx, 0) * 6px), calc(var(--onyx-gy, 0) * 4px))' }}>
                {renderShape(spec.mouth, 'm')}
              </g>
              {spec.extras && <g>{spec.extras.map((extra, i) => renderShape(extra, \`ex-\${i}\`))}</g>}
            </g>
          );
        })}
      </svg>
    </div>
  );
});
