import * as React from 'react';
import { pushNotification, dismissNotification } from './store';
import { NotifyInput, NotifyKind, NotifyAction, RenderContext } from './types';

type ToastMessage = string | ((t: { id: string; visible: boolean }) => React.ReactNode);

export interface ToastOptions {
  id?: string;
  duration?: number;
  icon?: React.ReactNode;
  position?: string;
  style?: unknown;
  className?: string;
  ariaProps?: unknown;
}

function createToast(kind: NotifyKind, message: ToastMessage, opts?: ToastOptions): string {
  const input: NotifyInput = { kind };
  if (opts?.id) input.id = opts.id;
  if (opts?.duration !== undefined) input.duration = opts.duration;

  if (typeof message === 'function') {
    input.render = (ctx: RenderContext) => {
      try {
        return message({ id: ctx.id, visible: true });
      } catch {
        return null;   // a throwing renderer must never break the island
      }
    };
    input.message = '';
  } else {
    input.render = undefined;   // explicit: updating a custom toast with a plain string must drop the old renderer
    input.message = message;
  }

  return pushNotification(input);
}

const toast = Object.assign(
  (message: ToastMessage, opts?: ToastOptions) => createToast('info', message, opts),
  {
    success: (message: ToastMessage, opts?: ToastOptions) => createToast('success', message, opts),
    error: (message: ToastMessage, opts?: ToastOptions) => createToast('error', message, opts),
    loading: (message: ToastMessage, opts?: ToastOptions) => createToast('loading', message, opts),
    dismiss: (id?: string) => dismissNotification(id),
  }
);

export { toast };   // react-hot-toast also had a named export
export default toast;

export function notifyAgent(message: string, opts?: { title?: string; actions?: NotifyAction[] }) {
  return pushNotification({
    kind: 'agent',
    source: 'agent',
    message,
    title: opts?.title,
    actions: opts?.actions,
  });
}

export function notifyDevice(message: string, opts?: ToastOptions) {
  return pushNotification({
    kind: 'info',
    source: 'device',
    message,
    id: opts?.id,
    duration: opts?.duration,
  });
}
