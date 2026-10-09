import React, { useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import { tr } from '../../lib/i18n';

interface IslandLaunchersProps {
  tools: ToolDescriptor[];
  onRun: (tool: ToolDescriptor) => void;
  showLabels?: boolean;
}

export const IslandLaunchers: React.FC<IslandLaunchersProps> = ({ tools, onRun, showLabels = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (index + 1) % tools.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (index - 1 + tools.length) % tools.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tools.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    if (containerRef.current) {
      const buttons = Array.from(containerRef.current.querySelectorAll('button:not(:disabled)')) as HTMLButtonElement[];
      if (buttons[nextIndex]) {
        buttons[nextIndex].focus();
      }
    }
  };

  if (tools.length === 0) return null;

  return (
    <div ref={containerRef} role="toolbar" aria-label={tr('Pinned tools')} className="flex items-center gap-1 mx-1">
      {tools.map((tool, i) => {
        const Icon = tool.icon;
        const isToggle = tool.kind === 'toggle';
        return (
          <m.button
            key={tool.id}
            layout
            type="button"
            title={tool.title || tool.label}
            aria-label={tool.label}
            aria-pressed={isToggle ? !!tool.pressed : undefined}
            disabled={tool.disabled}
            onClick={(e) => {
              e.preventDefault();
              onRun(tool);
            }}
            onKeyDown={(e) => handleKeyDown(e, i)}
            tabIndex={i === 0 ? 0 : -1}
            className={`relative flex items-center justify-center min-w-[44px] min-h-[44px] cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed isl-hw10 transition-colors text-white border border-transparent ${showLabels ? 'flex-col h-auto py-2 px-1.5 gap-1.5 rounded-2xl' : 'w-11 h-11 rounded-full'}`}
          >
            <m.div layout="position" className="flex items-center justify-center relative shrink-0">
              {tool.id === 'global.sidebar' ? (
                <div className="flex items-center justify-center w-6 h-6">
                  <Icon size={22} color="currentColor" />
                </div>
              ) : (
                <Icon size={22} color="currentColor" strokeWidth={2} />
              )}
              {tool.badge != null && (
                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-blue-500 rounded-full border border-[var(--glass-tint,rgba(10,12,20,0.4))] shadow-sm" />
              )}
            </m.div>

            <AnimatePresence initial={false}>
              {showLabels && (
                <m.span
                  layout="position"
                  initial={{ opacity: 0, height: 0, scale: 0.8 }}
                  animate={{ opacity: 1, height: 'auto', scale: 1 }}
                  exit={{ opacity: 0, height: 0, scale: 0.8 }}
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                  className="text-[9px] font-black uppercase tracking-widest text-white/90 whitespace-nowrap overflow-hidden leading-none"
                >
                  {tool.label}
                </m.span>
              )}
            </AnimatePresence>
          </m.button>
        );
      })}
    </div>
  );
};
