import React from 'react';

/**
 * Liquid Onyx Refraction & Specular SVG Filters
 *
 * Provides GPU-accelerated SVG filter primitives for Liquid Glass materials:
 * - #lq-refract: full surface refraction with edge-weighting & chromatic split (scale 18-28)
 * - #lq-refract-soft: subtle panel refraction for nested containers (scale ~8)
 * - Retains legacy SVG filters (#pack-upper, #pack-lower, #liquid-glass-new, #fresnel, #round)
 */
export const LiquidOnyxFilters: React.FC = () => {
  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      style={{ position: 'absolute', pointerEvents: 'none' }}
    >
      <defs>
        {/* Full Liquid Onyx Refraction: edge-weighted displacement + chromatic split (~18-28 scale) */}
        <filter
          id="lq-refract"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          {/* Procedural wave distortion */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.015 0.015"
            numOctaves="2"
            seed="5"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="3" result="blurredNoise" />

          {/* Edge weighting: mask derived from SourceAlpha boundary */}
          <feMorphology in="SourceAlpha" operator="erode" radius="18" result="inner" />
          <feGaussianBlur in="inner" stdDeviation="8" result="innerBlur" />
          <feColorMatrix
            in="innerBlur"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1 1"
            result="edgeFactor"
          />
          {/* Neutral displacement (0.5) in interior, full displacement at bezel */}
          <feComposite
            in="blurredNoise"
            in2="edgeFactor"
            operator="arithmetic"
            k1="1"
            k2="0"
            k3="-0.5"
            k4="0.5"
            result="edgeMap"
          />

          {/* Chromatic split (R: 26, G: 22, B: 18) */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="edgeMap"
            scale="26"
            xChannelSelector="R"
            yChannelSelector="G"
            result="rDisp"
          />
          <feColorMatrix
            in="rDisp"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="rOnly"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="edgeMap"
            scale="22"
            xChannelSelector="R"
            yChannelSelector="G"
            result="gDisp"
          />
          <feColorMatrix
            in="gDisp"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="gOnly"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="edgeMap"
            scale="18"
            xChannelSelector="R"
            yChannelSelector="G"
            result="bDisp"
          />
          <feColorMatrix
            in="bDisp"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="bOnly"
          />

          {/* Recombine channels */}
          <feBlend in="rOnly" in2="gOnly" mode="screen" result="rg" />
          <feBlend in="rg" in2="bOnly" mode="screen" result="rgb" />
          <feComposite in="rgb" in2="SourceGraphic" operator="in" />
        </filter>

        {/* Soft Liquid Onyx Refraction for panels: scale ~8 with subtle chromatic split */}
        <filter
          id="lq-refract-soft"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02 0.02"
            numOctaves="2"
            seed="5"
            result="noiseSoft"
          />
          <feGaussianBlur in="noiseSoft" stdDeviation="2" result="blurredNoiseSoft" />

          {/* Panel edge weighting */}
          <feMorphology in="SourceAlpha" operator="erode" radius="10" result="innerSoft" />
          <feGaussianBlur in="innerSoft" stdDeviation="5" result="innerBlurSoft" />
          <feColorMatrix
            in="innerBlurSoft"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1 1"
            result="edgeFactorSoft"
          />
          <feComposite
            in="blurredNoiseSoft"
            in2="edgeFactorSoft"
            operator="arithmetic"
            k1="1"
            k2="0"
            k3="-0.5"
            k4="0.5"
            result="edgeMapSoft"
          />

          {/* Chromatic split (R: 9, G: 8, B: 7) */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="edgeMapSoft"
            scale="9"
            xChannelSelector="R"
            yChannelSelector="G"
            result="rDispSoft"
          />
          <feColorMatrix
            in="rDispSoft"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="rOnlySoft"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="edgeMapSoft"
            scale="8"
            xChannelSelector="R"
            yChannelSelector="G"
            result="gDispSoft"
          />
          <feColorMatrix
            in="gDispSoft"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="gOnlySoft"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="edgeMapSoft"
            scale="7"
            xChannelSelector="R"
            yChannelSelector="G"
            result="bDispSoft"
          />
          <feColorMatrix
            in="bDispSoft"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="bOnlySoft"
          />

          {/* Recombine channels */}
          <feBlend in="rOnlySoft" in2="gOnlySoft" mode="screen" result="rgSoft" />
          <feBlend in="rgSoft" in2="bOnlySoft" mode="screen" result="rgbSoft" />
          <feComposite in="rgbSoft" in2="SourceGraphic" operator="in" />
        </filter>

        {/* Legacy filters */}
        <filter id="pack-upper" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="255 0 0 0 0  0 255 0 0 0  0 0 255 0 0  0 0 0 1 0" />
        </filter>
        <filter id="pack-lower" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.00392 0 0 0 0  0 0.00392 0 0 0  0 0 0.00392 0 0  0 0 0 1 0" />
        </filter>
        <filter id="liquid-glass-new" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
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
        <filter id="round" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
};
