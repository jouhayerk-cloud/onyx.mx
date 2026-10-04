import React, { Suspense } from 'react';
import { useAtomValue } from 'jotai';
import { userAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import './island.css';
import { IslandLiveRegion } from './IslandLiveRegion';
// @ts-ignore - bare is expected by the contract but might not be explicitly typed in OnyxFaceProps yet
import { OnyxFace } from '../onyxAgent/face/OnyxFace';

const OnyxIsland = React.lazy(() => import('./OnyxIsland').then(m => ({ default: m.OnyxIsland })));

export const IslandBand: React.FC = () => {
  const user = useAtomValue(userAtom);

  if (!user) {
    return null;
  }

  return (
    <div className="onyx-island-band" role="region" aria-label={tr('Onyx assistant and notifications')}>
      <IslandLiveRegion />
      <Suspense fallback={
        <div className="onyx-island onyx-island--rest">
          <div className="onyx-island-surface">
            {/* @ts-ignore */}
            <OnyxFace bare size={56} expression="calm" tone="mono" />
          </div>
        </div>
      }>
        <OnyxIsland />
      </Suspense>
    </div>
  );
};
