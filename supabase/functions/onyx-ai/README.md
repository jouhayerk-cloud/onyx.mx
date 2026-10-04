# Onyx AI Edge Function

## Required Secret
`GEMINI_API_KEY`

## Feature Flag
`VITE_ONYX_AI_MODE=edge`

## Rollout Order
1. Deploy this edge function and set the `GEMINI_API_KEY` secret.
2. The frontend will continue to use the direct browser path by default.
3. The Chief flips `VITE_ONYX_AI_MODE=edge` in the frontend environment to route traffic through the edge function.
