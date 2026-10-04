import React from 'react';
import { OnyxAgentHost } from './OnyxAgentHost';

/** The sidebar "Onyx" view: the same agent as the top-bar panel, full height (no three.js). */
export const OnyxAgentPage: React.FC = () => (
  <div className="h-full w-full flex justify-center p-4 overflow-hidden">
    <div className="h-full w-full max-w-3xl">
      <OnyxAgentHost variant="page" />
    </div>
  </div>
);
