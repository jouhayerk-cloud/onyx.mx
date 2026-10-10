import React, { lazy, Suspense, useEffect, useRef, useState, useMemo, useCallback, useLayoutEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { m, LazyMotion, domMax, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { OnyxFace } from '../onyxAgent/face/OnyxFace';
import { useGaze } from '../onyxAgent/face/useGaze';
import { onyxAgentPhaseAtom } from '../onyxAgent/agentState';
import { useIslandNotifications, dismissNotification, pauseToastTimer, resumeToastTimer, pushNotification } from './notify/store';
import { IslandToastContent } from './IslandToastContent';
import { tr } from '../../lib/i18n';
import { islandModeAtom, islandPaneAtom, islandItemAtom, islandChanDraftAtom, expressionForKind, islandDeployAtom, type IslandReadout, type IslandPane, type IslandDeploy } from './islandState';
import { SPRING, SPRING_BOUNCY, SPRING_SLOW, ENTER_REVEAL_DELAY_MS, EXIT_COLLAPSE_DELAY_MS, SWIPE_DISTANCE, SWIPE_VELOCITY } from './motion/tokens';
import { allToolsAtom, pinnedToolsAtom, isToolPinned, islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import { userAtom, activeViewAtom, SelectedItemDataAtom } from '../../lib/atoms';
import { IslandLaunchers } from './IslandLaunchers';
import { IslandToolsGrid } from './IslandToolsGrid';
import { IslandHeader, displayNameOf, greeting } from './IslandHeader';
import { IslandTabs } from './IslandTabs';
import { IslandShelf } from './IslandShelf';
import { fitTools } from './useIslandFit';
import toast from './notify/toast';
import './islandTokens.css';
import './islandShell.css';
import './islandGlass.css';
import './islandRefraction.css';
import { IslandRefractionDefs, useIslandRefraction } from './IslandRefraction';
import './islandDeploy.css';

const InboxPane = lazy(() => import('./panes/InboxPane').then(m => ({ default: m.InboxPane })));
const ChanPane = lazy(() => import('./panes/ChanPane').then(m => ({ default: m.ChanPane })));
const ItemPaneConnected = lazy(() => import('./panes/ItemPaneConnected').then(m => ({ default: m.ItemPaneConnected })));

class ChunkBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div className="isl-empty">{tr('Could not load the module. Check your connection and try again.')}</div>
      : this.props.children;
  }
}

function useIdleTimer(timeoutMs: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const onActive = () => {
      setIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIdle(true), timeoutMs);
    };
    onActive();
    window.addEventListener('mousemove', onActive);
    window.addEventListener('keydown', onActive);
    window.addEventListener('touchstart', onActive);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('mousemove', onActive);
      window.removeEventListener('keydown', onActive);
      window.removeEventListener('touchstart', onActive);
    };
  }, [timeoutMs]);
  return idle;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Swipe down on the sheet's grabber to close it (phone). The surface follows the finger; past 90 px, or fast, it closes. */
function useSheetDrag(onClose: () => void) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { y: e.clientY, t: performance.now() };
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current) return;
      setDy(Math.max(0, e.clientY - start.current.y));
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!start.current) return;
      const dist = Math.max(0, e.clientY - start.current.y);
      const speed = dist / Math.max(1, performance.now() - start.current.t);
      start.current = null;
      setDragging(false);
      setDy(0);
      if (dist > 90 || speed > 0.6) onClose();
    },
    onPointerCancel: () => { start.current = null; setDragging(false); setDy(0); },
  };
  return { dy, dragging, handlers };
}

const VIEW_LABELS: Record<string, string> = {
  inventory: 'Inventory', finance: 'Finances', warehouse: 'Warehouse', trucking: 'Trucking', logistics: 'Logistics',
  dashboard: 'Dashboard', workbook: 'Archived', devices: 'Devices', process: 'Process', threed: '3D and AR',
  viewer: 'Viewer', welcome: 'Home', control: 'Control Center', store: 'Store', upload: 'Upload', packing: 'Packing',
};

const labelWidthCache = new Map<string, number>();
let canvasContext: CanvasRenderingContext2D | null = null;
function measureTextW(text: string, font: string) {
  const key = text + '|' + font;
  if (labelWidthCache.has(key)) return labelWidthCache.get(key)!;
  if (!canvasContext && typeof document !== 'undefined') {
    canvasContext = document.createElement('canvas').getContext('2d');
  }
  let w = text.length * 7;
  if (canvasContext) {
    canvasContext.font = font;
    w = canvasContext.measureText(text).width;
  }
  labelWidthCache.set(key, w);
  return w;
}

export const OnyxIsland: React.FC<{ readout?: IslandReadout | null }> = ({ readout = null }) => {
  const [mode, setMode] = useAtom(islandModeAtom);
  const [pane, setPane] = useAtom(islandPaneAtom);
  const { current, unread } = useIslandNotifications();
  const phase = useAtomValue(onyxAgentPhaseAtom);
  const allTools = useAtomValue(allToolsAtom);
  const pinnedOverrides = useAtomValue(pinnedToolsAtom);
  const commandsEnabled = useAtomValue(islandCommandsEnabledAtom);
  const user = useAtomValue(userAtom) as { name?: string; email?: string; role?: string } | null;
  const activeView = useAtomValue(activeViewAtom);
  const listItem = useAtomValue(islandItemAtom);
  const storedItem = useAtomValue(SelectedItemDataAtom);
  const selectedItem = listItem ?? storedItem;

  const isReduced = useReducedMotion();
  const transition = isReduced ? { duration: 0 } : mode === 'rest' ? SPRING_BOUNCY : SPRING;
  const transitionSlow = isReduced ? { duration: 0 } : SPRING_SLOW;

  const islandRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const faceBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [filterText, setFilterText] = useState('');

  useGaze(islandRef);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useIslandRefraction(surfaceRef);
  const isIdle = useIdleTimer(10 * 60 * 1000);

  const xl = useMediaQuery('(min-width: 1280px)');
  const lg = useMediaQuery('(min-width: 1024px)');
  const md = useMediaQuery('(min-width: 768px)');
  const maxLaunchers = xl ? 6 : 4;
  // a page that gives its tools a dock side (Tools left of the face, Actions right of it) may show more launchers
  const maxDockLaunchers = xl ? 10 : lg ? 8 : 6;

  const { leftLaunchers, rightLaunchers } = useMemo(() => {
    if (!commandsEnabled) return { leftLaunchers: [] as ToolDescriptor[], rightLaunchers: [] as ToolDescriptor[] };
    const pinned = allTools.filter(t => isToolPinned(t, pinnedOverrides));
    if (pinned.some(t => t.dock)) {
      const byOrder = (a: ToolDescriptor, b: ToolDescriptor) => a.order - b.order || a.id.localeCompare(b.id);
      return {
        leftLaunchers: pinned.filter(t => t.dock !== 'right').sort(byOrder).slice(0, maxDockLaunchers),
        rightLaunchers: pinned.filter(t => t.dock === 'right').sort(byOrder).slice(0, maxDockLaunchers),
      };
    }
    const cut = pinned.slice(0, maxLaunchers);
    return { leftLaunchers: cut.slice(0, Math.ceil(cut.length / 2)), rightLaunchers: cut.slice(Math.ceil(cut.length / 2)) };
  }, [allTools, pinnedOverrides, maxLaunchers, maxDockLaunchers, commandsEnabled]);

  const [storedDeploy, setStoredDeploy] = useAtom(islandDeployAtom);
  const setChanDraft = useSetAtom(islandChanDraftAtom);
  const [tempShelfOpen, setTempShelfOpen] = useState(false);
  const [isInside, setIsInside] = useState(false);
  const [dwellTimer, setDwellTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [islandWidth, setIslandWidth] = useState(1000);
  const [islandFont, setIslandFont] = useState('600 13px sans-serif');
  const [islandIconWidth, setIslandIconWidth] = useState(44);
  const [, setTick] = useState(0);

  useLayoutEffect(() => {
    const el = islandRef.current?.closest('.onyx-island-layer') as HTMLElement;
    if (!el) return;
    const update = () => {
      setIslandWidth(el.getBoundingClientRect().width);
      const style = window.getComputedStyle(el);
      setIslandFont(`${style.fontWeight || '600'} ${style.fontSize || '13px'} ${style.fontFamily || 'sans-serif'}`);
      setIslandIconWidth(parseInt(style.getPropertyValue('--isl-target')) || 44);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => setTick(t => t + 1));
    }
  }, []);

  const getLabelWidthFn = useCallback((tool: ToolDescriptor) => {
    return Math.ceil(measureTextW(tool.short || tool.label, islandFont)) + 6;
  }, [islandFont]);

  const hasLaunchers = leftLaunchers.length > 0 || rightLaunchers.length > 0;
  const docked = hasLaunchers && mode === 'rest';
  const isSheet = mode === 'surface' && !md;
  const faceSize = mode === 'rest' ? (docked ? 52 : 64) : 52;
  const budget = Math.max(0, (islandWidth - faceSize - 24 - 18) / 2);
  const isShelfVisible = mode === 'rest' && (storedDeploy === 3 || tempShelfOpen);
  const deployForFit = isShelfVisible ? 3 : storedDeploy;
  
  const leftFit = fitTools(budget, leftLaunchers, deployForFit, getLabelWidthFn, islandIconWidth, 2, 0, islandIconWidth);
  const rightFit = fitTools(budget, rightLaunchers, deployForFit, getLabelWidthFn, islandIconWidth, 2, 0, islandIconWidth);

  const currentLevel = isShelfVisible ? 3 : (storedDeploy === 'auto' ? Math.max(leftFit.level, rightFit.level) : storedDeploy);
  const minLevel = hasLaunchers ? 1 : 0;

  const handleDeployUp = useCallback(() => {
    setStoredDeploy(Math.min(3, currentLevel + 1) as IslandDeploy);
    if (tempShelfOpen) setTempShelfOpen(false);
  }, [currentLevel, tempShelfOpen, setStoredDeploy]);

  const handleDeployDown = useCallback(() => {
    setStoredDeploy(Math.max(minLevel, currentLevel - 1) as IslandDeploy);
    if (tempShelfOpen) setTempShelfOpen(false);
  }, [minLevel, currentLevel, tempShelfOpen, setStoredDeploy]);

  useEffect(() => {
    if (isShelfVisible && storedDeploy !== 3 && !isInside && mode === 'rest') {
      const t = setTimeout(() => {
        setTempShelfOpen(false);
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [isShelfVisible, storedDeploy, isInside, mode]);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (current) {
      if (collapseTimer.current) { clearTimeout(collapseTimer.current); collapseTimer.current = null; }
      if (mode === 'rest') setMode(current.render && !current.message ? 'card' : 'peek');
    } else if ((mode === 'peek' || mode === 'card') && !collapseTimer.current) {
      collapseTimer.current = setTimeout(() => { collapseTimer.current = null; setMode('rest'); }, EXIT_COLLAPSE_DELAY_MS);
    }
  }, [current, mode, setMode]);

  useEffect(() => () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    resumeToastTimer();
  }, []);

  useEffect(() => {
    const TAB_KEYS: Record<string, IslandPane> = { Digit1: 'tools', Digit2: 'item', Digit3: 'chat', Digit4: 'notifications' };
    const onKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        const isInput = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || (document.activeElement as HTMLElement)?.isContentEditable;
        if (isInput && mode !== 'surface') return;

        e.preventDefault();
        if (mode === 'surface') {
          setMode('rest');
        } else {
          setMode('surface');
          setPane('tools');
        }
        return;
      }

      if (mode === 'surface' && e.altKey && !e.ctrlKey && !e.metaKey && TAB_KEYS[e.code]) {
        e.preventDefault();
        setPane(TAB_KEYS[e.code]);
        return;
      }

      if (e.key === 'Escape') {
        if (mode === 'rest') {
          if (tempShelfOpen) setTempShelfOpen(false);
        } else {
          setMode('rest');
          if (mode !== 'surface' && current) dismissNotification();
        }
      }
      
      if (e.altKey && !e.ctrlKey && !e.metaKey && mode === 'rest') {
        if (e.key === 'ArrowDown') {
          const isInput = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || (document.activeElement as HTMLElement)?.isContentEditable;
          if (!isInput) {
            e.preventDefault();
            handleDeployUp();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          handleDeployDown();
        }
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (mode === 'rest' || mode === 'peek') return;
      if (islandRef.current && !islandRef.current.contains(e.target as Node)) {
        setMode(mode === 'card' && current ? 'peek' : 'rest');
        if (tempShelfOpen) setTempShelfOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [mode, current, setMode, setPane, tempShelfOpen, handleDeployUp, handleDeployDown]);

  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (mode === 'surface' && prevModeRef.current !== 'surface') {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setFilterText('');
      // focus the filter in Tools, the selected tab otherwise, next frame
      requestAnimationFrame(() => {
        if (pane === 'tools') filterInputRef.current?.focus();
        else document.getElementById(`isl-tab-${pane}`)?.focus();
      });
    } else if (mode === 'rest' && prevModeRef.current === 'surface') {
      const ae = document.activeElement;
      if (!ae || ae === document.body || islandRef.current?.contains(ae)) {
        if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
          previousFocusRef.current.focus();
        } else {
          faceBtnRef.current?.focus();
        }
      }
    }
    prevModeRef.current = mode;
  }, [mode, pane]);

  let faceExpr: any = current ? expressionForKind(current.kind) : phase;
  if (!current) {
    if (phase === 'idle') faceExpr = isIdle ? 'sleepy' : 'calm';
    else if (phase === 'acting') faceExpr = 'alert';
  }

  const handleFaceClick = () => {
    if (mode === 'rest') setMode('surface');
  };

  const handleToastClick = () => {
    if (mode === 'peek') setMode('card');
    else if (mode === 'card') setMode('peek');
  };

  const handleDragEnd = (_e: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
    if ((info.offset.y <= SWIPE_DISTANCE && info.velocity.y <= 0) || info.velocity.y <= SWIPE_VELOCITY) {
      dismissNotification();
    }
  };

  const runTool = (tool: ToolDescriptor) => {
    if (tool.kind === 'widget') {
      setMode('surface');
      setPane('tools');
      setTimeout(() => {
        const tile = document.getElementById(`tile-${tool.id}`);
        if (tile) {
          tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusable = tile.querySelector('button, input, select, textarea, [tabindex]') as HTMLElement;
          if (focusable) focusable.focus();
        }
      }, 150);
      return;
    }
    try {
      tool.run?.();
      // a toggle opens a bar under the island: close the surface so the bar is visible (the surface would cover it)
      if (tool.kind === 'toggle' && mode === 'surface') setMode('rest');
    } catch (err: any) {
      toast.error(err?.message || tr('Failed to execute tool'));
    }
  };

  const sheet = useSheetDrag(() => setMode('rest'));

  let radius = '24px';
  if (mode === 'rest') radius = docked ? (isShelfVisible ? '20px' : '999px') : '50%';
  else if (mode === 'peek') radius = '28px';
  else if (isSheet) radius = '24px 24px 0 0';

  const swipeProps = (mode === 'peek' && !isReduced) ? {
    drag: 'y' as const,
    dragConstraints: { top: -24, bottom: 0 },
    dragElastic: 0.2,
    onDragEnd: handleDragEnd,
  } : {};

  const ariaProps: React.AriaAttributes & { role?: string } = mode === 'surface'
    ? { role: 'dialog', 'aria-modal': false, 'aria-labelledby': 'isl-title' }
    : { role: 'group', 'aria-label': tr('Onyx assistant and notifications') };

  // Size ladder (design doc 3): rest 56, peek 384 x 56, card 440, panel 520/640/760, phone sheet at the bottom
  const panelHeight = 'min(640px, calc(100vh - 96px))';
  let rootStyle: React.CSSProperties = {};
  if (mode === 'rest') {
    rootStyle = docked ? { width: 'fit-content', maxWidth: 'calc(100vw - 24px)', minHeight: 68, height: 'auto' } : { width: 68, height: 68 };
  } else if (mode === 'peek') {
    rootStyle = { width: 'min(440px, calc(100vw - 24px))', height: 68 };
  } else if (mode === 'card') {
    rootStyle = { width: 'min(500px, calc(100vw - 24px))', maxHeight: 320 };
  } else if (isSheet) {
    rootStyle = { position: 'fixed', width: '100vw', top: 'auto', bottom: 0, left: 0, right: 0, maxWidth: '100vw', ...(pane === 'tools' || pane === 'item' ? { maxHeight: '88vh' } : { height: '88vh' }) };
  } else {
    const w = xl ? 860 : lg ? 720 : 580;
    rootStyle = { width: `min(${w}px, calc(100vw - 24px))`, ...(pane === 'tools' || pane === 'item' ? { maxHeight: 'min(680px, calc(100vh - 96px))' } : { height: panelHeight }) };
  }

  // Accessibility announcement for the panel
  useEffect(() => {
    if (mode === 'surface') {
      const el = document.getElementById('onyx-island-announcer');
      if (el) el.textContent = tr('Onyx command surface expanded');
    }
  }, [mode]);

  const name = displayNameOf(user);

  // One welcome per browser session (design interview 2026-10-09): the island peeks "Good evening, Ramses" for 3 s and
  // keeps no trace in the inbox.
  const hasUser = !!user;
  useEffect(() => {
    if (!hasUser) return;
    try {
      if (sessionStorage.getItem('onyxWelcomed')) return;
      sessionStorage.setItem('onyxWelcomed', '1');
    } catch { return; }
    pushNotification({ kind: 'info', message: `${greeting()}, ${displayNameOf(user)}`, duration: 3000, ephemeral: true, source: 'system' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUser]);
  const viewLabel = tr(VIEW_LABELS[activeView] || 'Home');
  const meta = user?.role ? `${tr(user.role)} · ${viewLabel}` : viewLabel;
  const figures = readout && (readout.left || readout.right) ? <>{readout.left}{readout.right}</> : null;

  const faceNode = (size: number) => (
    <m.div layoutId="onyx-island-face">
      <OnyxFace expression={faceExpr} bare size={size} tone="mono" />
    </m.div>
  );

  const handlePointerEnter = useCallback(() => {
    setIsInside(true);
    pauseToastTimer();
    if (mode === 'rest' && storedDeploy !== 3 && !tempShelfOpen) {
      setDwellTimer(setTimeout(() => setTempShelfOpen(true), 600));
    }
  }, [mode, storedDeploy, tempShelfOpen]);

  const handlePointerLeave = useCallback(() => {
    setIsInside(false);
    resumeToastTimer();
    if (dwellTimer) { clearTimeout(dwellTimer); setDwellTimer(null); }
  }, [dwellTimer]);

  const handleFocusCapture = useCallback(() => {
    setIsInside(true);
    pauseToastTimer();
    if (mode === 'rest' && storedDeploy !== 3 && !tempShelfOpen) {
      setTempShelfOpen(true);
    }
  }, [mode, storedDeploy, tempShelfOpen]);

  const handleBlurCapture = useCallback((e: React.FocusEvent) => {
    if (!islandRef.current?.contains(e.relatedTarget as Node)) {
      setIsInside(false);
      resumeToastTimer();
    }
  }, []);

  return (
    <LazyMotion features={domMax} strict>
      <div id="onyx-island-announcer" aria-live="polite" className="onyx-sr-only" />
      <IslandRefractionDefs />
      <m.div
        ref={islandRef}
        layout
        className={`onyx-island ui-root onyx-island--${mode}${docked ? ' onyx-island--docked' : ''}${isSheet ? ' isl-is-sheet' : ''}`}
        style={rootStyle}
        transition={transition}
        {...ariaProps}
        {...swipeProps}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
      >
        <div
          ref={surfaceRef}
          className="onyx-island-surface w-full h-full flex flex-col"
          style={{
            '--island-r': radius,
            maxHeight: (mode === 'surface' || mode === 'card') ? rootStyle.maxHeight : undefined,
            transform: sheet.dy ? `translateY(${sheet.dy}px)` : undefined,
            transition: sheet.dragging || isReduced ? 'none' : 'transform 0.25s ease',
          } as React.CSSProperties}
        >
          {mode === 'rest' && (
            <div className={docked || isShelfVisible ? 'flex flex-col' : 'w-full h-full'}>
              <div className={docked ? 'onyx-island-dock' : 'w-full h-full'}>
                {docked && (
                  <div className="onyx-island-dock-side onyx-island-dock-side--left">
                    <IslandLaunchers
                      tools={leftFit.visible}
                      onRun={runTool}
                      showLabels={leftFit.showLabels}
                      overflow={leftFit.overflow.length > 0}
                      onMore={() => { setMode('surface'); setPane('tools'); }}
                      reverse
                    />
                    {leftLaunchers.length > 0 && <span className="isl-sep" aria-hidden="true" />}
                  </div>
                )}
                <button
                  ref={faceBtnRef}
                  type="button"
                  className={`relative flex items-center justify-center cursor-pointer focus:outline-none rounded-full ${docked ? 'isl-dock-face' : 'w-full h-full isl-dock-face'}`}
                  style={docked ? undefined : { width: '100%', height: '100%' }}
                  aria-label={tr('Open Onyx panel: tools, selected item, Chan and inbox')}
                  aria-expanded="false"
                  onClick={handleFaceClick}
                >
                  {faceNode(faceSize)}
                  {unread > 0 && <span className="onyx-island-unread" aria-hidden="true" />}
                </button>
                {docked && (
                  <div className="onyx-island-dock-side onyx-island-dock-side--right">
                    {rightLaunchers.length > 0 && <span className="isl-sep" aria-hidden="true" />}
                    <IslandLaunchers
                      tools={rightFit.visible}
                      onRun={runTool}
                      showLabels={rightFit.showLabels}
                      overflow={rightFit.overflow.length > 0}
                      onMore={() => { setMode('surface'); setPane('tools'); }}
                    />
                    {hasLaunchers && (
                      <button
                        type="button"
                        className="isl-dock-deploy"
                        aria-label={isShelfVisible ? tr('Show fewer tools') : tr('Show more tools')}
                        onClick={(e) => { e.stopPropagation(); if (isShelfVisible) { setStoredDeploy('auto'); setTempShelfOpen(false); } else handleDeployUp(); }}
                      >
                        {isShelfVisible ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {isShelfVisible && (
                <IslandShelf
                  greeting={greeting()}
                  name={name}
                  meta={meta}
                  figures={figures}
                  onAsk={(t) => { if (t) setChanDraft(t); setPane('chat'); setMode('surface'); }}
                />
              )}
            </div>
          )}

          {(mode === 'peek' || mode === 'card') && (
            <div className="flex items-start w-full h-full p-2 cursor-pointer" onClick={handleToastClick}>
              <div className="shrink-0 flex items-center justify-center h-12 w-14">
                {faceNode(faceSize)}
              </div>
              <AnimatePresence>
                {current && (
                  <m.div
                    key={current.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: isReduced ? 0 : ENTER_REVEAL_DELAY_MS / 1000, ...transitionSlow } }}
                    exit={{ opacity: 0, transition: { duration: isReduced ? 0 : EXIT_COLLAPSE_DELAY_MS / 1000 } }}
                    className="flex-1 min-w-0"
                  >
                    <IslandToastContent
                      notification={current}
                      expanded={mode === 'card'}
                      onToggleExpand={handleToastClick}
                      onDismiss={() => dismissNotification()}
                    />
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {mode === 'surface' && (
            <div className="isl-panel">
              {isSheet && <div className="isl-grabber" aria-hidden="true" {...sheet.handlers} />}
              <IslandHeader
                id="isl-title"
                face={faceNode(faceSize)}
                name={name}
                meta={meta}
                figures={figures}
                onClose={() => setMode('rest')}
              />
              <IslandTabs value={pane} onChange={setPane} unread={unread} itemSelected={!!selectedItem} />

              <div className="isl-body" id="isl-panel" role="tabpanel" aria-labelledby={`isl-tab-${pane}`}>
                <ChunkBoundary>
                  <Suspense fallback={<div className="h-20" />}>
                    {pane === 'tools' && (
                      <>
                        <div className="isl-search">
                          <Search size={18} color="currentColor" strokeWidth={2} aria-hidden="true" />
                          <input
                            ref={filterInputRef}
                            type="text"
                            aria-label={tr('Search tools')}
                            placeholder={tr('Search tools...')}
                            value={filterText}
                            onChange={e => setFilterText(e.target.value)}
                          />
                        </div>
                        <div className="isl-scroll custom-scrollbar">
                          <IslandToolsGrid
                            tools={commandsEnabled ? allTools : []}
                            filter={filterText}
                            onRun={runTool}
                          />
                        </div>
                      </>
                    )}
                    {pane === 'item' && <div className="isl-scroll custom-scrollbar"><ItemPaneConnected /></div>}
                    {pane === 'notifications' && <InboxPane onClose={() => setMode('rest')} />}
                    {pane === 'chat' && <ChanPane view={activeView} onClose={() => setMode('rest')} />}
                  </Suspense>
                </ChunkBoundary>
              </div>
            </div>
          )}
        </div>
      </m.div>
    </LazyMotion>
  );
};
