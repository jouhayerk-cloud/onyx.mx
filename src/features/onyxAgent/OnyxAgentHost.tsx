import React from 'react';
import { useOnyxAgentWiring } from './useOnyxAgentWiring';
import { OnyxAgentPanel } from './OnyxAgentPanel';

export const OnyxAgentHost: React.FC<{ variant?: 'drawer' | 'page'; onClose?: () => void }> = ({ variant, onClose }) => {
    const wiring = useOnyxAgentWiring();
    return (
        <OnyxAgentPanel 
            variant={variant} 
            onClose={onClose} 
            agent={wiring.agent} 
            robot={wiring.robot} 
            mirror={wiring.mirror} 
            onMirrorChange={wiring.setMirror} 
        />
    );
};
