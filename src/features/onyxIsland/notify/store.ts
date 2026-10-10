import { useSyncExternalStore } from 'react';
import { NotifyInput, IslandNotification, NotifyKind } from './types';

// Store state
let currentToast: IslandNotification | null = null;
let queuedToast: IslandNotification | null = null;
let history: IslandNotification[] = [];

let listeners: Set<() => void> = new Set();
let timerId: ReturnType<typeof setTimeout> | null = null;
let currentToastStartedAt: number | null = null;
let currentToastRemainingDuration: number | null = null;

let lastPersistTime = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const STORAGE_KEY = 'onyxNotificationHistory';

const DEFAULT_DURATIONS: Record<NotifyKind, number | null> = {
  success: 3600,
  info: 3600,
  agent: 4500,
  warning: 5000,
  error: 6000,
  loading: null,
};

type StoreSnapshot = {
  current: IslandNotification | null;
  queued: number;
  history: IslandNotification[];
  unread: number;
};

let currentSnapshot: StoreSnapshot = {
  current: null,
  queued: 0,
  history: [],
  unread: 0,
};

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function notifyListeners() {
  listeners.forEach((l) => l());
}

function updateSnapshot() {
  const unreadCount = history.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);
  currentSnapshot = {
    current: currentToast,
    queued: queuedToast ? 1 : 0,
    history: history,
    unread: unreadCount,
  };
  notifyListeners();
}

function loadHistory() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return;
    const parsed = JSON.parse(data) as any[];
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    history = parsed
      .filter((item) => {
        if (item.kind === 'loading') return false;
        if (now - item.createdAt > sevenDays) return false;
        return true;
      })
      .map((item) => ({
        ...item,
        render: undefined,
        actions: undefined,
      })) as IslandNotification[];
  } catch (e) {
    console.error('Failed to load notification history', e);
  }
}

function schedulePersist() {
  if (persistTimer) return;
  const now = Date.now();
  const delay = Math.max(0, 500 - (now - lastPersistTime));

  persistTimer = setTimeout(() => {
    persistTimer = null;
    lastPersistTime = Date.now();
    try {
      const toSave = history.map(({ render, actions, ...rest }) => ({ ...rest, message: rest.message.slice(0, 500) }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {}
  }, delay);
}

let paused = false;   // true while the pointer or focus is on the island: a (re)started toast must not run its timer

function advanceQueue() {
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
  if (queuedToast) {
    currentToast = queuedToast;
    queuedToast = null;
    startToastTimer(currentToast);
  } else {
    currentToast = null;
    paused = false;
  }
  updateSnapshot();
}

function startToastTimer(toast: IslandNotification) {
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
  currentToastStartedAt = Date.now();
  currentToastRemainingDuration = toast.duration;

  if (toast.duration !== null && !paused) {
    timerId = setTimeout(() => {
      advanceQueue();
    }, toast.duration);
  }
}

/** Pauses the current toast timer and keeps the time it has left. */
export function pauseToastTimer() {
  paused = true;
  if (timerId && currentToastRemainingDuration !== null && currentToastStartedAt !== null) {
    clearTimeout(timerId);
    timerId = null;
    const elapsed = Date.now() - currentToastStartedAt;
    currentToastRemainingDuration = Math.max(0, currentToastRemainingDuration - elapsed);
  }
}

export function resumeToastTimer() {
  paused = false;
  if (!timerId && currentToastRemainingDuration !== null && currentToast) {
    currentToastStartedAt = Date.now();
    timerId = setTimeout(() => {
      advanceQueue();
    }, currentToastRemainingDuration);
  }
}

export function pushNotification(input: NotifyInput): string {
  const now = Date.now();
  const kind = input.kind || 'info';
  const duration = input.duration !== undefined ? input.duration : DEFAULT_DURATIONS[kind];
  const source = input.source || 'app';
  const message = input.message || '';

  if (input.id) {
    const existingIdx = history.findIndex((n) => n.id === input.id);
    if (existingIdx !== -1) {
      const existing = history[existingIdx];
      const updated: IslandNotification = {
        ...existing,
        kind,
        message,
        duration,
        title: input.title !== undefined ? input.title : existing.title,
        render: 'render' in input ? input.render : existing.render,   // toast.ts sets render explicitly (undefined for plain strings)
        actions: input.actions !== undefined ? input.actions : existing.actions,
        source: input.source !== undefined ? input.source : existing.source,
        updatedAt: now,
        read: false,
      };

      history = [...history];
      history[existingIdx] = updated;

      if (currentToast?.id === input.id) {
        currentToast = updated;
        startToastTimer(updated);
      } else if (queuedToast?.id === input.id) {
        queuedToast = updated;
      } else if (!input.silent) {
        // Enqueue to show since it was updated
        if (!currentToast) {
          currentToast = updated;
          startToastTimer(updated);
        } else {
          const isError = updated.kind === 'error';
          const isCurrentNonError = currentToast.kind !== 'error';
          const timeVisible = currentToastStartedAt ? now - currentToastStartedAt : 0;
          if (isError && isCurrentNonError && timeVisible >= 600) {
            currentToast = updated;
            startToastTimer(updated);
          } else {
            queuedToast = updated;
          }
        }
      }

      schedulePersist();
      updateSnapshot();
      return updated.id;
    }
  }

  if (!input.id) {
    const recentDuplicateIdx = history.findIndex(
      (n) => !input.render && !n.render && n.kind === kind && n.message === message && now - n.createdAt < 2000
    );

    if (recentDuplicateIdx !== -1) {
      const existing = history[recentDuplicateIdx];
      const updated: IslandNotification = {
        ...existing,
        count: existing.count + 1,
        updatedAt: now,
        duration,
      };

      history = [...history];
      history[recentDuplicateIdx] = updated;

      if (currentToast?.id === updated.id) {
        currentToast = updated;
        startToastTimer(updated);
      } else if (queuedToast?.id === updated.id) {
        queuedToast = updated;
      }

      schedulePersist();
      updateSnapshot();
      return updated.id;
    }
  }

  const id = input.id || generateId();
  const notification: IslandNotification = {
    id,
    kind,
    title: input.title,
    message,
    render: input.render,
    actions: input.actions,
    duration,
    source,
    createdAt: now,
    updatedAt: now,
    read: false,
    count: 1,
  };

  if (!input.ephemeral) {
    history = [notification, ...history].slice(0, 100);
    schedulePersist();
  }

  if (input.silent) {
    updateSnapshot();
    return id;
  }

  if (!currentToast) {
    currentToast = notification;
    startToastTimer(notification);
  } else {
    const isError = notification.kind === 'error';
    const isCurrentNonError = currentToast.kind !== 'error';
    const timeVisible = currentToastStartedAt ? now - currentToastStartedAt : 0;

    if (isError && isCurrentNonError && timeVisible >= 600) {
      currentToast = notification;
      startToastTimer(notification);
    } else {
      queuedToast = notification;
    }
  }

  updateSnapshot();
  return id;
}

function markAsReadInHistory(id: string): boolean {
  const idx = history.findIndex((n) => n.id === id);
  if (idx !== -1 && !history[idx].read) {
    history = [...history];
    history[idx] = { ...history[idx], read: true };
    return true;
  }
  return false;
}

export function dismissNotification(id?: string) {
  let changed = false;

  if (id === undefined) {
    if (queuedToast) {
      markAsReadInHistory(queuedToast.id);
      queuedToast = null;
      changed = true;
    }
    if (currentToast) {
      markAsReadInHistory(currentToast.id);
      changed = true;
      advanceQueue();
    }
  } else {
    if (currentToast?.id === id) {
      markAsReadInHistory(id);
      changed = true;
      advanceQueue();
    } else if (queuedToast?.id === id) {
      markAsReadInHistory(id);
      queuedToast = null;
      changed = true;
    }

    if (markAsReadInHistory(id)) {
      changed = true;
    }
  }

  if (changed) {
    updateSnapshot();
    schedulePersist();
  }
}

export function markAllRead() {
  let changed = false;
  history = history.map((n) => {
    if (!n.read) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  if (changed) {
    updateSnapshot();
    schedulePersist();
  }
}

/** Empties the island notification history and saves the change. */
export function clearHistory() {
  history = [];
  updateSnapshot();
  schedulePersist();
}

export function useIslandNotifications() {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => currentSnapshot
  );
}

if (typeof window !== 'undefined') {
  loadHistory();
  updateSnapshot();
}
