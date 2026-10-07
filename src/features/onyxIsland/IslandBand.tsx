import React, { Suspense, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtomValue } from 'jotai';
import { userAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import './island.css';
import { IslandLiveRegion } from './IslandLiveRegion';
import type { IslandReadout } from './islandState';
// @ts-ignore
import { OnyxFace } from '../onyxAgent/face/OnyxFace';

const OnyxIsland = React.lazy(() => import('./OnyxIsland').then(m => ({ default: m.OnyxIsland })));

interface AnchorRect { top: number; left: number; width: number }

function useAnchorRect(ref: React.RefObject<HTMLElement | null>): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      setRect(prev => (prev && prev.top === r.top && prev.left === r.left && prev.width === r.width)
        ? prev
        : { top: r.top, left: r.left, width: r.width });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    ro.observe(document.documentElement);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [ref]);
  return rect;
}

export const IslandBand: React.FC<{ readout?: IslandReadout | null }> = ({ readout = null }) => {
  const user = useAtomValue(userAtom);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  useLayoutEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const rect = useAnchorRect(bandRef);

  if (!user) {
    return null;
  }

  return (
    <>
      <div ref={bandRef} className="onyx-island-band">
        <IslandLiveRegion />
      </div>
      {rect && createPortal(
        <div
          className="onyx-island-layer"
          role="region"
          aria-label={tr('Onyx assistant and notifications')}
          style={{ ...(isMobile ? { bottom: 0, left: 0, width: '100%' } : { top: rect.top, left: rect.left, width: rect.width }) }}
        >
          <Suspense fallback={
            <div className="onyx-island onyx-island--rest">
              <div className="onyx-island-surface">
                {/* @ts-ignore */}
                <OnyxFace bare size={56} expression="calm" tone="mono" />
              </div>
            </div>
          }>
            <div style={{position: 'fixed', top: 100, left: 100, width: 100, height: 100, background: 'red', zIndex: 999999}}>ISLAND BAND</div><OnyxIsland readout={readout} />
          </Suspense>
        </div>,
        document.body
      )}
    </>
  );
};

