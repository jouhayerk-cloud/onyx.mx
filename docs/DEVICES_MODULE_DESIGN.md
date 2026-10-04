# Onyx Devices Module Design

## Purpose and Users
The Devices module serves as the central command interface for monitoring and interacting with the OnyxChan hardware fleet (including StackChan terminals, M5StickS3 scanners, and ATOM devices).

**Target Users:** This module is restricted exclusively to the **Admin** and **Developer** roles. Vendors, clients, and general staff do not have access to these views, ensuring that sensitive hardware controls and systemic telemetry remain secure.

## Information Architecture
The module interface is divided into functional areas (tabs/sections) to provide targeted insights and actions:

*   **Fleet:** Displays the current status of all provisioned devices. It answers: *"Which devices are online, what is their battery and signal health, and what firmware are they running?"*
*   **Scans:** Provides a live feed of scan events (NFC, QR, barcode) performed by the devices. It answers: *"What tags and items are currently being processed on the floor?"*
*   **Workflows:** Tracks the progress of multi-step agentic tasks (like a crate packing check or inventory lookup), displaying state changes along a timeline. It answers: *"What complex tasks are devices executing right now, and what is their current progress?"*
*   **Control:** Allows manual interaction and diagnostics with a specific device, including gimbal movement (pan/tilt), facial expressions, and text-to-speech commands. It answers: *"How can I manually interact with or test a specific terminal?"*
*   **Admin:** Handles device registry, token issuance, staff assignment, and remote revocation. It answers: *"Who is assigned to which device, and how do I secure a compromised terminal?"*

## Data Sources per Tab

| Tab / Section | Data Source Tables | Realtime Topics | MCP Tools / Hooks | Polling / Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Fleet** | `onyxchan_device_state`, `onyxchan_telemetry` | `devices:all`, `device:<id>` (via `realtime.broadcast_changes`) | `useDeviceFleet` | 30s polling fallback + Broadcast INSERT/UPDATE |
| **Scans** | `onyxchan_events` | `devices:all` or private channels | `onyx-mcp`, `resolve_tag` | Pushed via Realtime |
| **Workflows** | `agent_runs`, `agent_run_events` | `devices:all` | `onyx-mcp` | 30s polling + Realtime Broadcast |
| **Control** | `onyxchan_commands` | `devices:all` (acks) | `/v1/notify`, `onyx-mcp` | Polling/Realtime for command status |
| **Admin** | `onyxchan_devices`, `onyxchan_device_assignments` | N/A | Auth/Revoke edge functions | Manual trigger / On-load |

## Device States (Online / Stale / Offline)
To support a "scale-to-zero" gateway architecture, device presence is determined purely by the `last_checkin_at` timestamp rather than a persistent WebSocket connection. The UI calculates state dynamically based on the device's `checkin_interval_s` (default 60s):

*   **Online:** The time since the last check-in is less than **2.5 times** the check-in interval.
*   **Stale:** The time since the last check-in is between **2.5 and 10 times** the check-in interval (e.g., 150s to 600s).
*   **Offline:** The time since the last check-in is greater than **10 times** the interval, or the device has never checked in.

## The Command Lifecycle
Commands sent from the app to a device pass through a strict, asynchronous lifecycle managed by `onyxchan_commands`:

1.  **queued:** The command is inserted and waiting. A `pg_net` trigger optionally notifies the gateway if the device has an open session.
2.  **leased:** The gateway has claimed the command (`FOR UPDATE SKIP LOCKED`) and is attempting delivery. Leases expire after 60 seconds, returning the command to the queue.
3.  **acked:** The device successfully received and acknowledged the command.
4.  **failed:** The command could not be delivered after 3 attempts, or the device explicitly returned an error.
5.  **expired:** The command remained unclaimed or unacknowledged past its absolute expiry time (typically configured as at least twice the check-in interval).

## Agent Run Event Vocabulary
Multi-step workflows generate a sequence of typed events stored in `agent_run_events`. The UI interprets this standard vocabulary to render live progress:

*   `RunStarted` / `RunFinished` / `RunError`: Defines the boundaries and terminal states of the workflow.
*   `StepStarted` / `StepFinished`: Marks distinct logical phases within the run.
*   `ToolCallStart` / `ToolCallResult`: Indicates when the agent invokes an MCP tool and when the result returns.
*   `StateDelta`: Carries incremental updates to the workflow's internal state (e.g., updating `scanned`, `expected`, or `wrong` arrays for a `packing_check`).

## Roles and Privacy
*   **Visibility:** The entire module is hidden from Vendors and Clients.
*   **Financial Data:** Cost, payment, and MXN fields are structurally redacted for `voice` roles. `staff-device` roles (like the StickS3) can display *prices* on their screens but still lack access to cost or payment data.
*   **Isolation:** The edge functions enforce role boundaries. Devices can only be commanded by Admin users or the specific Staff member assigned to them. A leaked device token cannot access cross-device commands or staff-level tools.

## Empty and Error States
*   **Empty Fleet:** If no devices exist, a clear placeholder prompts the user to manually link a device or pair via Web Bluetooth.
*   **No Telemetry:** Individual device cards display "No telemetry yet" gracefully if a registered device hasn't checked in.
*   **Missing Backend:** If the database migration is unapplied, the data source drops to `none`, and the UI degrades safely without crashing.
*   **Device Errors:** Hardware or execution errors sent by the device populate the `last_error` field and render as explicit alerts on the fleet cards.

## Migration: Before vs. After Backend Application
*   **Before the Backend is Applied:** The UI `useDeviceFleet` hook catches the missing table errors and sets the source to `none`. The UI renders empty/safe states. Simulator interactions and Web Bluetooth features continue to function locally. Developers can enable a mock mode (`onyx.devices.mock=1`) to view the intended layout.
*   **After the Backend is Applied:** The fleet hook successfully queries `onyxchan_device_state`, `onyxchan_telemetry`, and `agent_runs`. The UI subscribes to `devices:all` broadcasts, bringing real-time telemetry, workflow timelines, and command tracking to life.

## Open Questions
*   Is the 30-second fallback polling interval for secondary data (telemetry, runs, commands) sufficiently responsive, or should more of this data be pushed exclusively via Realtime?
*   How aggressive should the historical cleanup of `agent_run_events` be to ensure the UI timeline query remains performant without requiring pagination?
*   Do we need additional UI/audio alerts for operators when a device transitions from "Online" to "Stale" during an active shift?
