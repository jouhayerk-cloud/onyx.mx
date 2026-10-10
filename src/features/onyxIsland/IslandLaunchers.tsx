import React, { useRef } from 'react';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import { tr } from '../../lib/i18n';

interface IslandLaunchersProps {
  tools: ToolDescriptor[];
  onRun: (tool: ToolDescriptor) => void;
}

/**
 * The launchers beside the face at rest, and in the panel header on wide screens: icon buttons with an accessible
 * name. The name shows as a caption under the button on hover and focus (CSS, data-label), so the dock never changes
 * size while the pointer moves over it.
 */
export const IslandLaunchers: React.FC<IslandLaunchersProps> = ({ tools, onRun }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIndex = (index + 1) % tools.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIndex = (index - 1 + tools.length) % tools.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = tools.length - 1;
    else return;
    e.preventDefault();
    const buttons = Array.from(containerRef.current?.querySelectorAll('button:not(:disabled)') ?? []) as HTMLButtonElement[];
    buttons[nextIndex]?.focus();
  };

  if (tools.length === 0) return null;

  return (
    <div ref={containerRef} role="toolbar" aria-label={tr('Pinned tools')} className="flex items-center gap-0.5">
      {tools.map((tool, i) => {
        const Icon = tool.icon;
        const isToggle = tool.kind === 'toggle';
        return (
          <button
            key={tool.id}
            type="button"
            title={tool.title || tool.label}
            data-label={tool.label}
            aria-label={tool.label}
            aria-pressed={isToggle ? !!tool.pressed : undefined}
            disabled={tool.disabled}
            onClick={e => { e.preventDefault(); onRun(tool); }}
            onKeyDown={e => handleKeyDown(e, i)}
            tabIndex={i === 0 ? 0 : -1}
            className="isl-launcher"
          >
            <Icon size={20} color="currentColor" strokeWidth={2} aria-hidden="true" />
            {tool.badge != null && <span className="isl-launcher-badge" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
};
