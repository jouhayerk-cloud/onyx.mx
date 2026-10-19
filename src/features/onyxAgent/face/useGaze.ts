import { useEffect } from 'react';

type GazeTarget = {
  el: HTMLElement;
  gx: number;
  gy: number;
  tx: number;
  ty: number;
  cx: number;
  cy: number;
};

const registry = new Set<GazeTarget>();
let pointerX = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
let pointerY = typeof window !== 'undefined' ? window.innerHeight / 2 : 0;
let lastMoveTime = Date.now();
let frameId: number | null = null;
let driftInterval: number | null = null;
let isRafScheduled = false;

function measureTarget(target: GazeTarget) {
  const rect = target.el.getBoundingClientRect();
  target.cx = rect.left + rect.width / 2;
  target.cy = rect.top + rect.height / 2;
}

function measureAllTargets() {
  for (const target of registry) {
    measureTarget(target);
  }
}

let scrollEndTimer: number | null = null;
function onScrollEnd() {
  if (scrollEndTimer !== null) {
    window.clearTimeout(scrollEndTimer);
    scrollEndTimer = null;
  }
  measureAllTargets();
  scheduleFrame();
}

function onScroll() {
  if (scrollEndTimer !== null) {
    window.clearTimeout(scrollEndTimer);
  }
  scrollEndTimer = window.setTimeout(onScrollEnd, 120);
}

let resizeTimer: number | null = null;
function onResize() {
  if (resizeTimer !== null) {
    window.clearTimeout(resizeTimer);
  }
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    measureAllTargets();
    scheduleFrame();
  }, 100);
}

function stopLoop() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
  isRafScheduled = false;
}

function stopIdleDrift() {
  if (driftInterval !== null && typeof window !== 'undefined') {
    window.clearInterval(driftInterval);
    driftInterval = null;
  }
}

function loop() {
  isRafScheduled = false;
  if (registry.size === 0) return;

  const isHidden = document.hidden;
  const now = Date.now();
  const timeSinceMove = now - lastMoveTime;

  if (isHidden || timeSinceMove > 4000) {
    stopLoop();
    stopIdleDrift();
    for (const target of registry) {
      target.tx = 0;
      target.ty = 0;
      if (target.gx !== 0 || target.gy !== 0) {
        target.gx = 0;
        target.gy = 0;
        target.el.style.setProperty('--onyx-gx', '0');
        target.el.style.setProperty('--onyx-gy', '0');
      }
    }
    return;
  }

  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let needsNextFrame = false;

  for (const target of registry) {
    const { el, cx, cy } = target;
    
    if (isReducedMotion) {
      target.tx = 0;
      target.ty = 0;
    } else {
      const dx = pointerX - cx;
      const dy = pointerY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (isClicked) {
        target.tx = 0;
        target.ty = 0;
      } else if (dist > 0) {
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
  startIdleDrift();
  scheduleFrame();
}

let isClicked = false;
let clickTimeout: number | null = null;

function onPointerDown(e: PointerEvent) {
  pointerX = e.clientX;
  pointerY = e.clientY;
  lastMoveTime = Date.now();
  isClicked = true;
  if (clickTimeout !== null) window.clearTimeout(clickTimeout);
  clickTimeout = window.setTimeout(() => {
    isClicked = false;
    scheduleFrame();
  }, 1000);
  scheduleFrame();
}

function onVisibilityChange() {
  if (document.hidden) {
    stopLoop();
    stopIdleDrift();
  } else {
    if (Date.now() - lastMoveTime <= 4000) {
      scheduleFrame();
    }
  }
}

function startIdleDrift() {
  if (driftInterval || typeof window === 'undefined') return;
  driftInterval = window.setInterval(() => {
    const isHidden = document.hidden;
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isHidden || isReducedMotion || registry.size === 0) {
      stopIdleDrift();
      return;
    }
    
    const timeSinceMove = Date.now() - lastMoveTime;
    if (timeSinceMove > 4000) {
      stopIdleDrift();
      stopLoop();
      return;
    }
    if (timeSinceMove > 2000) {
      const t = Date.now() / 1000;
      for (const target of registry) {
        target.tx = Math.sin(t * 0.8) * 0.12;
        target.ty = Math.cos(t * 0.5) * 0.12;
      }
      scheduleFrame();
    }
  }, 250);
}

/** Hook that moves an element's gaze CSS variables toward the pointer; resets them when disabled. */
export function useGaze(ref: React.RefObject<HTMLElement | null>, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    if (!enabled || !ref.current) {
      if (ref.current) {
        ref.current.style.setProperty('--onyx-gx', '0');
        ref.current.style.setProperty('--onyx-gy', '0');
      }
      return;
    }
    
    const el = ref.current;
    const target: GazeTarget = { el, gx: 0, gy: 0, tx: 0, ty: 0, cx: 0, cy: 0 };
    measureTarget(target);

    if (registry.size === 0) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerdown', onPointerDown, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      if ('onscrollend' in window) {
        window.addEventListener('scrollend', onScrollEnd, { passive: true });
      }
      document.addEventListener('visibilitychange', onVisibilityChange);
      startIdleDrift();
    }
    
    registry.add(target);
    requestAnimationFrame(() => measureTarget(target));
    scheduleFrame();

    return () => {
      registry.delete(target);
      if (registry.size === 0) {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onScroll);
        if ('onscrollend' in window) {
          window.removeEventListener('scrollend', onScrollEnd);
        }
        document.removeEventListener('visibilitychange', onVisibilityChange);
        stopLoop();
        stopIdleDrift();
      }
    };
  }, [ref, enabled]);
}
