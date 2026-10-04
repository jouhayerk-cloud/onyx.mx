import React, { useEffect, useState, forwardRef, useRef, useImperativeHandle } from 'react';
import { OnyxFace } from './face/OnyxFace';
import { useGaze } from './face/useGaze';
import { AgentPhase } from './agentState';
import { tr } from '../../lib/i18n';
import { FaceExpression } from './face/expressions';

export interface OnyxAgentButtonProps {
    phase: AgentPhase;
    open: boolean;
    onToggle: () => void;
    controlsId: string;
}

export const OnyxAgentButton = forwardRef<HTMLButtonElement, OnyxAgentButtonProps>(
    ({ phase, open, onToggle, controlsId }, forwardedRef) => {
        const localRef = useRef<HTMLButtonElement>(null);
        
        useImperativeHandle(forwardedRef, () => localRef.current as HTMLButtonElement);
        
        useGaze(localRef);

        const [isSleepy, setIsSleepy] = useState(false);

        useEffect(() => {
            setIsSleepy(false);
            const timer = setTimeout(() => {
                setIsSleepy(true);
            }, 600000); // 10 minutes
            return () => clearTimeout(timer);
        }, [phase]);

        let expression: FaceExpression = 'calm';
        if (phase === 'listening') expression = 'listening';
        else if (phase === 'thinking') expression = 'thinking';
        else if (phase === 'acting') expression = 'alert';
        else if (phase === 'speaking') expression = 'speaking';
        else if (phase === 'error') expression = 'error';
        else if (phase === 'idle') {
            expression = isSleepy ? 'sleepy' : 'calm';
        }

        const isBusy = phase !== 'idle' && phase !== 'error';

        return (
            <button
                ref={localRef}
                type="button"
                onClick={onToggle}
                aria-label={tr('Onyx assistant')}
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-controls={controlsId}
                title={tr('Onyx assistant')}
                className={`w-[44px] h-[44px] flex items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--main-color,currentColor)] ${isBusy ? 'ring-1 ring-amber-500/30' : ''}`}
            >
                <OnyxFace size={34} expression={expression} tone={isBusy ? 'amber' : phase === 'error' ? 'mono' : 'emerald'} />
            </button>
        );
    }
);
OnyxAgentButton.displayName = 'OnyxAgentButton';
