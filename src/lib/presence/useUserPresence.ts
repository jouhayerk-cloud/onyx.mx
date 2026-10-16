/**
 * src/lib/presence/useUserPresence.ts
 *
 * Subagent ADM-T1: Database & Low-Load Presence Architect
 *
 * React hook to synchronize client user presence and observe the active device fleet.
 * Automatically initializes low-load heartbeat on mount, reacts to view/user changes,
 * and computes fleet metrics (onlineCount, idleCount, desktopCount, mobileCount, edgeCount).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { activeViewAtom, userAtom } from '../atoms';
import {
  presenceService,
  UserActiveSession,
  PresenceUserInfo,
} from './presenceService';

export type { UserActiveSession, PresenceUserInfo };

export interface UseUserPresenceOptions {
  pollIntervalMs?: number;
  autoStartHeartbeat?: boolean;
}

export interface UseUserPresenceReturn {
  sessions: UserActiveSession[];
  loading: boolean;
  refetch: () => Promise<void>;
  recordAction: (action: string) => void;
  onlineCount: number;
  idleCount: number;
  desktopCount: number;
  mobileCount: number;
  edgeCount: number;
  totalCount: number;
  mySessionId: string;
}

export function useUserPresence(options?: UseUserPresenceOptions): UseUserPresenceReturn {
  const activeView = useAtomValue(activeViewAtom);
  const user = useAtomValue(userAtom);

  const [sessions, setSessions] = useState<UserActiveSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const pollIntervalMs = options?.pollIntervalMs ?? 30_000;
  const autoStart = options?.autoStartHeartbeat ?? true;
  const isMountedRef = useRef<boolean>(true);

  // Fetch active sessions from Supabase
  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const fleet = await presenceService.getActiveSessions();
      if (isMountedRef.current) {
        setSessions(fleet);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Record custom user action through presenceService
  const recordAction = useCallback((action: string) => {
    presenceService.recordUserAction(action);
  }, []);

  // Update presence context whenever activeView or user changes
  useEffect(() => {
    const userInfo: PresenceUserInfo | null = user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      : null;

    presenceService.setContext({
      currentView: activeView,
      user: userInfo,
    });
  }, [activeView, user]);

  // Lifecycle: start heartbeat, initial fetch, and periodic fleet polling
  useEffect(() => {
    isMountedRef.current = true;

    if (autoStart) {
      const userInfo: PresenceUserInfo | null = user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          }
        : null;

      presenceService.startPresenceHeartbeat({
        currentView: activeView,
        user: userInfo,
      });
    }

    void refetch();

    const pollTimer = setInterval(() => {
      void refetch();
    }, pollIntervalMs);

    return () => {
      isMountedRef.current = false;
      clearInterval(pollTimer);
      if (autoStart) {
        presenceService.stopPresenceHeartbeat();
      }
    };
  }, [autoStart, pollIntervalMs, refetch]);

  // Compute fleet counts
  const counts = useMemo(() => {
    let onlineCount = 0;
    let idleCount = 0;
    let desktopCount = 0;
    let mobileCount = 0;
    let edgeCount = 0;

    for (const session of sessions) {
      if (session.is_idle) {
        idleCount++;
      } else {
        onlineCount++;
      }

      switch (session.device_type) {
        case 'desktop':
          desktopCount++;
          break;
        case 'mobile':
        case 'tablet':
          mobileCount++;
          break;
        case 'edge_relay':
          edgeCount++;
          break;
      }
    }

    return {
      onlineCount,
      idleCount,
      desktopCount,
      mobileCount,
      edgeCount,
      totalCount: sessions.length,
    };
  }, [sessions]);

  return {
    sessions,
    loading,
    refetch,
    recordAction,
    mySessionId: presenceService.getSessionId(),
    ...counts,
  };
}
