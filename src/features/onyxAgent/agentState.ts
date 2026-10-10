import { atom } from 'jotai';
import { nullableAtom } from '../../lib/atoms';

export type AgentPhase = 'idle' | 'listening' | 'thinking' | 'acting' | 'speaking' | 'error';

/** Whether the Onyx agent panel is open. Starts closed. */
export const onyxAgentOpenAtom = atom<boolean>(false);
export const onyxAgentPhaseAtom = atom<AgentPhase>('idle');
export const onyxMirrorRobotAtom = atom<boolean>(false);
export const onyxRobotDeviceIdAtom = nullableAtom<string>();   // see nullableAtom in lib/atoms: plain atom(null) types as read-only here

export type AgentActivityKind = 'tool' | 'navigate' | 'robot' | 'error';

export interface AgentActivity {
    id: string;
    t: number;
    kind: AgentActivityKind;
    label: string;
    ok: boolean;
}

export const onyxAgentActivityAtom = atom<AgentActivity[]>([]);

export const pushActivity = (
    setActivity: (updater: (prev: AgentActivity[]) => AgentActivity[]) => void,
    activity: Omit<AgentActivity, 'id' | 't'>
) => {
    setActivity((prev: AgentActivity[]) => {
        const next = [...prev, {
            ...activity,
            id: Math.random().toString(36).substring(2, 9),
            t: Date.now()
        }];
        return next.slice(-50);
    });
};
