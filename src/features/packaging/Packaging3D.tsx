/**
 * Packaging3D.tsx
 * Hairline 3D Isometric & Axonometric Packaging Visualizer
 * Powered by pure mathematics from engine.ts with zero WebGL overhead.
 */

import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { PackagingSpec } from './types';
import {
  Cam,
  proj,
  shift,
  prism,
  rectX,
  rectY,
  rectZ,
  rotX,
  rotY,
  P3
} from '../dashboard/hairline/engine';
import { Maximize2, Rotate3d, Compass, ZoomIn, ZoomOut, Eye, Layers } from 'lucide-react';

interface Packaging3DProps {
  spec: PackagingSpec;
  stagedItems?: any[];
  explodeProgress?: number; // 0 to 100
  onExplodeChange?: (val: number) => void;
  className?: string;
}

export const Packaging3D: React.FC<Packaging3DProps> = ({
  spec,
  stagedItems = [],
  explodeProgress: propExplode,
  onExplodeChange,
  className = ''
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [internalExplode, setInternalExplode] = useState(25);
  const explode = propExplode !== undefined ? propExplode : internalExplode;

  const handleExplode = (val: number) => {
    setInternalExplode(val);
    onExplodeChange?.(val);
  };

  // Camera State
  const [yaw, setYaw] = useState(45); // degrees
  const [pitch, setPitch] = useState(30); // degrees
  const [zoom, setZoom] = useState(1.0);
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const setViewPreset = (y: number, p: number) => {
    setYaw(y);
    setPitch(p);
  };

  // Drag interaction
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setYaw(prev => (prev + dx * 0.5) % 360);
    setPitch(prev => Math.max(5, Math.min(85, prev - dy * 0.4)));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Auto-fit scale factor based on dimensions
  const maxDimCm = Math.max(spec.outerCm.w, spec.outerCm.l, spec.outerCm.h, 20);
  const baseScale = Math.min(2.8, Math.max(0.6, 120 / maxDimCm)) * zoom;

  const cam: Cam = useMemo(() => {
    return {
      S: baseScale,
      cx: 300,
      cy: 230,
      pitch,
      yaw
    };
  }, [baseScale, pitch, yaw]);

  // Dimensions in scaled 3D units
  const W = spec.outerCm.w;
  const L = spec.outerCm.l;
  const H = spec.outerCm.h;

  const inW = spec.innerCm.w;
  const inL = spec.innerCm.l;
  const inH = spec.innerCm.h;

  // Center coordinate origin
  const x0 = -W / 2;
  const y0 = -L / 2;
  const z0 = 0;

  const expNorm = explode / 100; // 0.0 to 1.0

  return (
    <div className={`ps-3d-stage liquid-panel relative flex flex-col w-full h-full select-none overflow-hidden rounded-2xl ${className}`}>
      {/* ── Top Bar: Camera Presets & Telemetry ── */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
        <div className="ps-hud-pill liquid-panel flex items-center gap-1.5 pointer-events-auto px-3 py-1.5 rounded-full text-[11px] font-mono text-[var(--lq-ink)]">
          <Rotate3d size={13} className="text-[var(--main-color)]" />
          <span className="font-bold">{spec.kind.toUpperCase()}</span>
          <span className="text-[var(--lq-ink-tertiary)]">•</span>
          <span className="text-[var(--lq-ink-secondary)] tabular-nums">{W}×{L}×{H}cm</span>
        </div>

        {/* View Presets */}
        <div className="ps-seg-group liquid-panel flex items-center gap-1 pointer-events-auto">
          <button
            type="button"
            onClick={() => setViewPreset(45, 30)}
            className={`ps-seg-btn hig-touch-target px-2.5 py-1 rounded-[8px] text-[10px] font-bold cursor-pointer ${
              yaw === 45 && pitch === 30 ? 'is-active' : ''
            }`}
          >
            ISO
          </button>
          <button
            type="button"
            onClick={() => setViewPreset(0, 15)}
            className={`ps-seg-btn hig-touch-target px-2.5 py-1 rounded-[8px] text-[10px] font-bold cursor-pointer ${
              yaw === 0 && pitch === 15 ? 'is-active' : ''
            }`}
          >
            FRONT
          </button>
          <button
            type="button"
            onClick={() => setViewPreset(90, 15)}
            className={`ps-seg-btn hig-touch-target px-2.5 py-1 rounded-[8px] text-[10px] font-bold cursor-pointer ${
              yaw === 90 && pitch === 15 ? 'is-active' : ''
            }`}
          >
            SIDE
          </button>
          <button
            type="button"
            onClick={() => setViewPreset(0, 85)}
            className={`ps-seg-btn hig-touch-target px-2.5 py-1 rounded-[8px] text-[10px] font-bold cursor-pointer ${
              yaw === 0 && pitch === 85 ? 'is-active' : ''
            }`}
          >
            TOP
          </button>
        </div>
      </div>

      {/* ── Main SVG 3D Canvas ── */}
      <svg
        ref={svgRef}
        viewBox="0 0 600 450"
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <defs>
          {/* Cardboard Corrugated Gradient */}
          <linearGradient id="cardboard-face" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#92623a" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#7a4e29" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#5d3b1f" stopOpacity="0.9" />
          </linearGradient>

          {/* Crate Plywood Gradient */}
          <linearGradient id="crate-ply" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d97706" stopOpacity="0.75" />
            <stop offset="60%" stopColor="#b45309" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#78350f" stopOpacity="0.9" />
          </linearGradient>

          {/* Cleats / Skid Runner Solid Wood Gradient */}
          <linearGradient id="cleat-wood" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#92400e" stopOpacity="0.95" />
          </linearGradient>

          {/* Translucent Foam Interior */}
          <linearGradient id="foam-cushion" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
          </linearGradient>

          {/* Product Neon Stone Glow */}
          <linearGradient id="product-stone" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#10b981" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.75" />
          </linearGradient>

          {/* Drop Shadow Filter */}
          <filter id="shadow-drop" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
            <feOffset dx="0" dy="12" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.4" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Ground Grid & Shadow ── */}
        <g opacity="0.3">
          <ellipse
            cx={cam.cx}
            cy={cam.cy + cam.S * (H * 0.25 + 5)}
            rx={cam.S * Math.max(W, L) * 0.9}
            ry={cam.S * Math.max(W, L) * 0.45}
            fill="#000000"
            filter="blur(16px)"
          />
        </g>

        {/* ── 3D RENDERING BY PACKAGING KIND ── */}

        {/* 1. CARDBOARD BOX (FEFCO 0201 RSC) */}
        {spec.kind === 'cardboard' && (
          <g filter="url(#shadow-drop)">
            {/* Base Box Cavity */}
            {(() => {
              const foldAngle = (1 - expNorm) * (Math.PI / 2); // 0 = open/flat, 1 = folded closed
              const bodyPrism = prism(cam, x0, y0, z0, W, L, H, 1);

              return (
                <g>
                  {/* Internal Product Bounding Box */}
                  {stagedItems.length > 0 && (
                    <g opacity="0.8">
                      {(() => {
                        const pPrism = prism(cam, -inW / 2, -inL / 2, z0 + (H - inH) / 2, inW, inL, inH, 1);
                        return (
                          <path
                            d={pPrism.body}
                            fill="url(#product-stone)"
                            stroke="#34d399"
                            strokeWidth="1.2"
                            strokeDasharray="4,3"
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      })()}
                    </g>
                  )}

                  {/* Main Carton Body Walls */}
                  <path
                    d={bodyPrism.body}
                    fill="url(#cardboard-face)"
                    stroke="#e2b17b"
                    strokeWidth="1.2"
                    strokeOpacity="0.8"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={bodyPrism.crease}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1"
                    strokeDasharray="4,3"
                    strokeOpacity="0.4"
                    vectorEffect="non-scaling-stroke"
                  />

                  {/* Flap Hinge Lines & Folding Top Flaps */}
                  {(() => {
                    const flapH = (W / 2) * expNorm;
                    const topZ = z0 + H;

                    // Front flap
                    const p1 = proj(cam, x0, y0, topZ);
                    const p2 = proj(cam, x0 + W, y0, topZ);
                    const p3 = proj(cam, x0 + W, y0 - flapH * (1 - expNorm), topZ + flapH * expNorm);
                    const p4 = proj(cam, x0, y0 - flapH * (1 - expNorm), topZ + flapH * expNorm);

                    return (
                      <polygon
                        points={`${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]} ${p4[0]},${p4[1]}`}
                        fill="#b4784a"
                        stroke="#e2b17b"
                        strokeWidth="1.2"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })()}
                </g>
              );
            })()}
          </g>
        )}

        {/* 2. ISPM-15 CLEATED PLYWOOD CRATE */}
        {spec.kind === 'crate' && (
          <g filter="url(#shadow-drop)">
            {(() => {
              const skidH = 8.9;
              const skidW = 8.9;
              const skidCount = spec.skidMm?.count ?? 3;
              const shiftDist = expNorm * 18; // explode distance in cm

              return (
                <g>
                  {/* A. Skid Runners (Anchor Base) */}
                  {Array.from({ length: skidCount }).map((_, idx) => {
                    const runnerX = x0 + (idx / Math.max(1, skidCount - 1)) * (W - skidW);
                    const p = prism(cam, runnerX, y0, z0, skidW, L, skidH, 0.5);
                    return (
                      <path
                        key={`skid-${idx}`}
                        d={p.body}
                        fill="url(#cleat-wood)"
                        stroke="#f59e0b"
                        strokeWidth="1.2"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}

                  {/* B. Floor Plywood Bed (18mm) */}
                  {(() => {
                    const floorZ = z0 + skidH;
                    const floorP = prism(cam, x0, y0, floorZ, W, L, 1.8, 0.5);
                    return (
                      <path
                        d={floorP.body}
                        fill="url(#crate-ply)"
                        stroke="#d97706"
                        strokeWidth="1.2"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })()}

                  {/* C. Internal Foam Cushion & Product (Revealed in Explode) */}
                  {expNorm > 0.1 && (
                    <g>
                      {/* Foam envelope */}
                      {(() => {
                        const foamZ = z0 + skidH + 1.8;
                        const foamP = prism(cam, x0 + 3, y0 + 3, foamZ, W - 6, L - 6, H - skidH - 4, 0.5);
                        return (
                          <path
                            d={foamP.body}
                            fill="url(#foam-cushion)"
                            stroke="#38bdf8"
                            strokeWidth="1"
                            strokeOpacity="0.4"
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      })()}

                      {/* Product Bounding Prism */}
                      {stagedItems.length > 0 && (() => {
                        const pZ = z0 + skidH + 3.5;
                        const prodP = prism(cam, -inW / 2, -inL / 2, pZ, inW, inL, inH, 1);
                        return (
                          <g>
                            <path
                              d={prodP.body}
                              fill="url(#product-stone)"
                              stroke="#34d399"
                              strokeWidth="1.5"
                              vectorEffect="non-scaling-stroke"
                            />
                            <text
                              x={proj(cam, 0, 0, pZ + inH / 2)[0]}
                              y={proj(cam, 0, 0, pZ + inH / 2)[1]}
                              fill="#ffffff"
                              fontSize="11"
                              fontWeight="bold"
                              fontFamily="monospace"
                              textAnchor="middle"
                            >
                              CARGO ({stagedItems.length} items)
                            </text>
                          </g>
                        );
                      })()}
                    </g>
                  )}

                  {/* D. Exploded Walls: Front, Back, Left, Right */}
                  {(() => {
                    const wallZ = z0 + skidH + 1.8;
                    const wallH = H - skidH - 3.6;

                    // Front Wall (-Y displacement)
                    const frontY = y0 - shiftDist;
                    const frontWall = prism(cam, x0, frontY, wallZ, W, 1.2, wallH, 0.5);

                    // Back Wall (+Y displacement)
                    const backY = y0 + L + shiftDist;
                    const backWall = prism(cam, x0, backY, wallZ, W, 1.2, wallH, 0.5);

                    // Left Wall (-X displacement)
                    const leftX = x0 - shiftDist;
                    const leftWall = prism(cam, leftX, y0, wallZ, 1.2, L, wallH, 0.5);

                    // Right Wall (+X displacement)
                    const rightX = x0 + W + shiftDist;
                    const rightWall = prism(cam, rightX, y0, wallZ, 1.2, L, wallH, 0.5);

                    return (
                      <g>
                        <path d={backWall.body} fill="url(#crate-ply)" stroke="#d97706" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                        <path d={leftWall.body} fill="url(#crate-ply)" stroke="#d97706" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                        <path d={frontWall.body} fill="url(#crate-ply)" stroke="#d97706" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                        <path d={rightWall.body} fill="url(#crate-ply)" stroke="#d97706" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                      </g>
                    );
                  })()}

                  {/* E. Top Lid Panel (+Z Lift displacement) */}
                  {(() => {
                    const lidZ = z0 + H + shiftDist * 1.5;
                    const lidP = prism(cam, x0, y0, lidZ, W, L, 1.2, 0.5);
                    return (
                      <g>
                        <path
                          d={lidP.body}
                          fill="url(#crate-ply)"
                          stroke="#d97706"
                          strokeWidth="1.2"
                          vectorEffect="non-scaling-stroke"
                        />
                        {/* Lid Perimeter Cleats */}
                        {(() => {
                          const cleatP = prism(cam, x0 + 1.5, y0 + 1.5, lidZ + 1.2, W - 3, L - 3, 1.9, 0.5);
                          return (
                            <path
                              d={cleatP.crease}
                              fill="none"
                              stroke="#f59e0b"
                              strokeWidth="1.5"
                              vectorEffect="non-scaling-stroke"
                            />
                          );
                        })()}
                      </g>
                    );
                  })()}
                </g>
              );
            })()}
          </g>
        )}

        {/* 3. FREIGHT PALLET */}
        {spec.kind === 'pallet' && (
          <g filter="url(#shadow-drop)">
            {(() => {
              const runnerH = 8.9;
              const runnerW = 3.8;
              const deckThick = 2.0;
              const runnerCount = spec.skidMm?.count ?? 3;
              const topBoards = spec.deckboards?.countTop ?? 7;

              return (
                <g>
                  {/* Stringers / Runners */}
                  {Array.from({ length: runnerCount }).map((_, idx) => {
                    const rX = x0 + (idx / Math.max(1, runnerCount - 1)) * (W - runnerW);
                    const p = prism(cam, rX, y0, z0, runnerW, L, runnerH, 0.5);
                    return (
                      <path
                        key={`pal-runner-${idx}`}
                        d={p.body}
                        fill="url(#cleat-wood)"
                        stroke="#f59e0b"
                        strokeWidth="1.2"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}

                  {/* Top Deckboards */}
                  {Array.from({ length: topBoards }).map((_, idx) => {
                    const bL = (L - 9.5) / Math.max(1, topBoards - 1);
                    const bY = y0 + idx * bL;
                    const lift = expNorm * 12;
                    const p = prism(cam, x0, bY, z0 + runnerH + lift, W, 9.5, deckThick, 0.5);
                    return (
                      <path
                        key={`pal-deck-${idx}`}
                        d={p.body}
                        fill="url(#cleat-wood)"
                        stroke="#f59e0b"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}

                  {/* Cargo Load Envelope (when stacked) */}
                  {stagedItems.length > 0 && (() => {
                    const cargoZ = z0 + runnerH + deckThick + expNorm * 18;
                    const cargoP = prism(cam, -inW / 2, -inL / 2, cargoZ, inW, inL, inH, 1);
                    return (
                      <path
                        d={cargoP.body}
                        fill="url(#product-stone)"
                        stroke="#34d399"
                        strokeWidth="1.5"
                        strokeDasharray="4,4"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })()}
                </g>
              );
            })()}
          </g>
        )}
      </svg>

      {/* ── Bottom Controls: Explode / Fold Scrub Slider ── */}
      <div className="ps-hud-bar liquid-panel absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between gap-3 px-4 py-2 rounded-2xl">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[var(--main-color)] shrink-0" />
          <span className="text-[11px] font-mono text-[var(--lq-ink-secondary)] font-semibold whitespace-nowrap">
            {spec.kind === 'cardboard' ? 'FOLD / ASSEMBLE' : 'EXPLODED VIEW'}
          </span>
        </div>

        {/* Scrub Slider */}
        <div className="flex-1 flex items-center gap-2 max-w-xs">
          <span className="text-[10px] font-mono text-[var(--lq-ink-tertiary)]">0%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={explode}
            onChange={e => handleExplode(Number(e.target.value))}
            className="w-full h-1.5 rounded-lg cursor-pointer"
          />
          <span className="text-[10px] font-mono text-[var(--main-color)] font-bold min-w-[32px] text-right tabular-nums">
            {explode}%
          </span>
        </div>

        {/* Zoom Steppers */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom(z => Math.max(0.5, z - 0.15))}
            className="liquid-control hig-touch-target p-2 rounded-xl flex items-center justify-center cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
            className="liquid-control hig-touch-target p-2 rounded-xl flex items-center justify-center cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
