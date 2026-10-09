import React, { lazy, Suspense, useEffect, useRef, useState, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { m, LazyMotion, domMax, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, X, ChevronLeft } from 'lucide-react';
import { OnyxFace } from '../onyxAgent/face/OnyxFace';
import { useGaze } from '../onyxAgent/face/useGaze';
import { onyxAgentPhaseAtom } from '../onyxAgent/agentState';
import { useIslandNotifications, dismissNotification, pauseToastTimer, resumeToastTimer } from './notify/store';
import { IslandToastContent } from './IslandToastContent';
import { tr } from '../../lib/i18n';
import { islandModeAtom, islandPaneAtom, expressionForKind, type IslandReadout } from './islandState';
import { SPRING, SPRING_SLOW, ENTER_REVEAL_DELAY_MS, EXIT_COLLAPSE_DELAY_MS, SWIPE_DISTANCE, SWIPE_VELOCITY } from './motion/tokens';
import { allToolsAtom, pinnedToolsAtom, isToolPinned, islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import type { ToolDescriptor } from '../../lib/toolRegistry';
import { IslandLaunchers } from './IslandLaunchers';
import { IslandToolsGrid } from './IslandToolsGrid';
import toast from './notify/toast';

const NotificationCenter = lazy(() => import('./NotificationCenter').then(m => ({ default: m.NotificationCenter })));

class ChunkBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div className="p-4 text-[13px] text-white/60">{tr('Could not load the module. Check your connection and try again.')}</div>
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

export const OnyxIsland: React.FC<{ readout?: IslandReadout | null }> = ({ readout = null }) => {
  const [mode, setMode] = useAtom(islandModeAtom);
  const [pane, setPane] = useAtom(islandPaneAtom);
  const { current, unread } = useIslandNotifications();
  const phase = useAtomValue(onyxAgentPhaseAtom);
  const allTools = useAtomValue(allToolsAtom);
  const pinnedOverrides = useAtomValue(pinnedToolsAtom);
  const commandsEnabled = useAtomValue(islandCommandsEnabledAtom);
  
  const isReduced = useReducedMotion();
  const [isHovered, setIsHovered] = React.useState(false);
  const transition = isReduced ? { duration: 0 } : SPRING;
  const transitionSlow = isReduced ? { duration: 0 } : SPRING_SLOW;

  const islandRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const faceBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [filterText, setFilterText] = useState('');

  useGaze(islandRef);
  const isIdle = useIdleTimer(10 * 60 * 1000);

  const xl = useMediaQuery('(min-width: 1280px)');
  const lg = useMediaQuery('(min-width: 1024px)');
  const md = useMediaQuery('(min-width: 768px)');
  const maxLaunchers = xl ? 6 : lg ? 4 : 4;
  
  const pinnedTools = useMemo(() => {
    if (!commandsEnabled) return [];
    return allTools.filter(t => isToolPinned(t, pinnedOverrides)).slice(0, maxLaunchers);
  }, [allTools, pinnedOverrides, maxLaunchers, commandsEnabled]);

  const leftLaunchers = pinnedTools.slice(0, Math.ceil(pinnedTools.length / 2));
  const rightLaunchers = pinnedTools.slice(Math.ceil(pinnedTools.length / 2));

  const hasLaunchers = leftLaunchers.length > 0 || rightLaunchers.length > 0;
  const docked = hasLaunchers && mode === 'rest';

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

      if (e.key === 'Escape' && mode !== 'rest') {
        if (mode === 'surface' && pane !== 'tools') {
          setPane('tools');
          return;
        }
        setMode('rest');
        if (mode !== 'surface' && current) dismissNotification();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (mode === 'rest' || mode === 'peek') return;
      if (islandRef.current && !islandRef.current.contains(e.target as Node)) {
        setMode(mode === 'card' && current ? 'peek' : 'rest');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [mode, current, setMode, pane, setPane]);

  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (mode === 'surface' && prevModeRef.current !== 'surface') {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setFilterText('');
      // focus input next frame
      requestAnimationFrame(() => filterInputRef.current?.focus());
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
  }, [mode]);

  let faceExpr: any = current ? expressionForKind(current.kind) : phase;
  if (!current) {
    if (phase === 'idle') faceExpr = isIdle ? 'sleepy' : 'calm';
    else if (phase === 'acting') faceExpr = 'alert';
  }

  const handleFaceClick = () => {
    if (mode === 'rest') {
      setMode('surface');
      setPane('tools');
    }
  };

  const handleToastClick = () => {
    if (mode === 'peek') setMode('card');
    else if (mode === 'card') setMode('peek');
  };

  const handleDragEnd = (e: any, info: any) => {
    if (mode === 'surface' && !md) {
      if (info.offset.y >= SWIPE_DISTANCE && info.velocity.y >= 0) {
        setMode('rest');
      }
      return;
    }
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

  const size = mode === 'surface' && pane === 'tools' ? 72 : mode === 'rest' ? (hasLaunchers ? 64 : 56) : 44;
  
  let radius = '28px';
  if (mode === 'rest' && !docked) radius = '50%';
  else if (mode === 'surface' && !md) radius = '28px 28px 0 0';

  const [goo, setGoo] = useState(false);
  const prevModeForGoo = useRef(mode);
  useEffect(() => {
    if (isReduced) return;
    if ((prevModeForGoo.current === 'rest' && mode === 'peek') || (prevModeForGoo.current === 'peek' && mode === 'rest')) {
      setGoo(true);
      const t = setTimeout(() => setGoo(false), 400);
      return () => clearTimeout(t);
    }
    prevModeForGoo.current = mode;
  }, [mode, isReduced]);

  const swipeProps = (mode === 'peek' && !isReduced) ? {
    drag: 'y' as const,
    dragConstraints: { top: -24, bottom: 0 },
    dragElastic: 0.2,
    onDragEnd: handleDragEnd
  
  } : {};

  const ariaProps: React.AriaAttributes & { role?: string } = mode === 'surface' 
    ? { role: 'dialog', 'aria-modal': false, 'aria-label': tr('Onyx command surface expanded') }
    : { role: 'group', 'aria-label': tr('Onyx assistant and notifications') };

  let rootStyle: React.CSSProperties = {};
  if (mode === 'rest') {
    rootStyle = docked ? { width: 'fit-content', maxWidth: 'calc(100vw - 24px)', minHeight: 64, height: 'auto' } : { width: 56, height: 56 };
  } else if (mode === 'peek') {
    rootStyle = { width: 'min(380px, calc(100vw - 24px))', height: 64 };
  } else if (mode === 'card') {
    rootStyle = { width: 'min(440px, calc(100vw - 24px))', maxHeight: 280 };
  } else if (mode === 'surface') {
    if (!md) {
      // Bottom sheet
      rootStyle = { position: 'fixed', width: '100vw', top: 'auto', bottom: 0, left: 0, right: 0, maxHeight: '80vh', ...(pane !== 'tools' ? { height: '70vh' } : {}) };
    } else {
      const w = xl ? 720 : lg ? 600 : 480;
      rootStyle = { width: `min(${w}px, calc(100vw - 24px))`, maxHeight: 'min(560px, calc(100vh - 96px))', ...(pane !== 'tools' ? { height: 'min(560px, calc(100vh - 96px))' } : {}) };
    }
  }

  // Accessibility announcement for surface
  useEffect(() => {
    if (mode === 'surface') {
      const el = document.getElementById('onyx-island-announcer');
      if (el) el.textContent = tr('Onyx command surface expanded');
    }
  }, [mode]);

  return (
    <LazyMotion features={domMax} strict>
      <div id="onyx-island-announcer" aria-live="polite" className="onyx-sr-only" />
      <m.div
        ref={islandRef}
        layout
        className={`onyx-island ui-root onyx-island--${mode}${docked ? ' onyx-island--docked' : ''}`}
        style={rootStyle}
        transition={transition}
        {...ariaProps}
        {...swipeProps}
        onPointerEnter={() => { setIsHovered(true); pauseToastTimer(); }}
        onPointerLeave={() => { setIsHovered(false); resumeToastTimer(); }}
        onFocus={pauseToastTimer}
        onBlur={resumeToastTimer}
      >
        {goo && !isReduced && (
          <div className="absolute inset-0 z-[-1] pointer-events-none">
            <svg width="0" height="0">
              <filter id="onyx-island-goo">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
                <feComposite in="SourceGraphic" in2="goo" operator="atop" />
              </filter>
            </svg>
            <div style={{ filter: 'url(#onyx-island-goo)', position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '100%', background: 'var(--main-color, #00aeef)', borderRadius: '32px' }} />
          </div>
        )}

        <div className="onyx-island-surface w-full h-full flex flex-col" style={{ '--island-r': radius, maxHeight: (mode === 'surface' || mode === 'card') ? rootStyle.maxHeight : undefined } as React.CSSProperties}>
          {mode === 'rest' && (
            <div className={docked ? 'onyx-island-dock' : 'w-full h-full'}>
              {docked && (
                <div className="onyx-island-dock-side onyx-island-dock-side--left">
                  <IslandLaunchers tools={leftLaunchers} onRun={runTool} showLabels={mode === 'rest' && isHovered} />
                </div>
              )}
              <button
                ref={faceBtnRef}
                type="button"
                className={`relative flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-full ${docked ? 'w-14 h-14 shrink-0' : 'w-full h-full'}`}
                aria-label={tr('Open notifications and assistant')}
                aria-expanded="false"
                onClick={handleFaceClick}
              >
                <m.div layoutId="onyx-island-face">
                  <OnyxFace expression={faceExpr} bare size={size} tone="mono" />
                </m.div>
                {unread > 0 && <span className="onyx-island-unread" />}
              </button>
              {docked && (
                <div className="onyx-island-dock-side onyx-island-dock-side--right">
                  <IslandLaunchers tools={rightLaunchers} onRun={runTool} showLabels={mode === 'rest' && isHovered} />
                </div>
              )}
            </div>
          )}

          {(mode === 'peek' || mode === 'card') && (
            <div className="flex items-start w-full h-full p-2 cursor-pointer" onClick={handleToastClick}>
              <m.div layoutId="onyx-island-face" className="shrink-0 flex items-center justify-center h-12 w-12">
                <OnyxFace expression={faceExpr} bare size={size} tone="mono" />
              </m.div>
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
            <div className="flex flex-col w-full h-full">
              {/* Surface Header */}
              {pane === 'tools' ? (
                <div className="flex flex-col p-2 shrink-0 border-b border-white/10">
                  <div className="flex justify-between items-center w-full min-h-[72px]">
                    <div className="flex-1 flex justify-start min-w-0 items-center">
                        {readout?.left}
                        <div className="hidden md:flex">
                          <IslandLaunchers tools={leftLaunchers} onRun={runTool} />
                        </div>
                      </div>
                    <div className="shrink-0 flex items-center justify-center mx-2">
                      <m.div layoutId="onyx-island-face">
                        <OnyxFace expression={faceExpr} bare size={size} tone="mono" />
                      </m.div>
                    </div>
                    <div className="flex-1 flex justify-end min-w-0 items-center">
                        <div className="hidden md:flex">
                          <IslandLaunchers tools={rightLaunchers} onRun={runTool} />
                        </div>
                        {readout?.right}
                      <button
                        type="button"
                        aria-label={tr('Close')}
                        className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full isl-hw10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 text-white/70 hover:text-white ml-2"
                        onClick={() => setMode('rest')}
                      >
                        <X size={22} color="currentColor" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center relative w-full mt-2 mb-1 px-1">
                    <Search size={18} color="currentColor" strokeWidth={2} className="absolute left-4 text-white/40 pointer-events-none" />
                    <input
                      ref={filterInputRef}
                      type="text"
                      placeholder={tr('Search tools...')}
                      value={filterText}
                      onChange={e => setFilterText(e.target.value)}
                      className="w-full isl-b20 text-[14px] text-white placeholder-white/40 rounded-full py-2.5 pl-10 pr-4 outline-none border border-white/10 focus:border-white/20 transition-colors"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 shrink-0 border-b border-white/10 bg-white/5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setPane('tools')}
                    aria-label={tr('Back')}
                    className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 text-white"
                  >
                    <ChevronLeft size={20} color="currentColor" strokeWidth={2} />
                  </button>
                  
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-black/20 overflow-hidden shrink-0">
                      <m.div layoutId="onyx-island-face">
                        <OnyxFace expression={faceExpr} bare size={32} tone="mono" />
                      </m.div>
                    </div>
                    <div className="flex-1 truncate text-[16px] font-semibold tracking-wide">
                      {pane === 'chat' ? tr('Onyx Assistant') : tr('Notifications')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={tr('Close')}
                      className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 text-white"
                      onClick={() => setMode('rest')}
                    >
                      <X size={20} color="currentColor" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              )}

              {/* Surface Body */}
              <div className="flex-1 min-h-0 flex flex-col">
                <ChunkBoundary>
                  <Suspense fallback={<div className="h-20" />}>
                    {pane === 'tools' && (
                      <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <IslandToolsGrid 
                          tools={commandsEnabled ? allTools : []} 
                          filter={filterText} 
                          onRun={runTool} 
                          onOpenPane={setPane}
                        />
                      </div>
                    )}
                    {pane === 'notifications' && <NotificationCenter tab="notifications" hideTabs onClose={() => setMode('rest')} />}
                    {pane === 'chat' && <NotificationCenter tab="assistant" hideTabs onClose={() => setMode('rest')} />}
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












