/**
 * Packaging3D.tsx
 * Interactive Hairline 3D Packaging Visualizer & Cardboard Fold Engine
 * Pure mathematical 3D projection with zero WebGL overhead.
 * Supports: Drag-to-rotate (mouse + touch), pinch/wheel zoom, camera presets,
 * inertia physics (reduced-motion respected), and FEFCO 0201 Cardboard fold kinematics.
 */

import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { PackagingSpec } from './types';
import {
  Rotate3d,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  RotateCcw,
  Layers,
  Box,
  Sliders
} from 'lucide-react';

interface Packaging3DProps {
  spec: PackagingSpec;
  stagedItems?: any[];
  explodeProgress?: number; // 0 to 100
  onExplodeChange?: (val: number) => void;
  className?: string;
}

type Point3D = [number, number, number];
type Point2D = [number, number];

interface RenderQuad {
  points: Point2D[];
  depth: number;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  strokeDash?: string;
  isCrease?: boolean;
}

export const Packaging3D: React.FC<Packaging3DProps> = ({
  spec,
  stagedItems = [],
  explodeProgress: propExplode,
  onExplodeChange,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Internal scrub progress (0 to 100)
  const [internalProgress, setInternalProgress] = useState(
    spec.kind === 'cardboard' ? 100 : 25
  );
  const progress = propExplode !== undefined ? propExplode : internalProgress;

  const handleProgressChange = (val: number) => {
    setInternalProgress(val);
    onExplodeChange?.(val);
  };

  // Auto-play animation state for cardboard fold / crate explode
  const [isPlaying, setIsPlaying] = useState(false);
  const playDir = useRef<number>(1);
  const animFrameRef = useRef<number | null>(null);

  // Reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Camera Orbit & View State
  const [yaw, setYaw] = useState(45); // degrees (azimuth)
  const [pitch, setPitch] = useState(30); // degrees (elevation, 5 to 85)
  const [zoom, setZoom] = useState(1.0);

  // Drag & Touch Pinch State
  const [isDragging, setIsDragging] = useState(false);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastDragTime = useRef<number>(0);
  const velocity = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const inertiaRaf = useRef<number | null>(null);
  const initialPinchDist = useRef<number | null>(null);
  const initialPinchZoom = useRef<number>(1.0);

  // Smooth preset transition
  const presetTarget = useRef<{ yaw: number; pitch: number } | null>(null);

  const setViewPreset = (targetYaw: number, targetPitch: number) => {
    if (prefersReducedMotion) {
      setYaw(targetYaw);
      setPitch(targetPitch);
      return;
    }
    presetTarget.current = { yaw: targetYaw, pitch: targetPitch };
  };

  // Preset transition RAF
  useEffect(() => {
    let active = true;
    const animatePreset = () => {
      if (!active) return;
      if (presetTarget.current) {
        const { yaw: ty, pitch: tp } = presetTarget.current;
        let diffY = ((ty - yaw + 540) % 360) - 180;
        let diffP = tp - pitch;

        if (Math.abs(diffY) < 0.5 && Math.abs(diffP) < 0.5) {
          setYaw(ty);
          setPitch(tp);
          presetTarget.current = null;
        } else {
          setYaw(prev => (prev + diffY * 0.18 + 360) % 360);
          setPitch(prev => prev + diffP * 0.18);
        }
      }
      requestAnimationFrame(animatePreset);
    };
    const id = requestAnimationFrame(animatePreset);
    return () => {
      active = false;
      cancelAnimationFrame(id);
    };
  }, [yaw, pitch]);

  // Pointer down (Mouse or Touch)
  const handlePointerDown = (e: React.PointerEvent) => {
    // Stop any running inertia or preset transition
    if (inertiaRaf.current) {
      cancelAnimationFrame(inertiaRaf.current);
      inertiaRaf.current = null;
    }
    presetTarget.current = null;

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.current.size === 1) {
      setIsDragging(true);
      velocity.current = { vx: 0, vy: 0 };
      lastDragTime.current = performance.now();
    } else if (activePointers.current.size === 2) {
      // Begin pinch
      const pts = Array.from(activePointers.current.values());
      initialPinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialPinchZoom.current = zoom;
    }
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  // Pointer move
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activePointers.current.has(e.pointerId)) return;

    const prev = activePointers.current.get(e.pointerId)!;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2 && initialPinchDist.current) {
      // 2-finger pinch zoom
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const factor = dist / initialPinchDist.current;
      setZoom(Math.max(0.4, Math.min(3.0, initialPinchZoom.current * factor)));
      return;
    }

    if (activePointers.current.size === 1 && isDragging) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      const now = performance.now();
      const dt = Math.max(1, now - lastDragTime.current);
      lastDragTime.current = now;

      // Track instantaneous velocity
      velocity.current = {
        vx: dx / dt,
        vy: dy / dt
      };

      setYaw(y => (y + dx * 0.5 + 360) % 360);
      setPitch(p => Math.max(5, Math.min(85, p - dy * 0.4)));
    }
  };

  // Pointer up
  const handlePointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    if (activePointers.current.size === 0) {
      setIsDragging(false);
      initialPinchDist.current = null;

      // Launch inertia if not reduced motion
      if (!prefersReducedMotion && (Math.abs(velocity.current.vx) > 0.1 || Math.abs(velocity.current.vy) > 0.1)) {
        let vx = velocity.current.vx * 14;
        let vy = velocity.current.vy * 14;

        const decayInertia = () => {
          vx *= 0.92;
          vy *= 0.92;

          setYaw(y => (y + vx * 0.4 + 360) % 360);
          setPitch(p => Math.max(5, Math.min(85, p - vy * 0.3)));

          if (Math.abs(vx) > 0.05 || Math.abs(vy) > 0.05) {
            inertiaRaf.current = requestAnimationFrame(decayInertia);
          } else {
            inertiaRaf.current = null;
          }
        };
        inertiaRaf.current = requestAnimationFrame(decayInertia);
      }
    } else if (activePointers.current.size === 1) {
      // Switched from 2-pointer pinch to 1-pointer drag
      initialPinchDist.current = null;
      lastDragTime.current = performance.now();
    }
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * -0.0015;
    setZoom(z => Math.max(0.4, Math.min(3.0, z + delta)));
  };

  // Auto-play RAF loop
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    let lastTime = performance.now();
    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      setInternalProgress(current => {
        const step = dt * 38 * playDir.current;
        let next = current + step;
        if (next >= 100) {
          next = 100;
          playDir.current = -1;
        } else if (next <= 0) {
          next = 0;
          playDir.current = 1;
        }
        onExplodeChange?.(Math.round(next));
        return next;
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, onExplodeChange]);

  // Dimensions
  const W = spec.outerCm.w;
  const L = spec.outerCm.l;
  const H = spec.outerCm.h;
  const inW = spec.innerCm.w;
  const inL = spec.innerCm.l;
  const inH = spec.innerCm.h;

  // Camera scale and center
  const maxDimCm = Math.max(W, L, H, 20);
  const baseScale = Math.min(2.8, Math.max(0.6, 120 / maxDimCm)) * zoom;
  const cx = 300;
  const cy = 225;

  // ── True 3D Mathematical Projection Engine ──
  const radYaw = (yaw * Math.PI) / 180;
  const radPitch = (pitch * Math.PI) / 180;
  const cosY = Math.cos(radYaw);
  const sinY = Math.sin(radYaw);
  const cosP = Math.cos(radPitch);
  const sinP = Math.sin(radPitch);

  const project3D = useCallback(
    (x: number, y: number, z: number): Point2D => {
      const scrX = cx + baseScale * (x * cosY - y * sinY);
      const scrY = cy + baseScale * ((x * sinY + y * cosY) * sinP - z * cosP);
      return [scrX, scrY];
    },
    [cx, cy, baseScale, cosY, sinY, cosP, sinP]
  );

  const computeDepth = useCallback(
    (x: number, y: number, z: number): number => {
      return (x * sinY + y * cosY) * cosP + z * sinP;
    },
    [sinY, cosY, cosP, sinP]
  );

  // Normalized 0..1 fold or explode value
  const normProg = Math.max(0, Math.min(100, progress)) / 100;

  // ── 1. CARDBOARD FOLD KINEMATIC MODEL ──
  // Dieline blank hinges from flat (0) to fully folded (1), flaps close last.
  const cardboardQuads: RenderQuad[] = useMemo(() => {
    if (spec.kind !== 'cardboard') return [];

    const quads: RenderQuad[] = [];
    const fold = normProg; // 0 (flat blank) to 1 (fully assembled closed box)
    const flapH = W / 2; // FEFCO 0201 flap depth

    // Body wall hinge progress: 0 to 0.55
    const bodyProg = Math.min(1, fold / 0.55);
    // Flat tilt angle: lifts from horizontal table (0) to upright (1)
    const liftAngle = (1 - Math.min(1, fold / 0.35)) * (Math.PI / 2);
    const cosLift = Math.cos(liftAngle);
    const sinLift = Math.sin(liftAngle);

    // Bottom flap hinge: 0.45 to 0.75
    const bSideProg = Math.max(0, Math.min(1, (fold - 0.45) / 0.20));
    const bFrontProg = Math.max(0, Math.min(1, (fold - 0.55) / 0.20));

    // Top flap hinge (closes last): 0.70 to 1.00
    const tSideProg = Math.max(0, Math.min(1, (fold - 0.70) / 0.18));
    const tFrontProg = Math.max(0, Math.min(1, (fold - 0.82) / 0.18));

    // Angles
    const wallAngle = bodyProg * (Math.PI / 2);
    const bSideAngle = bSideProg * (Math.PI / 2);
    const bFrontAngle = bFrontProg * (Math.PI / 2);
    const tSideAngle = tSideProg * (Math.PI / 2);
    const tFrontAngle = tFrontProg * (Math.PI / 2);

    // Apply ground lift transform
    const liftPt = (x: number, y: number, z: number): Point3D => {
      if (liftAngle === 0) return [x, y, z];
      // Rotate around X axis at y = -W/2, z = 0
      const dy = y - -W / 2;
      return [x, -W / 2 + dy * cosLift - z * sinLift, dy * sinLift + z * cosLift];
    };

    const addQuad = (
      p0: Point3D,
      p1: Point3D,
      p2: Point3D,
      p3: Point3D,
      fill: string,
      stroke: string,
      isCrease = false
    ) => {
      const lp0 = liftPt(...p0);
      const lp1 = liftPt(...p1);
      const lp2 = liftPt(...p2);
      const lp3 = liftPt(...p3);

      const center: Point3D = [
        (lp0[0] + lp1[0] + lp2[0] + lp3[0]) / 4,
        (lp0[1] + lp1[1] + lp2[1] + lp3[1]) / 4,
        (lp0[2] + lp1[2] + lp2[2] + lp3[2]) / 4
      ];

      quads.push({
        points: [
          project3D(...lp0),
          project3D(...lp1),
          project3D(...lp2),
          project3D(...lp3)
        ],
        depth: computeDepth(...center),
        fill,
        stroke,
        strokeWidth: isCrease ? 1.0 : 1.3,
        strokeDash: isCrease ? '4,3' : undefined,
        isCrease
      });
    };

    // Color definitions
    const kraftOuter = '#a66a38';
    const kraftSide = '#94582a';
    const kraftInner = '#bd8350';
    const strokeCut = '#e5b88a';
    const strokeCrease = '#38bdf8';

    // ── Panel 1: Front Wall (Anchor) ──
    // Width = L, Height = H, at Y = -W/2
    const fX0 = -L / 2;
    const fX1 = L / 2;
    const fY = -W / 2;
    addQuad(
      [fX0, fY, 0],
      [fX1, fY, 0],
      [fX1, fY, H],
      [fX0, fY, H],
      kraftOuter,
      strokeCut
    );

    // Front Wall Top Flap (closes last)
    const fTopY = fY + flapH * Math.sin(tFrontAngle);
    const fTopZ = H + flapH * Math.cos(tFrontAngle);
    addQuad(
      [fX0, fY, H],
      [fX1, fY, H],
      [fX1, fTopY, fTopZ],
      [fX0, fTopY, fTopZ],
      kraftInner,
      tFrontProg > 0 ? strokeCut : strokeCrease
    );

    // Front Wall Bottom Flap
    const fBotY = fY + flapH * Math.sin(bFrontAngle);
    const fBotZ = 0 - flapH * Math.cos(bFrontAngle);
    addQuad(
      [fX0, fY, 0],
      [fX1, fY, 0],
      [fX1, fBotY, fBotZ],
      [fX0, fBotY, fBotZ],
      kraftSide,
      bFrontProg > 0 ? strokeCut : strokeCrease
    );

    // ── Panel 2: Right Side Wall (Hinges at fX1, fY) ──
    const rEndX = fX1 + W * (1 - Math.sin(wallAngle));
    const rEndY = fY + W * Math.sin(wallAngle);
    addQuad(
      [fX1, fY, 0],
      [rEndX, rEndY, 0],
      [rEndX, rEndY, H],
      [fX1, fY, H],
      kraftSide,
      strokeCut
    );

    // Right Side Top Flap
    const rTopX = rEndX;
    const rTopY = rEndY - flapH * Math.sin(tSideAngle) * Math.cos(wallAngle);
    const rTopZ = H + flapH * Math.cos(tSideAngle);
    addQuad(
      [fX1, fY, H],
      [rEndX, rEndY, H],
      [rTopX, rTopY, rTopZ],
      [fX1, fY, rTopZ],
      kraftInner,
      strokeCut
    );

    // Right Side Bottom Flap
    const rBotZ = 0 - flapH * Math.cos(bSideAngle);
    addQuad(
      [fX1, fY, 0],
      [rEndX, rEndY, 0],
      [rEndX, rEndY, rBotZ],
      [fX1, fY, rBotZ],
      kraftOuter,
      strokeCut
    );

    // ── Panel 3: Back Wall (Hinges at rEndX, rEndY) ──
    const bEndX = rEndX - L * Math.sin(wallAngle);
    const bEndY = rEndY + L * (1 - Math.sin(wallAngle));
    addQuad(
      [rEndX, rEndY, 0],
      [bEndX, bEndY, 0],
      [bEndX, bEndY, H],
      [rEndX, rEndY, H],
      kraftOuter,
      strokeCut
    );

    // Back Wall Top Flap
    const bTopY = bEndY - flapH * Math.sin(tFrontAngle);
    const bTopZ = H + flapH * Math.cos(tFrontAngle);
    addQuad(
      [rEndX, rEndY, H],
      [bEndX, bEndY, H],
      [bEndX, bTopY, bTopZ],
      [rEndX, bTopY, bTopZ],
      kraftInner,
      strokeCut
    );

    // Back Wall Bottom Flap
    const bBotZ = 0 - flapH * Math.cos(bFrontAngle);
    addQuad(
      [rEndX, rEndY, 0],
      [bEndX, bEndY, 0],
      [bEndX, bEndY, bBotZ],
      [rEndX, bEndY, bBotZ],
      kraftSide,
      strokeCut
    );

    // ── Panel 4: Left Side Wall (Hinges at fX0, fY) ──
    const lEndX = fX0 - W * (1 - Math.sin(wallAngle));
    const lEndY = fY + W * Math.sin(wallAngle);
    addQuad(
      [fX0, fY, 0],
      [lEndX, lEndY, 0],
      [lEndX, lEndY, H],
      [fX0, fY, H],
      kraftSide,
      strokeCut
    );

    // Left Side Top Flap
    const lTopZ = H + flapH * Math.cos(tSideAngle);
    addQuad(
      [fX0, fY, H],
      [lEndX, lEndY, H],
      [lEndX, lEndY, lTopZ],
      [fX0, fY, lTopZ],
      kraftInner,
      strokeCut
    );

    // Left Side Bottom Flap
    const lBotZ = 0 - flapH * Math.cos(bSideAngle);
    addQuad(
      [fX0, fY, 0],
      [lEndX, lEndY, 0],
      [lEndX, lEndY, lBotZ],
      [fX0, fY, lBotZ],
      kraftOuter,
      strokeCut
    );

    // Glue flap on Left Wall
    const glueW = 3.5;
    const gEndX = lEndX + glueW * Math.sin(wallAngle);
    const gEndY = lEndY + glueW * (1 - Math.sin(wallAngle));
    addQuad(
      [lEndX, lEndY, 0],
      [gEndX, gEndY, 0],
      [gEndX, gEndY, H],
      [lEndX, lEndY, H],
      '#7f5539',
      '#7FBBFF',
      true
    );

    // Sort back-to-front (painter's algorithm)
    return quads.sort((a, b) => a.depth - b.depth);
  }, [spec.kind, normProg, W, L, H, project3D, computeDepth]);

  // Points path string helper
  const renderPath = (pts: Point2D[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') +
    ' Z';

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className={`ps-3d-stage liquid-panel relative flex flex-col w-full h-full select-none overflow-hidden rounded-2xl ${className}`}
      style={{ touchAction: 'none' }}
    >
      {/* ── Top Bar: Telemetry HUD & View Presets ── */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
        <div className="ps-hud-pill liquid-panel flex items-center gap-2 pointer-events-auto px-3.5 py-1.5 rounded-full text-xs font-mono text-[var(--lq-ink)]">
          <Rotate3d size={14} className="text-[var(--main-color)]" />
          <span className="font-bold">{spec.kind.toUpperCase()}</span>
          <span className="text-[var(--lq-ink-tertiary)]">•</span>
          <span className="text-[var(--lq-ink-secondary)] tabular-nums">
            {W}×{L}×{H} cm
          </span>
        </div>

        {/* Camera View Presets */}
        <div className="ps-seg-group liquid-panel flex items-center gap-1 pointer-events-auto">
          <button
            type="button"
            onClick={() => setViewPreset(45, 30)}
            className={`ps-seg-btn hig-touch-target px-2.5 py-1 rounded-[8px] text-[10px] font-bold cursor-pointer ${
              Math.abs(yaw - 45) < 3 && Math.abs(pitch - 30) < 3 ? 'is-active' : ''
            }`}
            title="Isometric 3D View"
          >
            ISO
          </button>
          <button
            type="button"
            onClick={() => setViewPreset(0, 15)}
            className={`ps-seg-btn hig-touch-target px-2.5 py-1 rounded-[8px] text-[10px] font-bold cursor-pointer ${
              Math.abs(yaw - 0) < 3 && Math.abs(pitch - 15) < 3 ? 'is-active' : ''
            }`}
            title="Front Elevation View"
          >
            FRONT
          </button>
          <button
            type="button"
            onClick={() => setViewPreset(90, 15)}
            className={`ps-seg-btn hig-touch-target px-2.5 py-1 rounded-[8px] text-[10px] font-bold cursor-pointer ${
              Math.abs(yaw - 90) < 3 && Math.abs(pitch - 15) < 3 ? 'is-active' : ''
            }`}
            title="Side Profile View"
          >
            SIDE
          </button>
          <button
            type="button"
            onClick={() => setViewPreset(0, 85)}
            className={`ps-seg-btn hig-touch-target px-2.5 py-1 rounded-[8px] text-[10px] font-bold cursor-pointer ${
              Math.abs(pitch - 85) < 3 ? 'is-active' : ''
            }`}
            title="Top Overhead View"
          >
            TOP
          </button>
        </div>
      </div>

      {/* ── Main Interactive 3D SVG Canvas ── */}
      <svg
        ref={svgRef}
        viewBox="0 0 600 450"
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <radialGradient id="ps-ground-shadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.45" />
            <stop offset="60%" stopColor="#000000" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="ps-cleat-wood" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#92400e" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="ps-crate-ply" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d97706" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#b45309" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#78350f" stopOpacity="0.92" />
          </linearGradient>

          <linearGradient id="ps-prod-glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Ambient Ground Shadow */}
        <ellipse
          cx={cx}
          cy={cy + baseScale * (H * 0.35 + 10)}
          rx={baseScale * Math.max(W, L) * 0.85}
          ry={baseScale * Math.max(W, L) * 0.42}
          fill="url(#ps-ground-shadow)"
        />

        {/* ── KIND 1: CARDBOARD BOX FOLD MODEL ── */}
        {spec.kind === 'cardboard' && (
          <g>
            {/* Render dynamically sorted hinge quads */}
            {cardboardQuads.map((q, idx) => (
              <path
                key={`cb-quad-${idx}`}
                d={renderPath(q.points)}
                fill={q.fill}
                stroke={q.stroke}
                strokeWidth={q.strokeWidth}
                strokeDasharray={q.strokeDash}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Internal Product Bounding Box (Nested inside folded box) */}
            {stagedItems.length > 0 && normProg > 0.4 && (
              <g opacity={Math.min(0.85, (normProg - 0.4) * 2)}>
                {(() => {
                  const pX = -inW / 2;
                  const pY = -inL / 2;
                  const pZ = (H - inH) / 2;

                  const pPts: Point2D[] = [
                    project3D(pX, pY, pZ),
                    project3D(pX + inW, pY, pZ),
                    project3D(pX + inW, pY + inL, pZ),
                    project3D(pX, pY + inL, pZ)
                  ];
                  const pTopPts: Point2D[] = [
                    project3D(pX, pY, pZ + inH),
                    project3D(pX + inW, pY, pZ + inH),
                    project3D(pX + inW, pY + inL, pZ + inH),
                    project3D(pX, pY + inL, pZ + inH)
                  ];

                  return (
                    <g>
                      <path
                        d={renderPath(pTopPts)}
                        fill="url(#ps-prod-glow)"
                        stroke="#34d399"
                        strokeWidth="1.2"
                        strokeDasharray="4,3"
                        vectorEffect="non-scaling-stroke"
                      />
                      <line
                        x1={pPts[0][0]}
                        y1={pPts[0][1]}
                        x2={pTopPts[0][0]}
                        y2={pTopPts[0][1]}
                        stroke="#34d399"
                        strokeDasharray="3,3"
                      />
                      <line
                        x1={pPts[1][0]}
                        y1={pPts[1][1]}
                        x2={pTopPts[1][0]}
                        y2={pTopPts[1][1]}
                        stroke="#34d399"
                        strokeDasharray="3,3"
                      />
                    </g>
                  );
                })()}
              </g>
            )}
          </g>
        )}

        {/* ── KIND 2: ISPM-15 CLEATED WOOD CRATE (Exploded Model) ── */}
        {spec.kind === 'crate' && (
          <g>
            {(() => {
              const skidH = 8.9;
              const skidW = 8.9;
              const skidCount = spec.skidMm?.count ?? 3;
              const explodeShift = normProg * 22; // Explode expansion distance (cm)
              const floorZ = skidH;
              const wallZ = floorZ + 1.8;
              const wallH = H - skidH - 3.6;
              const lidZ = H + explodeShift * 1.6;

              const crateElements: RenderQuad[] = [];

              // A. Skid Runners
              for (let i = 0; i < skidCount; i++) {
                const rx = -W / 2 + (i / Math.max(1, skidCount - 1)) * (W - skidW);
                const p0 = project3D(rx, -L / 2, 0);
                const p1 = project3D(rx + skidW, -L / 2, 0);
                const p2 = project3D(rx + skidW, L / 2, 0);
                const p3 = project3D(rx, L / 2, 0);
                crateElements.push({
                  points: [p0, p1, p2, p3],
                  depth: computeDepth(rx + skidW / 2, 0, skidH / 2),
                  fill: 'url(#ps-cleat-wood)',
                  stroke: '#f59e0b',
                  strokeWidth: 1.2
                });
              }

              // B. Floor Panel
              const fl0 = project3D(-W / 2, -L / 2, floorZ);
              const fl1 = project3D(W / 2, -L / 2, floorZ);
              const fl2 = project3D(W / 2, L / 2, floorZ);
              const fl3 = project3D(-W / 2, L / 2, floorZ);
              crateElements.push({
                points: [fl0, fl1, fl2, fl3],
                depth: computeDepth(0, 0, floorZ),
                fill: 'url(#ps-crate-ply)',
                stroke: '#d97706',
                strokeWidth: 1.2
              });

              // C. Four Exploded Cleated Walls
              // Front Wall (-Y)
              const fwY = -L / 2 - explodeShift;
              crateElements.push({
                points: [
                  project3D(-W / 2, fwY, wallZ),
                  project3D(W / 2, fwY, wallZ),
                  project3D(W / 2, fwY, wallZ + wallH),
                  project3D(-W / 2, fwY, wallZ + wallH)
                ],
                depth: computeDepth(0, fwY, wallZ + wallH / 2),
                fill: 'url(#ps-crate-ply)',
                stroke: '#f59e0b',
                strokeWidth: 1.2
              });

              // Back Wall (+Y)
              const bwY = L / 2 + explodeShift;
              crateElements.push({
                points: [
                  project3D(-W / 2, bwY, wallZ),
                  project3D(W / 2, bwY, wallZ),
                  project3D(W / 2, bwY, wallZ + wallH),
                  project3D(-W / 2, bwY, wallZ + wallH)
                ],
                depth: computeDepth(0, bwY, wallZ + wallH / 2),
                fill: 'url(#ps-crate-ply)',
                stroke: '#d97706',
                strokeWidth: 1.2
              });

              // Left Wall (-X)
              const lwX = -W / 2 - explodeShift;
              crateElements.push({
                points: [
                  project3D(lwX, -L / 2, wallZ),
                  project3D(lwX, L / 2, wallZ),
                  project3D(lwX, L / 2, wallZ + wallH),
                  project3D(lwX, -L / 2, wallZ + wallH)
                ],
                depth: computeDepth(lwX, 0, wallZ + wallH / 2),
                fill: 'url(#ps-crate-ply)',
                stroke: '#d97706',
                strokeWidth: 1.2
              });

              // Right Wall (+X)
              const rwX = W / 2 + explodeShift;
              crateElements.push({
                points: [
                  project3D(rwX, -L / 2, wallZ),
                  project3D(rwX, L / 2, wallZ),
                  project3D(rwX, L / 2, wallZ + wallH),
                  project3D(rwX, -L / 2, wallZ + wallH)
                ],
                depth: computeDepth(rwX, 0, wallZ + wallH / 2),
                fill: 'url(#ps-crate-ply)',
                stroke: '#f59e0b',
                strokeWidth: 1.2
              });

              // D. Top Lid Panel (+Z Lift)
              crateElements.push({
                points: [
                  project3D(-W / 2, -L / 2, lidZ),
                  project3D(W / 2, -L / 2, lidZ),
                  project3D(W / 2, L / 2, lidZ),
                  project3D(-W / 2, L / 2, lidZ)
                ],
                depth: computeDepth(0, 0, lidZ),
                fill: 'url(#ps-crate-ply)',
                stroke: '#f59e0b',
                strokeWidth: 1.5
              });

              // Painter's sorting
              crateElements.sort((a, b) => a.depth - b.depth);

              return crateElements.map((el, i) => (
                <path
                  key={`crate-el-${i}`}
                  d={renderPath(el.points)}
                  fill={el.fill}
                  stroke={el.stroke}
                  strokeWidth={el.strokeWidth}
                  vectorEffect="non-scaling-stroke"
                />
              ));
            })()}
          </g>
        )}

        {/* ── KIND 3: FREIGHT PALLET (Stringers & Deckboards) ── */}
        {spec.kind === 'pallet' && (
          <g>
            {(() => {
              const runnerH = 8.9;
              const runnerW = 3.8;
              const runnerCount = spec.skidMm?.count ?? 3;
              const topBoards = spec.deckboards?.countTop ?? 7;
              const deckLift = normProg * 14;

              const palletElements: RenderQuad[] = [];

              // Stringers
              for (let i = 0; i < runnerCount; i++) {
                const rx = -W / 2 + (i / Math.max(1, runnerCount - 1)) * (W - runnerW);
                palletElements.push({
                  points: [
                    project3D(rx, -L / 2, 0),
                    project3D(rx + runnerW, -L / 2, 0),
                    project3D(rx + runnerW, L / 2, 0),
                    project3D(rx, L / 2, 0)
                  ],
                  depth: computeDepth(rx + runnerW / 2, 0, runnerH / 2),
                  fill: 'url(#ps-cleat-wood)',
                  stroke: '#f59e0b',
                  strokeWidth: 1.2
                });
              }

              // Top Deckboards
              const bSpacing = (L - 9.5) / Math.max(1, topBoards - 1);
              for (let i = 0; i < topBoards; i++) {
                const by = -L / 2 + i * bSpacing;
                palletElements.push({
                  points: [
                    project3D(-W / 2, by, runnerH + deckLift),
                    project3D(W / 2, by, runnerH + deckLift),
                    project3D(W / 2, by + 9.5, runnerH + deckLift),
                    project3D(-W / 2, by + 9.5, runnerH + deckLift)
                  ],
                  depth: computeDepth(0, by + 4.75, runnerH + deckLift),
                  fill: 'url(#ps-cleat-wood)',
                  stroke: '#f59e0b',
                  strokeWidth: 1.0
                });
              }

              palletElements.sort((a, b) => a.depth - b.depth);

              return palletElements.map((el, i) => (
                <path
                  key={`pal-el-${i}`}
                  d={renderPath(el.points)}
                  fill={el.fill}
                  stroke={el.stroke}
                  strokeWidth={el.strokeWidth}
                  vectorEffect="non-scaling-stroke"
                />
              ));
            })()}
          </g>
        )}
      </svg>

      {/* ── Bottom HUD Bar: Scrub Slider, Play/Pause, Zoom Controls ── */}
      <div className="ps-hud-bar liquid-panel absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between gap-3 px-4 py-2 rounded-2xl">
        {/* Play/Pause & Mode Label */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="liquid-control hig-touch-target p-2 rounded-xl flex items-center justify-center cursor-pointer text-[var(--main-color)]"
            title={isPlaying ? 'Pause Animation' : 'Auto-Play Animation'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>

          <div className="flex items-center gap-1.5">
            {spec.kind === 'cardboard' ? (
              <Box size={14} className="text-[var(--main-color)] shrink-0" />
            ) : (
              <Layers size={14} className="text-[var(--main-color)] shrink-0" />
            )}
            <span className="text-[11px] font-mono text-[var(--lq-ink-secondary)] font-semibold whitespace-nowrap hidden sm:inline">
              {spec.kind === 'cardboard' ? 'FOLD ANIMATION' : 'EXPLODED VIEW'}
            </span>
          </div>
        </div>

        {/* Scrub Slider (0..1 fold or explode progress) */}
        <div className="flex-1 flex items-center gap-2 max-w-xs sm:max-w-sm">
          <span className="text-[10px] font-mono text-[var(--lq-ink-tertiary)]">
            {spec.kind === 'cardboard' ? 'FLAT' : '0%'}
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={e => {
              setIsPlaying(false);
              handleProgressChange(Number(e.target.value));
            }}
            className="w-full h-1.5 rounded-lg cursor-pointer accent-[var(--main-color)]"
          />
          <span className="text-[10px] font-mono text-[var(--main-color)] font-bold min-w-[36px] text-right tabular-nums">
            {progress}%
          </span>
        </div>

        {/* Camera Zoom & Reset Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom(z => Math.max(0.4, z - 0.2))}
            className="liquid-control hig-touch-target p-2 rounded-xl flex items-center justify-center cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(z => Math.min(3.0, z + 0.2))}
            className="liquid-control hig-touch-target p-2 rounded-xl flex items-center justify-center cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setViewPreset(45, 30);
              setZoom(1.0);
            }}
            className="liquid-control hig-touch-target p-2 rounded-xl flex items-center justify-center cursor-pointer text-[var(--lq-ink-secondary)]"
            title="Reset Camera"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
