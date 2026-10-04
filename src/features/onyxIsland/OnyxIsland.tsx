import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { m, LazyMotion, domMax, AnimatePresence, useReducedMotion } from 'framer-motion';
import { OnyxFace } from '../onyxAgent/face/OnyxFace';
import { useGaze } from '../onyxAgent/face/useGaze';
import { onyxAgentPhaseAtom } from '../onyxAgent/agentState';
import { useIslandNotifications, dismissNotification, pauseToastTimer, resumeToastTimer } from './notify/store';
import { IslandToastContent } from './IslandToastContent';
import { tr } from '../../lib/i18n';
import { islandModeAtom, expressionForKind } from './islandState';
import { SPRING, SPRING_SLOW, ENTER_REVEAL_DELAY_MS, EXIT_COLLAPSE_DELAY_MS, SWIPE_DISTANCE, SWIPE_VELOCITY } from './motion/tokens';

const NotificationCenter = lazy(() => import('./NotificationCenter').then(m => ({ default: m.NotificationCenter })));

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

export const OnyxIsland: React.FC = () => {
  const [mode, setMode] = useAtom(islandModeAtom);
  const { current, unread } = useIslandNotifications();
  const phase = useAtomValue(onyxAgentPhaseAtom);
  
  const isReduced = useReducedMotion();
  const transition = isReduced ? { duration: 0 } : SPRING;
  const transitionSlow = isReduced ? { duration: 0 } : SPRING_SLOW;

  const islandRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const faceBtnRef = useRef<HTMLButtonElement>(null);

  useGaze(islandRef);
  const isIdle = useIdleTimer(10 * 60 * 1000);

  const prevCurrentRef = useRef(current);
  useEffect(() => {
    const prevCurrent = prevCurrentRef.current;
    if (!prevCurrent && current && mode === 'rest') {
      setMode('peek');
    } else if (prevCurrent && !current && (mode === 'peek' || mode === 'expanded')) {
      const t = setTimeout(() => {
        setMode('rest');
      }, EXIT_COLLAPSE_DELAY_MS);
      return () => clearTimeout(t);
    }
    prevCurrentRef.current = current;
  }, [current, mode, setMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode !== 'rest') {
        setMode('rest');
        if (current) dismissNotification();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (mode !== 'rest' && islandRef.current && !islandRef.current.contains(e.target as Node)) {
        setMode('rest');
        if (current) dismissNotification();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [mode, current, setMode]);

  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (mode === 'center' && prevModeRef.current !== 'center') {
      closeBtnRef.current?.focus();
    } else if (mode === 'rest' && prevModeRef.current === 'center') {
      faceBtnRef.current?.focus();
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
      setMode('center');
    }
  };

  const handleToastClick = () => {
    if (mode === 'peek') setMode('expanded');
    else if (mode === 'expanded') setMode('peek');
  };

  const handleDragEnd = (e: any, info: any) => {
    if (info.offset.y <= SWIPE_DISTANCE || info.velocity.y <= SWIPE_VELOCITY) {
      dismissNotification();
    }
  };

  const size = mode === 'rest' ? 56 : 44;
  
  let radius = '32px';
  if (mode === 'expanded' || mode === 'center') radius = '28px';
  else if (mode === 'rest') radius = '28px';

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

  const ariaProps: React.AriaAttributes & { role?: string } = mode === 'center' 
    ? { role: 'dialog', 'aria-modal': false, 'aria-label': tr('Notification center') }
    : { role: 'group', 'aria-label': tr('Onyx assistant and notifications') };

  let rootStyle: React.CSSProperties = {};
  if (mode === 'rest') {
    rootStyle = { width: 56, height: 56 };
  } else if (mode === 'peek') {
    rootStyle = { width: 'min(380px, calc(100vw - 24px))', height: 64 };
  } else if (mode === 'expanded') {
    rootStyle = { width: 'min(440px, calc(100vw - 24px))', maxHeight: 280 };
  } else if (mode === 'center') {
    rootStyle = { width: 'min(460px, calc(100vw - 24px))', height: 'min(560px, calc(100vh - 96px))' };
  }

  return (
    <LazyMotion features={domMax} strict>
      <m.div
        ref={islandRef}
        layout
        className={`onyx-island onyx-island--${mode}`}
        style={rootStyle}
        transition={transition}
        {...ariaProps}
        {...swipeProps}
        onPointerEnter={pauseToastTimer}
        onPointerLeave={resumeToastTimer}
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

        <div className="onyx-island-surface w-full h-full flex flex-col" style={{ '--island-r': radius } as React.CSSProperties}>
          {mode === 'rest' && (
            <button
              ref={faceBtnRef}
              type="button"
              className="relative w-full h-full flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-[var(--island-r)]"
              aria-label={tr('Open notifications and assistant')}
              aria-expanded="false"
              onClick={handleFaceClick}
            >
              <m.div layoutId="onyx-island-face">
                <OnyxFace expression={faceExpr} bare size={size} tone="mono" />
              </m.div>
              {unread > 0 && <span className="onyx-island-unread" />}
            </button>
          )}

          {(mode === 'peek' || mode === 'expanded') && (
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
                      expanded={mode === 'expanded'} 
                      onToggleExpand={handleToastClick}
                      onDismiss={() => dismissNotification()}
                    />
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {mode === 'center' && (
            <div className="flex flex-col w-full h-full">
              <div className="flex items-center justify-between p-2 shrink-0 border-b border-white/10">
                <m.div layoutId="onyx-island-face" className="shrink-0 flex items-center justify-center h-12 w-12">
                  <OnyxFace expression={faceExpr} bare size={size} tone="mono" />
                </m.div>
                <button
                  ref={closeBtnRef}
                  type="button"
                  aria-label={tr('Close')}
                  className="p-2 rounded-full hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  onClick={() => setMode('rest')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <Suspense fallback={<div />}>
                  <NotificationCenter onClose={() => setMode('rest')} />
                </Suspense>
              </div>
            </div>
          )}
        </div>
      </m.div>
    </LazyMotion>
  );
};
