import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArchiveItem, ArchiveFinance } from '../archive/types';
import { tr } from '../../lib/i18n';
import { X, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import {
  parseDescription,
  formatDims,
  formatWeight,
  formatMoney,
  vendorColor,
  formatDate
} from './archiveFormat';

export interface ArchiveItemDrawerProps {
  item: ArchiveItem | null;
  finance: ArchiveFinance | null;
  isOpen: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}

export const ArchiveItemDrawer: React.FC<ArchiveItemDrawerProps> = ({
  item,
  finance,
  isOpen,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [copiedTag, setCopiedTag] = useState(false);
  const [copiedSrc, setCopiedSrc] = useState(false);
  const [isReduced, setIsReduced] = useState(false);

  useEffect(() => {
    setIsReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const active = document.activeElement as HTMLElement;
      const closeBtn = drawerRef.current?.querySelector('[aria-label="Close"]') as HTMLElement;
      if (closeBtn) closeBtn.focus();
      return () => active?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowLeft' && hasPrev) {
      onPrev();
      return;
    }
    if (e.key === 'ArrowRight' && hasNext) {
      onNext();
      return;
    }
    if (e.key === 'Tab') {
      if (!drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
  };

  const copyTag = async () => {
    if (!item?.tag_id) return;
    try {
      await navigator.clipboard.writeText(item.tag_id);
      setCopiedTag(true);
      setTimeout(() => setCopiedTag(false), 2000);
    } catch (e) {}
  };

  const copySrc = async () => {
    if (!item) return;
    const text = `v825 / ${item.sheet} / row ${item.src_row}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSrc(true);
      setTimeout(() => setCopiedSrc(false), 2000);
    } catch (e) {}
  };

  if (!item) return null;

  const parsed = parseDescription(item.description);
  const vColor = vendorColor(item.vendor);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 bg-black/40 z-[90]"
            onClick={onClose}
          />
          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            onKeyDown={handleKeyDown}
            initial={{ x: isReduced ? 0 : '100%', opacity: isReduced ? 0 : 1 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: isReduced ? 0 : '100%', opacity: isReduced ? 0 : 1 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="fixed top-16 right-0 bottom-0 w-full sm:w-[440px] bg-[var(--slab)] z-[100] border-l border-white/10 shadow-2xl flex flex-col focus:outline-none"
            tabIndex={-1}
          >
            <div aria-live="polite" className="sr-only">
              {copiedTag || copiedSrc ? tr('Copied!') : ''}
            </div>
            
            <div className="flex-1 overflow-auto">
              <div 
                className="h-32 p-6 flex flex-col justify-end relative" 
                style={{ backgroundColor: vColor }}
              >
                <button
                  aria-label="Close"
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/40 transition-colors"
                >
                  <X size={20} className="text-white" />
                </button>
                <h2 id="drawer-title" className="text-3xl font-black text-white mix-blend-overlay tracking-tight">
                  {item.tag_id || '—'}
                </h2>
                {item.item_number && (
                  <div className="text-white/80 font-bold mix-blend-overlay">#{item.item_number}</div>
                )}
              </div>

              <div className="p-6 space-y-8">
                {/* General Section */}
                <section>
                  <h3 className="text-xs font-black uppercase text-white/40 mb-4 tracking-widest">{tr('General')}</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                      <span className="text-sm text-white/50">{tr('Attributes')}</span>
                      <span className="text-sm font-bold text-white/90 text-right">
                        {parsed.title}
                        {(parsed.color || parsed.shape) && (
                          <span className="block text-[10px] text-white/40 uppercase tracking-widest mt-1">
                            {[parsed.shape, parsed.color].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                      <span className="text-sm text-white/50">{tr('Quantity')}</span>
                      <span className="text-sm font-bold text-white/90">{item.quantity}</span>
                    </div>
                    <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                      <span className="text-sm text-white/50">{tr('Weight')}</span>
                      <span className="text-sm font-bold text-white/90">{formatWeight(item.weight_kg)}</span>
                    </div>
                    <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                      <span className="text-sm text-white/50">{tr('Dimensions')}</span>
                      <span className="text-sm font-bold text-white/90">{formatDims(item)}</span>
                    </div>
                    <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                      <span className="text-sm text-white/50">{tr('Date')}</span>
                      <span className="text-sm font-bold text-white/90">{formatDate(item.item_date)}</span>
                    </div>
                    <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                      <span className="text-sm text-white/50">{tr('Vendor / Sheet')}</span>
                      <span className="text-sm font-bold text-white/90">{item.vendor} / {item.sheet}</span>
                    </div>
                  </div>
                </section>

                {/* Attributes Section */}
                {Object.keys(item.attrs || {}).length > 0 && (
                  <section>
                    <h3 className="text-xs font-black uppercase text-white/40 mb-4 tracking-widest">{tr('Attributes')}</h3>
                    <div className="space-y-4">
                      {Object.entries(item.attrs).map(([key, val]) => (
                        <div key={key} className="flex justify-between items-baseline border-b border-white/5 pb-2">
                          <span className="text-sm text-white/50">{key}</span>
                          <span className="text-sm font-bold text-white/90 break-words min-w-0">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Finance Section */}
                {finance && (
                  <section>
                    <h3 className="text-xs font-black uppercase text-[var(--main-color)] mb-4 tracking-widest">{tr('Finance')}</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline border-b border-[var(--main-color)]/20 pb-2">
                        <span className="text-sm text-white/50">{tr('Price MXN')}</span>
                        <span className="text-sm font-bold text-white/90">{formatMoney(finance.price_mxn, 'MXN')}</span>
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                        <span className="text-sm text-white/50">{tr('Total Pesos')}</span>
                        <span className="text-sm font-bold text-white/90">{formatMoney(finance.total_pesos, 'MXN')}</span>
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                        <span className="text-sm text-white/50">{tr('Total USD')}</span>
                        <span className="text-sm font-bold text-white/90">{formatMoney(finance.total_usd, 'USD')}</span>
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/5 pb-2">
                        <span className="text-sm text-white/50">{tr('Retail')}</span>
                        <span className="text-sm font-bold text-white/90">{formatMoney(finance.retail, 'USD')}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                          <div className="text-[10px] text-white/40 uppercase mb-1">{tr('AQ')}</div>
                          <div className="text-sm font-bold text-white/90">{finance.aq || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-white/40 uppercase mb-1">{tr('LND')}</div>
                          <div className="text-sm font-bold text-white/90">{finance.lnd || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-white/40 uppercase mb-1">{tr('AQC')}</div>
                          <div className="text-sm font-bold text-white/90">{finance.aqc || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-white/40 uppercase mb-1">{tr('LC')}</div>
                          <div className="text-sm font-bold text-white/90">{finance.lc || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-white/40 uppercase mb-1">{tr('SQM Price')}</div>
                          <div className="text-sm font-bold text-white/90">{finance.sqm_price || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-white/40 uppercase mb-1">{tr('AQ Round')}</div>
                          <div className="text-sm font-bold text-white/90">{finance.aq_round || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-white/40 uppercase mb-1">{tr('LND Round')}</div>
                          <div className="text-sm font-bold text-white/90">{finance.lnd_round || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-white/40 uppercase mb-1">{tr('Desc Price')}</div>
                          <div className="text-sm font-bold text-white/90">{finance.desc_price || '—'}</div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
                
                {/* Actions Section */}
                <section className="flex flex-col gap-3 pb-8">
                  <button
                    onClick={copyTag}
                    className="flex items-center justify-center gap-2 p-3 w-full"
                    aria-label={tr('Copy Tag ID')}
                  >
                    <Copy size={16} className="opacity-60" />
                    <span className="text-sm font-bold">{copiedTag ? tr('Copied!') : item.tag_id}</span>
                  </button>
                  <button
                    onClick={copySrc}
                    className="flex items-center justify-center gap-2 p-3 w-full"
                    aria-label={tr('Copy Source Row')}
                  >
                    <Copy size={16} className="opacity-60" />
                    <span className="text-sm font-bold">{copiedSrc ? tr('Copied!') : `v825 / ${item.sheet} / row ${item.src_row}`}</span>
                  </button>
                </section>
              </div>
            </div>
            
            {/* Navigation Footer */}
            <div className="p-4 border-t border-white/5 flex gap-4 shrink-0 bg-[var(--slab)]">
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                className="flex-1 flex items-center justify-center gap-2 p-3"
              >
                <ChevronLeft size={18} />
                <span className="text-sm font-bold">{tr('Previous')}</span>
              </button>
              <button
                onClick={onNext}
                disabled={!hasNext}
                className="flex-1 flex items-center justify-center gap-2 p-3"
              >
                <span className="text-sm font-bold">{tr('Next')}</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
