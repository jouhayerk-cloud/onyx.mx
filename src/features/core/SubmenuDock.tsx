import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { buildRefractionMap } from '../onyxIsland/IslandRefraction';
import './submenuDock.css';

const smdMapCache = new Map<string, { href: string; w: number; h: number; scale: number }>();

interface AnchorRect { top: number; left: number; width: number }

function useBandRect(): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null);
  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = document.querySelector(".onyx-island-band");
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(prev => (prev && prev.top === r.top && prev.left === r.left && prev.width === r.width)
          ? prev
          : { top: r.top, left: r.left, width: r.width });
      } else {
        setRect(prev => (prev && prev.top === 0 && prev.left === 0 && prev.width === window.innerWidth)
          ? prev
          : { top: 0, left: 0, width: window.innerWidth });
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    const ro = new ResizeObserver(schedule);
    const el = document.querySelector(".onyx-island-band");
    if (el) ro.observe(el);
    ro.observe(document.documentElement);
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, { capture: true });
    };
  }, []);
  return rect;
}

export const SubmenuDock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const rect = useBandRect();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const stackRef = useRef<HTMLDivElement | null>(null);

  // The open bars reserve their height in the page flow (--submenu-h on .app-content, read by topbarOverlay.css),
  // like the old universal tools bar did: the page makes room instead of the bars covering the first rows.
  useLayoutEffect(() => {
    const stack = stackRef.current;
    const host = document.querySelector<HTMLElement>('.app-content');
    if (!mounted || !stack || !host) return;
    // desktop: the layer starts 82 px below the top (under the bar row); phone: 8 px under the status bar (see submenuDock.css)
    const apply = () => {
      const h = stack.offsetHeight;
      const phone = window.matchMedia('(max-width: 768px)').matches;
      host.style.setProperty('--submenu-h', h <= 0 ? '0px' : phone ? `calc(env(safe-area-inset-top, 0px) + ${8 + h + 8}px)` : `${82 + h + 8}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(stack);
    window.addEventListener('resize', apply);
    return () => { ro.disconnect(); window.removeEventListener('resize', apply); host.style.setProperty('--submenu-h', '0px'); };
  }, [mounted, rect]);
  
  if (!mounted || !rect) return null;

  return createPortal(
    <div 
      className="smd-layer"
      style={{ top: rect.top, left: rect.left, right: 0 }}
    >
      <div className="smd-stack" ref={stackRef}>
        {children}
      </div>
    </div>,
    document.body
  );
};

export const SubmenuCard: React.FC<{
  id: string;
  title: string;
  onClose: () => void;
  /** No title row and no close button (the island tool that opened the bar closes it); `title` is still the accessible name. */
  headless?: boolean;
  /** Keeps the close button but not the title text (the View bar); `title` is still the accessible name. */
  hideTitle?: boolean;
  children: React.ReactNode;
}> = ({ id, title, onClose, headless = false, hideTitle = false, children }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [refractData, setRefractData] = useState<{ href: string; w: number; h: number; scale: number } | null>(null);

  const filterId = `smd-refract-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  useEffect(() => {
    const nav = navigator as any;
    let isChromium = false;
    if (nav.userAgentData?.brands) {
      isChromium = nav.userAgentData.brands.some((b: any) => b.brand.includes('Chromium') || b.brand.includes('Google Chrome') || b.brand.includes('Microsoft Edge'));
    }
    if (!isChromium) {
      isChromium = /Chrome\/|Edg\//.test(navigator.userAgent);
    }
    if (!isChromium) return;
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
    const isRefractionOptedIn = document.documentElement.classList.contains('lq-refraction') || (typeof localStorage !== 'undefined' && localStorage.getItem('lqRefraction') === '1');
    // desktop keeps the refraction as before; touch screens skip it unless the owner opted in (lqRefraction)
    if (!isRefractionOptedIn && window.matchMedia('(pointer: coarse)').matches) return;

    const target = cardRef.current;
    if (!target) return;

    let timeoutId: number;
    let w = 0;
    let h = 0;

    const applyRefraction = () => {
      if (document.visibilityState === 'hidden') return;
      if (w <= 0 || h <= 0) return;

      const computedStyle = window.getComputedStyle(target);
      let radius = parseFloat(computedStyle.borderTopLeftRadius) || 22;
      radius = Math.min(radius, w / 2, h / 2);

      const key = `${w}x${h}x${radius}`;
      let data = smdMapCache.get(key);

      if (!data) {
        const bezel = Math.min(16, 0.28 * Math.min(w, h));
        const arr = buildRefractionMap(w, h, radius, bezel);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.putImageData(new ImageData(arr as unknown as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
          const href = canvas.toDataURL('image/png');
          const maxPixels = w < 200 ? 14 : 10;
          const scale = 2 * maxPixels;

          data = { href, w, h, scale };
          smdMapCache.set(key, data);
        }
      }

      if (data) {
        setRefractData(data);
        target.setAttribute('data-smd-refract', 'on');
      }
    };

    const initialW = Math.round(target.offsetWidth);
    const initialH = Math.round(target.offsetHeight);
    if (initialW > 0 && initialH > 0) {
      w = initialW;
      h = initialH;
      applyRefraction();
    }

    const rafId = requestAnimationFrame(() => {
      if (!target) return;
      const curW = Math.round(target.offsetWidth);
      const curH = Math.round(target.offsetHeight);
      if (curW > 0 && curH > 0 && (curW !== w || curH !== h || target.getAttribute('data-smd-refract') !== 'on')) {
        w = curW;
        h = curH;
        applyRefraction();
      }
    });

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const newW = Math.round(target.offsetWidth);
      const newH = Math.round(target.offsetHeight);
      if (newW === w && newH === h) return;

      w = newW;
      h = newH;

      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        applyRefraction();
      }, 60);
    });

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target === target && (e.propertyName === 'width' || e.propertyName === 'height' || e.propertyName === 'transform')) {
        const curW = Math.round(target.offsetWidth);
        const curH = Math.round(target.offsetHeight);
        if (curW > 0 && curH > 0) {
          w = curW;
          h = curH;
          applyRefraction();
        }
      }
    };

    target.addEventListener('transitionend', onTransitionEnd);
    observer.observe(target);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      clearTimeout(timeoutId);
      target.removeEventListener('transitionend', onTransitionEnd);
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className={`smd-card ui-root${hideTitle ? ' smd-card--notitle' : ''}`}
      data-bar={id}
      role="region"
      aria-label={headless || hideTitle ? title : undefined}
      style={{
        '--smd-refract-filter': refractData ? `url(#${filterId})` : 'none',
      } as React.CSSProperties}
    >
      {refractData && (
        <svg aria-hidden="true" style={{ width: 0, height: 0, position: 'absolute', pointerEvents: 'none' }}>
          <defs>
            <filter id={filterId} filterUnits="userSpaceOnUse" x="0" y="0" width={refractData.w} height={refractData.h} colorInterpolationFilters="sRGB">
              <feImage href={refractData.href} result="map" x="0" y="0" width={refractData.w} height={refractData.h} />
              <feDisplacementMap in="SourceGraphic" in2="map" scale={refractData.scale} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
      )}
      {!headless && (
        <div className="smd-card-title-area">
          <span className="smd-card-title">{title}</span>
          <button onClick={onClose} className="smd-close-btn smd-close-mobile" aria-label={tr("Close")}>
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
      )}
      <div className="smd-card-content">
        {children}
      </div>
      {!headless && (
        <button onClick={onClose} className="smd-close-btn smd-close-desktop" aria-label={tr("Close")}>
          <X size={20} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};
