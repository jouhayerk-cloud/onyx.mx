import React, { useLayoutEffect, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AnimatePresence, m } from 'framer-motion';
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
  
  if (!mounted || !rect) return null;

  return createPortal(
    <div 
      className="smd-layer"
      style={{ top: rect.top, left: rect.left, width: rect.width }}
    >
      <div className="smd-stack">
        <AnimatePresence>
          {children}
        </AnimatePresence>
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
    <m.div
      key={id}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8, duration: 0.22 }}
      className="smd-card ui-root"
    >
      <div className="smd-card-header">
        <span className="smd-card-title">{title}</span>
        <button onClick={onClose} className="smd-close-btn" aria-label="Close">
          <X size={20} strokeWidth={2.5} />
        </button>
      </div>
      <div className="smd-card-content">
        {children}
      </div>
    </m.div>
  );
};
