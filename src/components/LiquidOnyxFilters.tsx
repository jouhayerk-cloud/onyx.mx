import React from 'react';

export const LiquidOnyxFilters: React.FC = () => {
  return (
    <svg style={{ width: 0, height: 0, position: 'absolute', pointerEvents: 'none' }} aria-hidden="true">
      <defs>
        {/* Sub-pixel lighting accuracy - pack upper bits */}
        <filter id="pack-upper" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="255 0 0 0 0  0 255 0 0 0  0 0 255 0 0  0 0 0 1 0" />
        </filter>

        {/* Sub-pixel lighting accuracy - pack lower bits */}
        <filter id="pack-lower" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.00392 0 0 0 0  0 0.00392 0 0 0  0 0 0.00392 0 0  0 0 0 1 0" />
        </filter>

        {/* Liquid Refraction & Lighting */}
        <filter id="liquid-glass-new" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>

        {/* Fresnel Outline */}
        <filter id="fresnel" colorInterpolationFilters="sRGB">
          <feMorphology operator="dilate" radius="1" in="SourceAlpha" result="edge" />
          <feComposite operator="out" in="edge" in2="SourceAlpha" result="edge-only" />
          <feGaussianBlur stdDeviation="1" in="edge-only" result="fresnel-glow" />
          <feColorMatrix type="matrix" values="1 0 0 0 1  0 1 0 0 1  0 0 1 0 1  0 0 0 0.5 0" in="fresnel-glow" result="colored-fresnel" />
          <feMerge>
             <feMergeNode in="colored-fresnel" />
             <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Gooey Liquid Button Filter */}
        <filter id="round" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
};
