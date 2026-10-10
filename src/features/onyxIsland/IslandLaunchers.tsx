import React, { useRef } from 'react';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import { tr } from '../../lib/i18n';
import { MoreHorizontal } from 'lucide-react';

interface IslandLaunchersProps {
  tools: ToolDescriptor[];
  onRun: (tool: ToolDescriptor) => void;
  showLabels?: boolean;
  overflow?: boolean;
  onMore?: () => void;
  reverse?: boolean;
}

/**
 * The launchers beside the face at rest, and in the panel header on wide screens: icon buttons with an accessible
 * name. The name shows as a caption under the button on hover and focus (CSS, data-label), so the dock never changes
 * size while the pointer moves over it.
 */
export const IslandLaunchers: React.FC<IslandLaunchersProps> = ({ tools, onRun, showLabels, overflow, onMore, reverse }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const total = tools.length + (overflow ? 1 : 0);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIndex = (index + 1) % total;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIndex = (index - 1 + total) % total;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = total - 1;
    else return;
    e.preventDefault();
    const buttons = Array.from(containerRef.current?.querySelectorAll('button:not(:disabled)') ?? []) as HTMLButtonElement[];
    buttons[nextIndex]?.focus();
  };

  if (total === 0) return null;

  const renderTool = (tool: ToolDescriptor, i: number) => {
    const Icon = tool.icon;
    const isToggle = tool.kind === 'toggle';
    const hideLabel = (tool as any).hideLabel;
    const showText = showLabels && !hideLabel;
    const label = tool.short ?? tool.label;
    return (
      <button
        key={tool.id}
        type="button"
        title={tool.title || tool.label}
        data-label={!showText ? tool.label : undefined}
        aria-label={tool.label}
        aria-pressed={isToggle ? !!tool.pressed : undefined}
        disabled={tool.disabled}
        onClick={e => { e.preventDefault(); onRun(tool); }}
        onKeyDown={e => handleKeyDown(e, i)}
        tabIndex={i === 0 ? 0 : -1}
        className={`isl-launcher ${showText ? 'isl-launcher--labelled' : ''}`}
      >
        <Icon size={showText ? 20 : 24} color="currentColor" strokeWidth={2} aria-hidden="true" />
        {showText && <span className="isl-launcher-label">{label}</span>}
        {tool.badge != null && <span className="isl-launcher-badge" aria-hidden="true" />}
      </button>
    );
  };

  const renderMore = (i: number) => {
    return (
      <button
        key="more"
        type="button"
        title={tr('More tools')}
        data-label={tr('More tools')}
        aria-label={tr('More tools')}
        onClick={e => { e.preventDefault(); onMore?.(); }}
        onKeyDown={e => handleKeyDown(e, i)}
        tabIndex={i === 0 ? 0 : -1}
        className="isl-launcher"
      >
        <MoreHorizontal size={24} color="currentColor" strokeWidth={2} aria-hidden="true" />
      </button>
    );
  };

  const elements = tools.map((tool, i) => renderTool(tool, reverse ? i + 1 : i));
  if (overflow) {
    if (reverse) elements.unshift(renderMore(0));
    else elements.push(renderMore(tools.length));
  }

  return (
    <div ref={containerRef} role="toolbar" aria-label={tr('Pinned tools')} className="flex items-center gap-0.5">
      {elements}
    </div>
  );
};
