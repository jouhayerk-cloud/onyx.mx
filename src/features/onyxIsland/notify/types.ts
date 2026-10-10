import * as React from 'react';

export type NotifyKind = 'success' | 'error' | 'loading' | 'info' | 'warning' | 'agent';
export type NotifySource = 'app' | 'agent' | 'device' | 'system';

export interface NotifyAction {
  label: string;
  onClick: () => void;
}

export interface RenderContext {
  id: string;
  dismiss: () => void;
}

export interface NotifyInput {
  id?: string;
  kind?: NotifyKind;
  title?: string;
  message?: string;
  render?: (ctx: RenderContext) => React.ReactNode;
  actions?: NotifyAction[];
  duration?: number | null;
  source?: NotifySource;
  silent?: boolean;
  /** Shown as a toast but never written to the history (the one-time welcome). */
  ephemeral?: boolean;
}

export interface IslandNotification {
  id: string;
  kind: NotifyKind;
  title?: string;
  message: string;
  render?: (ctx: RenderContext) => React.ReactNode;
  actions?: NotifyAction[];
  duration: number | null;
  source: NotifySource;
  createdAt: number;
  updatedAt: number;
  read: boolean;
  count: number;
}
