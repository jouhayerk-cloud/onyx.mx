# Onyx AI Edge Function

## Required Secret
`GEMINI_API_KEY`

## Feature Flag
`VITE_ONYX_AI_MODE=edge`

## Rollout Order
1. Deploy this edge function and set the `GEMINI_API_KEY` secret.
2. The frontend will continue to use the direct browser path by default.
3. The Chief flips `VITE_ONYX_AI_MODE=edge` in the frontend environment to route traffic through the edge function.

## Before deploying (review RK1, 2026-10-04)

- The function builds the Gemini payload itself: only `contents`, `systemInstruction`, `tools` and `toolConfig` are forwarded, and `generationConfig` is rebuilt from a whitelist with `maxOutputTokens` capped at 8192.
- The production build must be made WITHOUT `VITE_GEMINI_API_KEY` when `VITE_ONYX_AI_MODE=edge` (Vite inlines any `VITE_*` variable that exists at build time, so an old key left in the build environment would stay in the bundle). Delete the old key in Google AI Studio after the switch.
- CORS is `*`: acceptable because auth is a bearer JWT (no cookies), but restrict it to the production origin if you want defence in depth.
