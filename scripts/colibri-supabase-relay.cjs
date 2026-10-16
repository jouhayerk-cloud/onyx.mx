#!/usr/bin/env node
/**
 * scripts/colibri-supabase-relay.cjs
 *
 * DISABLED (owner decision, 16 Oct 2026). The Supabase Realtime relay for Colibrì stays off until it is secured.
 *
 * The previous daemon joined one public, unauthenticated Realtime channel with the public anon key, forwarded any
 * endpoint any subscriber asked for to the local engine, and broadcast prompts and answers to everyone on the channel.
 * Re-enabling it needs a private channel with RLS on realtime.messages, a dedicated daemon identity (not the anon
 * key), an endpoint allowlist (/v1/chat/completions and /v1/models only), a fixed upstream (no caller-chosen URL) and
 * per-sender rate limits. See docs/ai/COLIBRI_WINDOWS_SETUP.md, section "Relay".
 */
'use strict';

console.error(
    '[colibri-supabase-relay] DISABLED: the Supabase Realtime relay is off until it is secured.\n' +
    '  Colibri works directly: start the server on this PC (http://127.0.0.1:8000) and use the app in a browser on the same PC.\n' +
    '  See docs/ai/COLIBRI_WINDOWS_SETUP.md.'
);
process.exit(1);
