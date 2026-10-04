import { useEffect } from 'react';

type GazeTarget = {
  el: HTMLElement;
  gx: number;
  gy: number;
  tx: number;
  ty: number;
};

const registry = new Set<GazeTarget>();
let pointerX = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
let pointerY = typeof window !== 'undefined' ? window.innerHeight / 2 : 0;
let lastMoveTime = Date.now();
let frameId: number | null = null;
let driftInterval: number | null = null;
let isRafScheduled = false;

function loop() {
  isRafScheduled = false;
  if (registry.size === 0) return;

  const isHidden = document.hidden;
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const now = Date.now();
  const timeSinceMove = now - lastMoveTime;
  const isIdle = timeSinceMove > 6000;
  
  let needsNextFrame = false;

  for (const target of registry) {
    const { el } = target;
    
    if (isHidden || isReducedMotion) {
      target.tx = 0;
      target.ty = 0;
    } else {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      
      const dx = pointerX - cx;
      const dy = pointerY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 0 && !isIdle) {
        const g = Math.tanh(dist / 320);
        target.tx = (dx / dist) * g;
        target.ty = (dy / dist) * g;
      }
    }
    
    const ease = 0.28;
    const nx = target.gx + (target.tx - target.gx) * ease;
    const ny = target.gy + (target.ty - target.gy) * ease;
    
    const diffX = Math.abs(nx - target.gx);
    const diffY = Math.abs(ny - target.gy);
    
    if (diffX > 0.004 || diffY > 0.004) {
      target.gx = nx;
      target.gy = ny;
      el.style.setProperty('--onyx-gx', nx.toFixed(3));
      el.style.setProperty('--onyx-gy', ny.toFixed(3));
      needsNextFrame = true;
    } else {
      if (diffX > 0 || diffY > 0) {
        if (diffX <= 0.004 && Math.abs(target.gx - target.tx) > 0.001) {
          target.gx = target.tx;
          el.style.setProperty('--onyx-gx', target.tx.toFixed(3));
        }
        if (diffY <= 0.004 && Math.abs(target.gy - target.ty) > 0.001) {
          target.gy = target.ty;
          el.style.setProperty('--onyx-gy', target.ty.toFixed(3));
        }
      }
    }
  }

  if (needsNextFrame) {
    isRafScheduled = true;
    frameId = requestAnimationFrame(loop);
  }
}

function scheduleFrame() {
  if (!isRafScheduled && typeof window !== 'undefined') {
    isRafScheduled = true;
    frameId = requestAnimationFrame(loop);
  }
}

function onPointerMove(e: PointerEvent) {
  pointerX = e.clientX;
  pointerY = e.clientY;
  lastMoveTime = Date.now();
  scheduleFrame();
}

function onVisibilityChange() {
  scheduleFrame();
}

function startIdleDrift() {
  if (driftInterval || typeof window === 'undefined') return;
  driftInterval = window.setInterval(() => {
    const isHidden = document.hidden;
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isHidden || isReducedMotion || registry.size === 0) return;
    
    const timeSinceMove = Date.now() - lastMoveTime;
    if (timeSinceMove > 6000) {
      const t = Date.now() / 1000;
      for (const target of registry) {
        target.tx = Math.sin(t * 0.8) * 0.12;
        target.ty = Math.cos(t * 0.5) * 0.12;
      }
      scheduleFrame();
    }
  }, 250);
}

function stopIdleDrift() {
  if (driftInterval && typeof window !== 'undefined') {
    window.clearInterval(driftInterval);
    driftInterval = null;
  }
}

export function useGaze(ref: React.RefObject<HTMLElement | null>, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;

  useEffect(() => {
    if (!enabled || !ref.current) {
      if (ref.current) {
        ref.current.style.setProperty('--onyx-gx', '0');
        ref.current.style.setProperty('--onyx-gy', '0');
      }
      return;
    }
    
    const el = ref.current;
    const target: GazeTarget = { el, gx: 0, gy: 0, tx: 0, ty: 0 };
    
    if (registry.size === 0 && typeof window !== 'undefined') {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('visibilitychange', onVisibilityChange);
      startIdleDrift();
    }
    
    registry.add(target);
    scheduleFrame();

    return () => {
      registry.delete(target);
      if (registry.size === 0 && typeof window !== 'undefined') {
        window.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        if (frameId !== null) {
          cancelAnimationFrame(frameId);
          frameId = null;
          isRafScheduled = false;
        }
        stopIdleDrift();
      }
    };
  }, [ref, enabled]);
}
