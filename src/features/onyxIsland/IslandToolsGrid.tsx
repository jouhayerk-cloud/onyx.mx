import React, { useMemo, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useSetAtom } from 'jotai/react';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import { pinnedToolsAtom, isToolPinned } from '../../lib/toolRegistry';
import { tr } from '../../lib/i18n';
import { TactileSwitch } from '../../components/TactileSwitch';
import { recentToolsAtom, islandDensityAtom, pushRecent } from './recentTools';
import './islandGrid.css';

interface IslandToolsGridProps {
  tools: ToolDescriptor[];
  filter: string;
  onRun: (tool: ToolDescriptor) => void;
}

/**
 * The Tools tab: every tool the current page registered, grouped by section.
 * Order: Density toolbar, Pinned, Recent, then module groups.
 * Real 2-D arrow key navigation, roving tabindex, Home/End support.
 */
export const IslandToolsGrid: React.FC<IslandToolsGridProps> = ({ tools, filter, onRun }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [density, setDensity] = useAtom(islandDensityAtom);
  const recentIds = useAtomValue(recentToolsAtom);
  const setRecentTools = useSetAtom(recentToolsAtom);
  const pinnedOverrides = useAtomValue(pinnedToolsAtom);

  const normalizedFilter = filter.trim().toLowerCase();
  const isFilterEmpty = normalizedFilter.length === 0;

  const pinnedTools = useMemo(() => {
    if (!isFilterEmpty) return [];
    return tools.filter(t => isToolPinned(t, pinnedOverrides));
  }, [tools, pinnedOverrides, isFilterEmpty]);

  const recentTools = useMemo(() => {
    if (!isFilterEmpty || recentIds.length === 0) return [];
    const map = new Map(tools.map(t => [t.id, t]));
    const res: ToolDescriptor[] = [];
    for (const id of recentIds) {
      const tool = map.get(id);
      if (tool) res.push(tool);
    }
    return res;
  }, [tools, recentIds, isFilterEmpty]);

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

  // Section list in order: Pinned, Recent, then Groups
  const sections: { key: string; title: string; tools: ToolDescriptor[] }[] = [];
  if (pinnedTools.length > 0) {
    sections.push({ key: 'pinned', title: tr('Pinned'), tools: pinnedTools });
  }
  if (recentTools.length > 0) {
    sections.push({ key: 'recent', title: tr('Recent'), tools: recentTools });
  }
  for (const [groupName, groupTools] of groups) {
    sections.push({ key: `group-${groupName}`, title: groupName, tools: groupTools });
  }

  let first = true;

  const renderTool = (tool: ToolDescriptor, sectionKey: string) => {
    if (tool.kind === 'widget' && tool.render) {
      return (
        <div
          key={`${sectionKey}-${tool.id}`}
          id={`tile-${tool.id}`}
          className="isl-row isl-grid-widget p-3 overflow-y-auto max-h-[60vh]"
        >
          {tool.render()}
        </div>
      );
    }

    if (tool.kind === 'toggle') {
      return (
        <div
          key={`${sectionKey}-${tool.id}`}
          id={sectionKey.startsWith('group-') ? `tile-${tool.id}` : `tile-${sectionKey}-${tool.id}`}
          className="isl-grid-toggle flex items-center justify-center p-2 min-h-[44px]"
        >
          <TactileSwitch
            active={!!tool.pressed}
            onChange={() => {
              if (!tool.disabled) onRun(tool);
            }}
            label={tool.label}
          />
        </div>
      );
    }

    const Icon = tool.icon;
    const isFirst = first;
    first = false;
    const isComfortable = density === 'comfortable';

    return (
      <button
        key={`${sectionKey}-${tool.id}`}
        id={sectionKey.startsWith('group-') ? `tile-${tool.id}` : `tile-${sectionKey}-${tool.id}`}
        type="button"
        data-tool-tile
        title={tool.title || tool.label}
        disabled={tool.disabled}
        onClick={e => {
          e.preventDefault();
          if (!tool.disabled) handleActionClick(tool);
        }}
        onKeyDown={handleKeyDown}
        tabIndex={isFirst ? 0 : -1}
        className={`isl-tile isl-grid-tile isl-grid-tile--${density}`}
      >
        <span className={`isl-grid-tile-icon${isComfortable ? ' isl-tile-icon' : ''}`}>
          <Icon size={isComfortable ? 22 : 20} color="currentColor" strokeWidth={1.75} aria-hidden="true" />
          {tool.badge != null && <span className="isl-launcher-badge isl-grid-tile-badge" aria-hidden="true" />}
        </span>
        <span className={`isl-grid-tile-label${isComfortable ? ' isl-tile-label' : ''}`}>{tool.label}</span>
      </button>
    );
  };

  return (
    <div ref={containerRef} className="isl-pane isl-grid-pane">
      <div className="isl-grid-toolbar">
        <div className="isl-grid-segmented" role="group" aria-label={tr('Density')}>
          <button
            type="button"
            className={`isl-grid-seg-btn${density === 'comfortable' ? ' is-active' : ''}`}
            aria-pressed={density === 'comfortable'}
            aria-label={tr('Comfortable')}
            onClick={() => setDensity('comfortable')}
          >
            {tr('Comfortable')}
          </button>
          <button
            type="button"
            className={`isl-grid-seg-btn${density === 'compact' ? ' is-active' : ''}`}
            aria-pressed={density === 'compact'}
            aria-label={tr('Compact')}
            onClick={() => setDensity('compact')}
          >
            {tr('Compact')}
          </button>
        </div>
      </div>

      <div className="isl-grid-flow">
        {sections.map(section => {
          const count = section.tools.length;
          const hasWidget = section.tools.some(t => t.kind === 'widget');
          const baseWidth = density === 'compact' ? 150 : 96;
          const sectionStyle: React.CSSProperties = hasWidget
            ? { flexBasis: '100%', width: '100%' }
            : { flex: '1 1 auto', minWidth: `min(100%, ${Math.max(1, count) * baseWidth}px)` };

          return (
            <section
              key={section.key}
              aria-label={section.title}
              className={`isl-grid-section${hasWidget ? ' isl-grid-section--widget' : ''}`}
              style={sectionStyle}
            >
              <h3 className="isl-caption isl-grid-section-title">{section.title}</h3>
              <div className={`isl-grid-tools isl-grid-tools--${density}`}>
                {section.tools.map(tool => renderTool(tool, section.key))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
