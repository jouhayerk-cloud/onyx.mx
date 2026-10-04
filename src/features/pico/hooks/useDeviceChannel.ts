/**
 * useDeviceChannel.ts
 *
 * Subscribes to a Supabase Realtime broadcast channel by topic and event list.
 * The channel is always removed on unmount or topic change.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';

export function useDeviceChannel(
  topic: string | null | undefined,
  events: string[] = [],
  onEvent?: (event: string, payload: any) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const eventsKey = events.join('|');

  useEffect(() => {
    if (!topic) return;
    const channel = supabase.channel(topic);
    for (const event of eventsKey ? eventsKey.split('|') : []) {
      channel.on('broadcast', { event }, (msg) => onEventRef.current?.(event, msg.payload));
    }
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [topic, eventsKey]);

  const send = useCallback(async (event: string, payload: Record<string, any>) => {
    const channel = channelRef.current;
    if (!channel) throw new Error('Device channel is not ready.');
    const result = await channel.send({ type: 'broadcast', event, payload });
    if (result !== 'ok') throw new Error(`Device channel send failed: ${result}`);
  }, []);

  return { send };
}
