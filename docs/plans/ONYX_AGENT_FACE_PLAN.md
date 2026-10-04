# Onyx AI as the OnyxChan face in the top bar: implementation plan v1

Owner: Ramses. Chief: Juan117. Date: 2026-10-04. Status: plan approved to start (swarm wave U1), nothing pushed.

## 1. Decisions (from Ramses, 2026-10-04)
- The three.js Onyx AI UI is too heavy and slows the app. It is replaced, not tuned.
- Onyx AI becomes the **animated OnyxChan face from the Devices module**, living in the **main top bar**.
- The eyes **follow the mouse pointer**.
- The panel shows the **OnyxChan twin**.
- **Clicking** the face opens the agent, and the agent can **act in the app** and **drive the StackChan robot**.
- The app is not pushed yet; everything stays on local `main` until Ramses says so.

## 2. What exists today (verified in the code)
| Piece | Where | Note |
|---|---|---|
| three.js orb UI | `features/onyx/OnyxOrbView.tsx`, `OnyxVisuals.tsx`, `BotOrb.tsx`, `BotOrbVisuals.tsx` | `<BotOrb />` is already commented out "for performance" in `MainAppView.tsx`; the `'onyx'` view still mounts `OnyxOrbView` |
| Chat + tool loop | `features/onyx/OnyxChat.tsx` (728 lines), tools in `onyxTools.ts` (search_inventory, get_item_details, get_database_context, get_item_samples, get_inventory_summary, get_app_context, deploy_inventory_artifact, search_logistics, search_finance) | Gemini function calling, key from `lib/ai/keys` or the `onyx-ai` edge function (`VITE_ONYX_AI_MODE=edge`) |
| Faces | `features/pico/devices/twin/stackchan/StackChanFace.tsx` and `Faces.tsx` (SVG, 320x240, wire expressions neutral/happy/sad/angry/surprised/sleepy/listening/speaking) | the Devices module drawings |
| Robot vocabulary | `features/pico/useDeviceControl.ts`: `OnyxChanFace` = calm, happy, thinking, sleepy, shy, smug, pouty, alert, error, speaking, listening, vendor-display, inventory-display; `say`, `setFace`, `move`, `showVendorCard`, `showInventoryCard`, `showGif` | the agent reuses this API |
| Robot transport | `lib/onyxMcpClient.ts`, `pico/hooks/useDeviceChannel.ts`, `pico/surfaces/useDeviceFleet.ts` | live only after migrations 0001-0003 and the gateway are deployed; the mock fleet works today |
| Top bar | `features/core/MainHeader.tsx` (4,606 lines; `OnyxBar` at ~line 4414) | `TopBar.tsx` is empty |
| Navigation | `activeViewAtom` in `lib/atoms.tsx`, switch in `MainAppView.tsx` | the agent navigates by setting this atom |

## 3. Target experience
1. A 40 px OnyxChan face sits in the top bar on every view. Idle: slow blink every 3-6 s, tiny gaze drift. Pointer moves: pupils follow the pointer with damping (max offset about 6 % of the face width); the face never moves, only the eyes and brows.
2. Click (or Enter/Space): a panel drops from the face (right side, 420 px wide, full height on phones). Header = large live face plus the robot twin card; body = chat; footer = composer and a "Mirror to robot" switch.
3. Agent states drive the face: idle=calm, typing=listening, waiting for the model=thinking, running a tool=alert (brief), answering=speaking (mouth follows text streaming), success=happy, error=error, 10 minutes idle=sleepy.
4. The agent can: answer from inventory, finance and logistics (existing tools); **navigate** the app (open a view, open an item, set a filter); **drive the robot** (speak, face, head move, vendor and inventory cards). Anything that writes data needs a confirmation card; v1 has no data-writing tools.
5. When "Mirror to robot" is on and a StackChan is online, the robot shows the same expression as the agent and speaks short answers (rate-limited, opt-in, off by default).

## 4. Performance budget (the reason for the redesign)
- No WebGL, no canvas, no three.js on the first paint path or in the agent. Pure SVG plus CSS transforms.
- One window `pointermove` listener (passive) shared by all faces; updates are applied with `requestAnimationFrame` only while the pointer moves or a transition runs; idle CPU about 0.
- Pause everything when `document.hidden`; honour `prefers-reduced-motion` (no gaze drift or blink animation, static expressions).
- The panel and the chat code are lazy-loaded on first click; the top bar only ships the small face component.
- Acceptance: build output has no three.js chunk requested by the top bar; Performance profile shows no frame over 4 ms from the face while moving the mouse.

## 5. Architecture
New folder `src/features/onyxAgent/`:
```
face/expressions.ts      OnyxChanFace -> eye/brow/mouth geometry (SVG paths), wire-expression mapping
face/OnyxFace.tsx        pure SVG face: props expression, gaze {x,y}, blink, speakingLevel, size, tone, title
face/useGaze.ts          pointer -> damped gaze for a ref'd element; shared listener; reduced-motion safe
agentState.ts            jotai atoms: onyxAgentOpenAtom, onyxAgentPhaseAtom, onyxMirrorRobotAtom, onyxRobotDeviceIdAtom
useOnyxAgent.ts          chat loop + tool-calling (extracted from OnyxChat.tsx), phase, confirm cards, activity log
tools/appTools.ts        navigate / open_item / set_filter / get_current_view + risk classes
tools/robotTools.ts      robot_say / robot_face / robot_move / robot_show_card on useDeviceControl
useRobotMirror.ts        phase -> OnyxChanFace -> setFace on the selected online StackChan (rate-limited)
OnyxAgentButton.tsx      the 40 px face in the top bar
OnyxAgentPanel.tsx       lazy panel: face, twin card, chat, activity, composer
strings.*.json           [english, spanish] pairs
```
Shared contracts (fixed so the work packages can run in parallel):
- `type FaceExpression = OnyxChanFace` (re-exported from `useDeviceControl.ts`).
- `OnyxFace` props: `{ expression: FaceExpression; speakingLevel?: number; size?: number; tone?: 'amber'|'emerald'|'mono'; className?: string; title?: string }`.
- Gaze never goes through React state: `useGaze(ref, opts?)` returns void and writes the CSS variables `--onyx-gx` / `--onyx-gy` (-1..1) on the element; `OnyxFace` reads them in CSS transforms.
- `AgentPhase = 'idle'|'listening'|'thinking'|'acting'|'speaking'|'error'`.
- Tool handler factory: `createAppToolHandlers(ctx)` and `createRobotToolHandlers(ctx)` return `Record<string, (args:any)=>Promise<unknown>>`; definitions are exported as `appToolDefinitions` and `robotToolDefinitions` in Gemini `function_declarations` shape. A tool result is always JSON data, never instructions.

## 6. Security rules for the agent
- Tools run as the signed-in user (Supabase RLS decides data access); role gating in the tool factory: Developer and Admin get everything; Vendor and Client get read-only tools on their own data and **no** robot tools.
- Risk classes: `read` (auto), `navigate` (auto, logged), `robot` (auto only for face/say/move, logged, rate-limited 1 command/s), `write` (confirmation card; none shipped in v1).
- Tool output and model text are untrusted: never evaluated, rendered as text, links not auto-opened.
- No Gemini key in the browser in edge mode (`onyx-ai` function); the production build must not contain `VITE_GEMINI_API_KEY`.

## 7. Work packages and swarm waves (Gemini via agy; Claude weekly usage is above 85%)
| Wave | Task | Output |
|---|---|---|
| U1 (parallel, new files only) | OA1 face + gaze | `face/*` (and `strings.oa1.json`) |
| U1 | OA2 agent core | `agentState.ts`, `useOnyxAgent.ts`, `strings.oa2.json` (port of the OnyxChat loop, phase machine, confirm cards) |
| U1 | OA3 app tools | `tools/appTools.ts` |
| U1 | OA4 robot tools + mirror | `tools/robotTools.ts`, `useRobotMirror.ts` |
| U2 (after U1 merge) | OA5 top bar button + panel + twin card | `OnyxAgentButton.tsx`, `OnyxAgentPanel.tsx`, one small insertion in `MainHeader.tsx`, `MainAppView.tsx` |
| U2 | OA6 retire the three.js path | `'onyx'` view opens the panel, `OnyxOrbView`/`BotOrb*` removed from imports, bundle check |
| U3 | RO1-RO3 reviews | security (tool gating, injection), performance/a11y, code review |
Chief per wave: typecheck, build, bundle check, merge to local `main`, Spanish strings, fixes from reviews.

## 8. Acceptance
1. The face is in the top bar on every view; eyes follow the pointer; idle CPU near zero; reduced-motion respected.
2. Click opens the panel (keyboard too); Esc closes; focus returns to the face.
3. The agent answers from inventory/finance/logistics, navigates the app and opens records, and shows what it did in the activity log.
4. Robot: with a mock or live StackChan, commands go through `useDeviceControl`; mirroring is opt-in and rate-limited; no robot tools for Vendor and Client.
5. `npm run typecheck` and `vite build` pass; no three.js chunk on first paint; Spanish strings complete.

## 9. Open questions for Ramses (defaults in bold)
1. Should the agent be allowed to change data in v1? **No (navigation, filters and robot only).**
2. Voice input and spoken answers in the browser? **Out of v1 (text only; the robot speaks when mirroring).**
3. Several StackChans online: which one mirrors? **The one selected in the panel, default the first online.**
4. Keep the sidebar "Onyx" entry? **Yes, it opens the same panel full-height.**
5. Robot control needs the migrations and the gateway live (approved today; the gateway deploy still needs the GCP details). Until then the mock fleet drives the virtual twin.
