import React, { useMemo, useRef } from 'react';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import { tr } from '../../lib/i18n';
import { TactileSwitch } from '../../components/TactileSwitch';

interface IslandToolsGridProps {
  tools: ToolDescriptor[];
  filter: string;
  onRun: (tool: ToolDescriptor) => void;
}

/**
 * The Tools tab: every tool the current page registered, grouped by the group the module gave it.
 * Assistant and notifications are tabs of the panel now, not tiles. Arrow keys move to the nearest tile in that
 * direction (real 2-D navigation, whatever the column count is), Home and End jump to the first and last.
 */
export const IslandToolsGrid: React.FC<IslandToolsGridProps> = ({ tools, filter, onRun }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const normalizedFilter = filter.trim().toLowerCase();

  const groups = useMemo(() => {
    const filtered = tools.filter(t => !normalizedFilter || t.label.toLowerCase().includes(normalizedFilter));
    const map = new Map<string, ToolDescriptor[]>();
    for (const t of filtered) {
      if (!map.has(t.group)) map.set(t.group, []);
      map.get(t.group)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tools, normalizedFilter]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const key = e.key;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
    const items = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-tool-tile]:not(:disabled)') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    if (key === 'Home') { items[0].focus(); return; }
    if (key === 'End') { items[items.length - 1].focus(); return; }
    const from = e.currentTarget.getBoundingClientRect();
    const cx = from.left + from.width / 2;
    const cy = from.top + from.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const it of items) {
      if (it === e.currentTarget) continue;
      const b = it.getBoundingClientRect();
      const dx = b.left + b.width / 2 - cx;
      const dy = b.top + b.height / 2 - cy;
      const horizontal = key === 'ArrowRight' || key === 'ArrowLeft';
      const ahead = key === 'ArrowRight' ? dx > 4 : key === 'ArrowLeft' ? dx < -4 : key === 'ArrowDown' ? dy > 4 : dy < -4;
      const aligned = horizontal ? Math.abs(dy) < from.height / 2 : true;
      if (!ahead || !aligned) continue;
      const score = horizontal ? Math.abs(dx) : Math.abs(dy) * 4 + Math.abs(dx);
      if (score < bestScore) { best = it; bestScore = score; }
    }
    best?.focus();
  };

  if (groups.length === 0) {
    return <div className="isl-empty"><span className="isl-caption">{tr('No tools match')}</span></div>;
  }

  let first = true;
  return (
    <div ref={containerRef} className="isl-pane flex flex-col gap-3 p-3 w-full">
      {groups.map(([groupName, groupTools]) => (
        <section key={groupName} aria-label={groupName} className="flex flex-col gap-2">
          <h3 className="isl-caption px-1 m-0">{groupName}</h3>
          <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-1.5">
            {groupTools.map(tool => {
              if (tool.kind === 'widget' && tool.render) {
                return (
                  <div key={tool.id} id={`tile-${tool.id}`} className="isl-row col-span-3 md:col-span-4 xl:col-span-5 p-3 overflow-y-auto max-h-[60vh]">
                    {tool.render()}
                  </div>
                );
              }
              if (tool.kind === 'toggle') {
                return (
                  <div key={tool.id} id={`tile-${tool.id}`} className="flex items-center justify-center p-2 min-h-[44px]">
                    <TactileSwitch active={!!tool.pressed} onChange={() => { if (!tool.disabled) tool.run?.(); }} label={tool.label} />
                  </div>
                );
              }
              const Icon = tool.icon;
              const isFirst = first;
              first = false;
              return (
                <button
                  key={tool.id}
                  id={`tile-${tool.id}`}
                  type="button"
                  data-tool-tile
                  title={tool.title || tool.label}
                  disabled={tool.disabled}
                  onClick={e => { e.preventDefault(); tool.run?.(); }}
                  onKeyDown={handleKeyDown}
                  tabIndex={isFirst ? 0 : -1}
                  className="isl-tile"
                >
                  <span className="isl-tile-icon">
                    <Icon size={22} color="currentColor" strokeWidth={1.75} aria-hidden="true" />
                    {tool.badge != null && <span className="isl-launcher-badge" aria-hidden="true" />}
                  </span>
                  <span className="isl-tile-label">{tool.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
