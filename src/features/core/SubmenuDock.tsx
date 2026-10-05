import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './submenuDock.css';

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
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
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
    const apply = () => host.style.setProperty('--submenu-h', stack.offsetHeight > 0 ? `${82 + stack.offsetHeight + 8}px` : '0px');
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(stack);
    return () => { ro.disconnect(); host.style.setProperty('--submenu-h', '0px'); };
  }, [mounted, rect]);
  
  if (!mounted || !rect) return null;

  return createPortal(
    <div 
      className="smd-layer"
      style={{ top: rect.top, left: rect.left, width: rect.width }}
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
  children: React.ReactNode;
}> = ({ id, title, onClose, children }) => {
  return (
    <div className="smd-card ui-root" data-bar={id}>
      <div className="smd-card-header">
        <span className="smd-card-title">{title}</span>
        <button onClick={onClose} className="smd-close-btn" aria-label="Close">
          <X size={20} strokeWidth={2.5} />
        </button>
      </div>
      <div className="smd-card-content">
        {children}
      </div>
    </div>
  );
};
