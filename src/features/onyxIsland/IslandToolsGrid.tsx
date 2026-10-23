import React, { useMemo, useRef } from 'react';
import { useSetAtom } from 'jotai/react';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import { tr } from '../../lib/i18n';
import { recentToolsAtom, pushRecent } from './recentTools';
import '../core/submenuDock.css';
import './islandGrid.css';

interface IslandToolsGridProps {
  tools: ToolDescriptor[];
  filter: string;
  onRun: (tool: ToolDescriptor) => void;
}

/**
 * The All tools panel: one Universal Tools Bar style bar per group (the same utb-control buttons as the bars
 * outside the island). Pinned tools already sit on the island bar, so they are not repeated here.
 * Arrow keys move between buttons, Home/End jump to the ends.
 */
export const IslandToolsGrid: React.FC<IslandToolsGridProps> = ({ tools, filter, onRun }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const setRecentTools = useSetAtom(recentToolsAtom);
  const normalizedFilter = filter.trim().toLowerCase();

  const groups = useMemo(() => {
    const filtered = tools.filter(t => !normalizedFilter || t.label.toLowerCase().includes(normalizedFilter));
    const map = new Map<string, ToolDescriptor[]>();
    for (const t of filtered) {
      if (!map.has(t.group)) map.set(t.group, []);
      map.get(t.group)!.push(t);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return Array.from(map.entries()).sort((a, b) => a[1][0].order - b[1][0].order);
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

  const handleActionClick = (tool: ToolDescriptor) => {
    setRecentTools(prev => pushRecent(prev, tool.id));
    onRun(tool);
  };

  if (groups.length === 0) {
    return (
      <div className="isl-empty">
        <span className="isl-caption">{tr('No tools match')}</span>
      </div>
    );
  }

  let first = true;
  const renderTool = (tool: ToolDescriptor) => {
    if (tool.kind === 'widget' && tool.render) {
      return <div key={tool.id} id={`tile-${tool.id}`} className="isl-bar-widget">{tool.render()}</div>;
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
        aria-pressed={tool.kind === 'toggle' ? !!tool.pressed : undefined}
        onClick={e => {
          e.preventDefault();
          if (!tool.disabled) handleActionClick(tool);
        }}
        onKeyDown={handleKeyDown}
        tabIndex={isFirst ? 0 : -1}
        className="utb-control isl-bar-control"
      >
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
        <span>{tool.label}</span>
        {tool.badge != null && <span className="isl-launcher-badge isl-grid-tile-badge" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div ref={containerRef} className="isl-pane isl-bars">
      {groups.map(([groupName, groupTools]) => (
        <section key={groupName} aria-label={groupName} className="isl-bar">
          <h3 className="isl-caption isl-bar-title">{groupName}</h3>
          <div className="utb-scrollable">{groupTools.map(renderTool)}</div>
        </section>
      ))}
    </div>
  );
};
