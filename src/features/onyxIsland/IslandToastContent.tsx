import React, { useEffect } from 'react';
import {
  CheckCircle2, AlertCircle, AlertTriangle, Info, Sparkles, X
} from 'lucide-react';
import { tr, trf } from '../../lib/i18n';
import type { IslandNotification, NotifyKind } from './notify/types';
import './islandToast.css';

// A custom toast renderer is app code: if it throws while rendering, show nothing instead of taking the island (and the page) down.
class RenderBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

interface IslandToastContentProps {
  notification: IslandNotification;
  expanded: boolean;
  onToggleExpand: () => void;
  onDismiss: () => void;
}

let timerStyleInjected = false;
function useTimerStyle() {
  useEffect(() => {
    if (!timerStyleInjected && typeof document !== 'undefined') {
      timerStyleInjected = true;
      const style = document.createElement('style');
      style.textContent = `
        @keyframes onyx-toast-timer {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .onyx-toast-timer-bar { animation: none !important; transform: scaleX(0) !important; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);
}

const ICON_SIZE = 18;

function kindWord(kind: NotifyKind): string {
  switch (kind) {
    case 'success': return tr('Success');
    case 'error': return tr('Error');
    case 'warning': return tr('Warning');
    case 'agent': return tr('Assistant');
    case 'loading': return tr('Loading');
    default: return tr('Information');
  }
}

// Loading gets a static three-dot mark instead of a spinner (no animation)
function KindIcon({ kind }: { kind: NotifyKind }) {
  switch (kind) {
    case 'loading': return <span className="isl-toast__dots" aria-hidden="true"><span /><span /><span /></span>;
    case 'success': return <CheckCircle2 size={ICON_SIZE} aria-hidden="true" />;
    case 'error': return <AlertCircle size={ICON_SIZE} aria-hidden="true" />;
    case 'warning': return <AlertTriangle size={ICON_SIZE} aria-hidden="true" />;
    case 'agent': return <Sparkles size={ICON_SIZE} aria-hidden="true" />;
    default: return <Info size={ICON_SIZE} aria-hidden="true" />;
  }
}

function relativeTime(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return tr('Just now');
  if (min < 60) return trf('{n} min ago', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return trf('{n} h ago', { n: h });
  return trf('{n} d ago', { n: Math.floor(h / 24) });
}

export const IslandToastContent: React.FC<IslandToastContentProps> = ({
  notification,
  expanded,
  onToggleExpand,
  onDismiss
}) => {
  useTimerStyle();

  const { kind, title, message, count, duration, render, actions, id, updatedAt } = notification;
  const loading = kind === 'loading';
  const stripe = kind === 'error' || kind === 'warning';
  const visibleActions = (actions ?? []).slice(0, 2);

  // Peek: one line, the title or the message. Card: the title (the message moves to the body when there is a title).
  const peekText = title || message || (loading ? tr('Working') : '');
  const cardTitle = title || (loading ? tr('Working') : message);
  const cardBody = (title || loading) ? message : '';

  const handleActionClick = (e: React.MouseEvent, actionOnClick: () => void) => {
    e.stopPropagation();
    actionOnClick();
    onDismiss();
  };

  const iconClass = `isl-toast__icon isl-toast__icon--${kind}`;

  const countChip = count > 1 && (
    <span className="isl-chip isl-num">
      <span aria-hidden="true">&times;{count}</span>
      <span className="onyx-sr-only">{trf('Repeated {n} times', { n: count })}</span>
    </span>
  );

  const peekContent = (
    <div className="isl-toast__peek">
      <span className={iconClass}>
        <KindIcon kind={kind} />
        <span className="onyx-sr-only">{kindWord(kind)}: </span>
      </span>
      <span className="isl-toast__text">{peekText}</span>
      {countChip}
    </div>
  );

  const cardContent = (
    <div className={`isl-toast__card${stripe ? ` isl-toast__card--${kind}` : ''}`}>
      <div className="isl-toast__head">
        <span className={iconClass}>
          <KindIcon kind={kind} />
          <span className="onyx-sr-only">{kindWord(kind)}: </span>
        </span>
        <div className="isl-toast__headtext">
          {stripe && <span className="isl-caption" aria-hidden="true">{kindWord(kind)}</span>}
          <div className="isl-title isl-toast__title">{cardTitle}</div>
          {cardBody && <div className="isl-toast__body">{cardBody}</div>}
        </div>
        {countChip}
        <button
          type="button"
          className="isl-icon-btn isl-toast__dismiss"
          onClick={e => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label={tr('Dismiss')}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {render && (
        <div className="isl-toast__custom" onClick={e => e.stopPropagation()}>
          <RenderBoundary>{render({ id, dismiss: onDismiss })}</RenderBoundary>
        </div>
      )}
      <div className="isl-toast__foot">
        {visibleActions.map((act, i) => (
          <button
            key={i}
            type="button"
            className={`isl-btn${visibleActions.length === 1 ? ' isl-btn--primary' : ''}`}
            onClick={e => handleActionClick(e, act.onClick)}
          >
            {act.label}
          </button>
        ))}
        <span className="isl-caption isl-toast__time">{relativeTime(updatedAt)}</span>
      </div>
    </div>
  );

  const timer = typeof duration === 'number' && duration > 0 && (
    <div className="isl-toast__timer" aria-hidden="true">
      <div
        className="isl-toast__timer-bar onyx-toast-timer-bar"
        style={{
          animationName: 'onyx-toast-timer',
          animationDuration: `${duration}ms`,
          animationTimingFunction: 'linear',
          animationFillMode: 'forwards'
        }}
      />
    </div>
  );

  return (
    <div className="isl-toast" onClick={onToggleExpand}>
      {expanded ? cardContent : peekContent}
      {timer}
    </div>
  );
};
