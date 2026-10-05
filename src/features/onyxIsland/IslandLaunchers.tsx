import React, { useRef } from 'react';
import type { ToolDescriptor } from '../../lib/toolRegistry';

interface IslandLaunchersProps {
  tools: ToolDescriptor[];
  onRun: (tool: ToolDescriptor) => void;
}

export const IslandLaunchers: React.FC<IslandLaunchersProps> = ({ tools, onRun }) => {
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
    <div ref={containerRef} role="toolbar" aria-label="Pinned tools" className="flex items-center gap-1 mx-1">
      {tools.map((tool, i) => {
        const Icon = tool.icon;
        const isToggle = tool.kind === 'toggle';
        return (
          <button
            key={tool.id}
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
            className="relative flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-full cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed isl-hw10 transition-colors text-white border border-transparent"
          >
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
          </button>
        );
      })}
    </div>
  );
};
