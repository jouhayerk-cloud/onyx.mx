import { useState, useEffect, useCallback, useRef } from 'react';
import type React from 'react';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import type { IslandDeploy, IslandLevel } from './islandState';

const labelWidthCache = new Map<string, number>();
let canvasContext: CanvasRenderingContext2D | null = null;

function getLabelWidth(label: string, font: string): number {
  const key = `${label}|${font}`;
  let w = labelWidthCache.get(key);
  if (w !== undefined) return w;

  if (typeof document !== 'undefined' && !canvasContext) {
    const canvas = document.createElement('canvas');
    canvasContext = canvas.getContext('2d');
  }
  if (canvasContext) {
    canvasContext.font = font;
    w = canvasContext.measureText(label).width;
    labelWidthCache.set(key, w);
    return w;
  }
  return label.length * 7;
}

/**
 * Calculates how many tools fit in the island dock at the given width.
 * Level 1 shows icons only. Level 2 shows text labels, dropping labels from the lowest priority tool
 * if they do not fit. Level 3 shows a shelf. The function drops tools to the overflow list when they do not fit.
 */
export function fitTools(
  availableWidth: number,
  tools: ToolDescriptor[],
  deploy: IslandDeploy,
  labelWidthFn: (tool: ToolDescriptor) => number,
  iconWidth: number,
  gap: number,
  faceWidth: number,
  moreWidth: number
): { level: IslandLevel; visible: ToolDescriptor[]; overflow: ToolDescriptor[]; showLabels: boolean; width: number } {
  const n = tools.length;
  if (n === 0 || deploy === 0) {
    return { level: 0, visible: [], overflow: tools, showLabels: false, width: faceWidth };
  }

  const ranked = tools.map((tool, index) => ({
    tool,
    index,
    essential: tool.essential ?? false,
    pinned: tool.pinned ?? false,
    priority: tool.priority ?? 50
  }));

  ranked.sort((a, b) => {
    if (a.essential !== b.essential) return a.essential ? -1 : 1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.index - b.index;
  });

  const sortedTools = ranked.map(r => r.tool);

  if (deploy === 3) {
    const k = Math.min(n, 12);
    const visible = sortedTools.slice(0, k);
    return {
      level: 3,
      visible,
      overflow: sortedTools.slice(k),
      showLabels: true,
      width: availableWidth || faceWidth
    };
  }

  let maxK = 0;
  let level1Width = faceWidth;

  if (availableWidth === 0) {
    maxK = n;
  } else {
    for (let k = n; k >= 1; k--) {
      let w = faceWidth;
      let items = 1;
      w += k * iconWidth;
      items += k;
      if (k < n) {
        w += moreWidth;
        items += 1;
      }
      w += (items - 1) * gap;
      if (w <= availableWidth) {
        maxK = k;
        level1Width = w;
        break;
      }
    }
  }

  if (maxK === 0) {
    return { level: 0, visible: [], overflow: sortedTools, showLabels: false, width: faceWidth };
  }

  if (deploy === 1) {
    return {
      level: 1,
      visible: sortedTools.slice(0, maxK),
      overflow: sortedTools.slice(maxK),
      showLabels: false,
      width: level1Width
    };
  }

  const visibleSubset = sortedTools.slice(0, maxK);
  const labels = new Array(maxK).fill(true);

  const calcWidth = () => {
    let w = faceWidth;
    let items = 1;
    for (let i = 0; i < maxK; i++) {
      w += iconWidth + (labels[i] ? labelWidthFn(visibleSubset[i]) : 0);
      items++;
    }
    if (maxK < n) {
      w += moreWidth;
      items++;
    }
    w += (items - 1) * gap;
    return w;
  };

  let currentWidth = calcWidth();

  if (availableWidth > 0) {
    for (let i = maxK - 1; i >= 0; i--) {
      if (currentWidth <= availableWidth) break;
      labels[i] = false;
      currentWidth = calcWidth();
    }
  }

  const hasAnyLabel = labels.some(l => l);
  const finalLevel = hasAnyLabel ? 2 : 1;

  const finalVisible = visibleSubset.map((t, i) => {
    if (labels[i]) return t;
    return Object.assign({}, t, { hideLabel: true });
  });

  return {
    level: finalLevel,
    visible: finalVisible,
    overflow: sortedTools.slice(maxK),
    showLabels: finalLevel === 2,
    width: currentWidth
  };
}

export interface IslandFitOpts {
  bandRef: React.RefObject<HTMLElement | null>;
  tools: ToolDescriptor[];
  deploy: IslandDeploy;
  hasFace?: boolean;
}

/**
 * Measures the available width in the island band and computes the best deployment level for tools.
 * Safe for server rendering. Automatically re-measures when fonts load or theme changes.
 */
export function useIslandFit(opts: IslandFitOpts): { level: IslandLevel; visible: ToolDescriptor[]; overflow: ToolDescriptor[]; showLabels: boolean; width: number } {
  const lastWidthRef = useRef<number>(0);
  const [availableWidth, setAvailableWidth] = useState<number>(0);
  const [iconWidth, setIconWidth] = useState<number>(36);
  const [font, setFont] = useState<string>('600 13px sans-serif');
  const [, setTick] = useState(0);

  const getFontAndIconWidth = useCallback(() => {
    if (!opts.bandRef.current) return { font: '600 13px sans-serif', iconWidth: 36 };
    const style = window.getComputedStyle(opts.bandRef.current);
    const weight = style.fontWeight || '600';
    const size = style.fontSize || '13px';
    const family = style.fontFamily || 'sans-serif';
    const f = `${weight} ${size} ${family}`;
    const iw = parseInt(style.getPropertyValue('--isl-target')) || 36;
    return { font: f, iconWidth: iw };
  }, [opts.bandRef]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId: number;
    const update = () => {
      if (!opts.bandRef.current) return;
      const rect = opts.bandRef.current.getBoundingClientRect();
      const currentWidth = rect.width;
      const { font: f, iconWidth: iw } = getFontAndIconWidth();

      let nextWidth = lastWidthRef.current;
      if (Math.abs(currentWidth - lastWidthRef.current) > 24 || lastWidthRef.current === 0) {
        nextWidth = currentWidth;
        lastWidthRef.current = currentWidth;
      }

      setAvailableWidth(prev => (prev !== nextWidth ? nextWidth : prev));
      setIconWidth(prev => (prev !== iw ? iw : prev));
      setFont(prev => (prev !== f ? f : prev));
    };

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    });

    if (opts.bandRef.current) {
      observer.observe(opts.bandRef.current);
      update();
    }

    const onWindowResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
      cancelAnimationFrame(rafId);
    };
  }, [opts.bandRef, getFontAndIconWidth]);

  useEffect(() => {
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        labelWidthCache.clear();
        setTick(t => t + 1);
      });
    }
    if (typeof document !== 'undefined') {
      const observer = new MutationObserver(() => {
        labelWidthCache.clear();
        setTick(t => t + 1);
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    }
  }, []);

  const gap = 2;
  const faceWidth = opts.hasFace !== false ? 56 : 0;
  const moreWidth = iconWidth;

  const labelWidthFn = useCallback((tool: ToolDescriptor) => {
    const text = tool.short || tool.label;
    return Math.ceil(getLabelWidth(text, font)) + 6;
  }, [font]);

  if (typeof window === 'undefined' || availableWidth === 0) {
    return fitTools(0, opts.tools, opts.deploy, labelWidthFn, 36, gap, faceWidth, 36);
  }

  return fitTools(availableWidth, opts.tools, opts.deploy, labelWidthFn, iconWidth, gap, faceWidth, moreWidth);
}
