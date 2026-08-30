/**
 * useRemoteControl.ts
 * 
 * Subscribes to a user-scoped Supabase Realtime channel and dynamically
 * updates Jotai atoms when OnyxChan broadcasts a STATE_UPDATE event.
 * This allows the StackChan robot to remotely control the Onyx.mx web app
 * for its assigned user across all active devices.
 */
import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { getDefaultStore } from 'jotai';
import { supabase } from '../../lib/supabase';
import {
  userAtom,
  activeViewAtom,
  inventorySearchTermAtom,
  inventoryArtifactConfigAtom,
  isUploadWizardOpenAtom,
  inventoryStatusFilterAtom,
  inventoryVendorFilterAtom,
  financeSubTabAtom,
  paymentsArtifactConfigAtom,
  onyxRequestSendAtom,
} from '../../lib/atoms';
import type { Atom, WritableAtom } from 'jotai';

// Whitelist of atoms that OnyxChan is allowed to control remotely.
// This prevents arbitrary state manipulation from the broadcast channel.
const REMOTE_CONTROLLABLE_ATOMS: Record<string, WritableAtom<any, [any], void>> = {
  activeViewAtom,
  inventorySearchTermAtom,
  inventoryArtifactConfigAtom,
  isUploadWizardOpenAtom,
  inventoryStatusFilterAtom,
  inventoryVendorFilterAtom,
  financeSubTabAtom,
  paymentsArtifactConfigAtom,
};

/**
 * Hook that listens to Supabase Realtime broadcasts from OnyxChan
 * and applies state changes to the local Jotai store.
 * 
 * Supported event types:
 * - STATE_UPDATE: Directly set a Jotai atom value
 * - ONYX_AI_PROMPT: Inject a prompt into the Onyx AI chatbot
 * - BATCH_UPDATE: Apply multiple atom changes at once
 */
export function useRemoteControl() {
  const user = useAtomValue(userAtom);

  useEffect(() => {
    if (!user?.id) return;

    const store = getDefaultStore();
    const channelName = `remote_control:${user.id}`;

    console.log(`📡 OnyxChan Remote Control: Subscribing to ${channelName}`);

    const channel = supabase
      .channel(channelName)

      // Handle single atom state updates
      .on('broadcast', { event: 'STATE_UPDATE' }, ({ payload }) => {
        const { atomName, value } = payload;

        const targetAtom = REMOTE_CONTROLLABLE_ATOMS[atomName];
        if (targetAtom) {
          store.set(targetAtom, value);
          console.log(`📡 OnyxChan updated: ${atomName}`, value);
        } else {
          console.warn(`⚠️ OnyxChan remote control blocked: "${atomName}" is not whitelisted.`);
        }
      })

      // Handle Onyx AI prompt injection (robot tells the chatbot to do something)
      .on('broadcast', { event: 'ONYX_AI_PROMPT' }, ({ payload }) => {
        const { prompt } = payload;
        if (prompt && typeof prompt === 'string') {
          // We increment onyxRequestSendAtom to trigger the AI to process the prompt.
          // The prompt text itself needs to be set via the input atom used by OnyxChat.
          // For now, we log it; the actual injection depends on OnyxChat's input atom.
          console.log(`🤖 OnyxChan AI Prompt received: "${prompt}"`);
          store.set(onyxRequestSendAtom, (prev: number) => prev + 1);
        }
      })

      // Handle batch updates (multiple atoms at once)
      .on('broadcast', { event: 'BATCH_UPDATE' }, ({ payload }) => {
        const { updates } = payload;
        if (Array.isArray(updates)) {
          for (const { atomName, value } of updates) {
            const targetAtom = REMOTE_CONTROLLABLE_ATOMS[atomName];
            if (targetAtom) {
              store.set(targetAtom, value);
              console.log(`📡 OnyxChan batch updated: ${atomName}`, value);
            }
          }
        }
      })

      .subscribe((status) => {
        console.log(`📡 OnyxChan Remote Control channel status: ${status}`);
      });

    return () => {
      console.log(`📡 OnyxChan Remote Control: Unsubscribing from ${channelName}`);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
}
