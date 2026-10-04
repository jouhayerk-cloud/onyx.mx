import { useEffect, useRef } from 'react';
import { AgentPhase } from './agentState';
import { useDeviceControl } from '../pico/useDeviceControl';
import { FaceExpression } from './face/expressions';

export interface UseRobotMirrorOpts {
  enabled: boolean;
  phase: AgentPhase;
  control: Pick<ReturnType<typeof useDeviceControl>, 'setFace'>;
  online: boolean;
}

const PHASE_TO_FACE: Record<AgentPhase, FaceExpression> = {
  idle: 'calm',
  listening: 'listening',
  thinking: 'thinking',
  acting: 'alert',
  speaking: 'speaking',
  error: 'error',
};

export function useRobotMirror(opts: UseRobotMirrorOpts): void {
  const { enabled, phase, control, online } = opts;
  const lastFaceSent = useRef<FaceExpression | null>(null);
  const lastSendTime = useRef<number>(0);
  const pendingFace = useRef<FaceExpression | null>(null);
  const timerRef = useRef<number | null>(null);
  const sleepyTimerRef = useRef<number | null>(null);

  // We need to keep a ref to control to avoid stale closures in timers
  const controlRef = useRef(control);
  controlRef.current = control;

  useEffect(() => {
    if (!enabled || !online) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (sleepyTimerRef.current !== null) {
        window.clearTimeout(sleepyTimerRef.current);
        sleepyTimerRef.current = null;
      }
      return;
    }

    const desiredFace = PHASE_TO_FACE[phase];

    const sendFace = (face: FaceExpression) => {
      lastFaceSent.current = face;
      lastSendTime.current = Date.now();
      pendingFace.current = null;
      controlRef.current.setFace(face);
    };

    const attemptSend = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (pendingFace.current === null) return;
      if (pendingFace.current === lastFaceSent.current) {
        pendingFace.current = null;
        return;
      }

      const now = Date.now();
      const elapsed = now - lastSendTime.current;

      if (elapsed >= 1500) {
        sendFace(pendingFace.current);
      } else {
        const delay = 1500 - elapsed;
        timerRef.current = window.setTimeout(attemptSend, delay);
      }
    };

    if (desiredFace !== lastFaceSent.current && desiredFace !== pendingFace.current) {
      pendingFace.current = desiredFace;
      attemptSend();
    }

    if (sleepyTimerRef.current !== null) {
      window.clearTimeout(sleepyTimerRef.current);
      sleepyTimerRef.current = null;
    }

    if (phase === 'idle') {
      sleepyTimerRef.current = window.setTimeout(() => {
        if (lastFaceSent.current !== 'sleepy') {
          sendFace('sleepy');
        }
      }, 10 * 60 * 1000);
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (sleepyTimerRef.current !== null) {
        window.clearTimeout(sleepyTimerRef.current);
        sleepyTimerRef.current = null;
      }
    };
  }, [enabled, online, phase]);
}
