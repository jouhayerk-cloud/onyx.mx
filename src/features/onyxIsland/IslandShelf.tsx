import React, { useRef } from 'react';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import { tr } from '../../lib/i18n';
import { MoreHorizontal } from 'lucide-react';

interface IslandShelfProps {
  tools: ToolDescriptor[];
  onRun: (tool: ToolDescriptor) => void;
  onMore: () => void;
  onAuto: () => void;
  isAuto: boolean;
}

export const IslandShelf: React.FC<IslandShelfProps> = ({ tools, onRun, onMore, onAuto, isAuto }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const shelfTools = tools.filter(t => t.kind === 'action' || t.kind === 'toggle');

  const groups: { name: string; tools: ToolDescriptor[] }[] = [];
  shelfTools.forEach(t => {
    let group = groups.find(g => g.name === t.group);
    if (!group) {
      group = { name: t.group, tools: [] };
      groups.push(group);
    }
    group.tools.push(t);
  });

  const handleKeyDown = (e: React.KeyboardEvent, index: number, total: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIndex = (index + 1) % total;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIndex = (index - 1 + total) % total;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = total - 1;
    else return;
    e.preventDefault();
    const buttons = Array.from(containerRef.current?.querySelectorAll('.isl-launcher:not(:disabled)') ?? []) as HTMLButtonElement[];
    buttons[nextIndex]?.focus();
  };

  const allRenderedTools = groups.flatMap(g => g.tools);
  const total = allRenderedTools.length + 1; // +1 for More

  let globalIndex = 0;

  return (
    <div ref={containerRef} className="isl-shelf-wrap" role="region" aria-label={tr('More tools')}>
      <div className="isl-shelf-header">
        <span className="isl-shelf-title">{tr('Tools')}</span>
        <button
          type="button"
          className="isl-chip"
          onClick={onAuto}
          aria-pressed={isAuto}
        >
          {tr('Auto')}
        </button>
      </div>
      <div className="isl-shelf-groups" role="toolbar" aria-label={tr('Tools')}>
        {groups.map((group, gIndex) => (
          <React.Fragment key={group.name}>
            {gIndex > 0 && <div className="isl-shelf-divider" aria-hidden="true" />}
            <div className="isl-shelf-group">
              {group.tools.map(tool => {
                const i = globalIndex++;
                const Icon = tool.icon;
                const isToggle = tool.kind === 'toggle';
                const label = tool.short ?? tool.label;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    title={tool.title || tool.label}
                    aria-label={tool.label}
                    aria-pressed={isToggle ? !!tool.pressed : undefined}
                    disabled={tool.disabled}
                    onClick={e => { e.preventDefault(); onRun(tool); }}
                    onKeyDown={e => handleKeyDown(e, i, total)}
                    tabIndex={i === 0 ? 0 : -1}
                    className="isl-launcher isl-shelf-btn"
                  >
                    <Icon size={20} color="currentColor" strokeWidth={2} aria-hidden="true" />
                    <span className="isl-shelf-btn-label">{label}</span>
                    {tool.badge != null && <span className="isl-launcher-badge" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </React.Fragment>
        ))}
        <button
          key="more"
          type="button"
          title={tr('More tools')}
          aria-label={tr('More tools')}
          onClick={e => { e.preventDefault(); onMore(); }}
          onKeyDown={e => handleKeyDown(e, globalIndex, total)}
          tabIndex={globalIndex === 0 ? 0 : -1}
          className="isl-launcher isl-shelf-btn"
        >
          <MoreHorizontal size={20} color="currentColor" strokeWidth={2} aria-hidden="true" />
          <span className="isl-shelf-btn-label">{tr('More tools')}</span>
        </button>
      </div>
    </div>
  );
};
