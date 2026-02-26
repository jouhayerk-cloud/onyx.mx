# Onyx.mx — Changelog

All notable changes to the `/git/app` production deployment are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## [2.7.2] — 2026-02-26

### Added
- **Send Invite button** in Control Center → User Registry — Each registered user card now has an ✉️ **Invite** button. Clicking it opens the developer's email client (via `mailto:`) pre-filled with a professional Onyx.mx invitation containing:
  - The user's display name and assigned role
  - A direct link to the app (`https://jouhayerk-cloud.github.io/onyx.mx/`)
  - Step-by-step registration instructions using the registered email address

---

## [2.7.1] — 2026-02-26 · Hotfix

### Fixed
- `fix(auth): fail-open access guard` — The `app_users` access guard introduced in v2.7.0 was blocking **all authenticated users** because the `app_users` Supabase table does not exist yet (migration not yet applied). The guard now distinguishes between:
  - **Table missing / unexpected DB error** → fails **open**, falls back to the legacy `resolveUserRole()` resolver so no one is locked out during setup.
  - **Table exists, row not found or user inactive** → fails **closed**, signs the user out and shows the "Access Denied" screen.
- Supabase error code `PGRST116` (PostgREST "row not found") is the trigger for the deny path; any other error code gracefully falls back.

> **Action required:** Run `supabase_schema_v1.sql` in your Supabase SQL editor to enable the full access control system. Once the table exists and `ramses@jouhayerk.com` is inserted as `Developer`, the guard will enforce email-based access.

---

## [2.7.0] — 2026-02-26

### Added
- **Control Center** (`src/features/control/`) — Developer-only top-level sidebar module
  - **User Registry Panel**: Register/manage allowed user emails per role (Developer / Admin / Vendor / Client)
  - **User Activity Tracking**: Displays `is_active` status, `last_submit_at` timestamp, and `total_submits` per user
  - Toggle user active/inactive, delete entries; live sync with Supabase `app_users` table
  - **Database Stats Panel**: Live inventory summary — total items, KPI stat cards, animated breakdowns by Status, Vendor, and Category
  - Control tab is gated to `Developer` role only — invisible to all other roles
- **Supabase schema migration** (`supabase_schema_v1.sql`) — `app_users` table with activity columns, RLS policy stubs, and future audit log scaffold
- **Upload Workflow** (`src/features/upload/`) — Unified step-by-step item upload wizard
  - Three-step flow: Media Selection → Item Details → Review & Submit
  - Media types: Single Image, Sample, Lot, Video, or No Media
  - Uploads media to Google Drive via Apps Script; upserts item record to Supabase `inventory`
  - Upload tab visible to Developer, Admin, and Vendor roles
- **Email-based access guard** (`App.tsx`) — After Supabase Auth login, app verifies the user's email against `app_users`. Unregistered or inactive emails are immediately signed out and shown an "Access Denied" screen. User role is now sourced from `app_users.role` instead of the hardcoded resolver.
- New global Jotai atoms: `uploadCurrentStepAtom`, `uploadSelectedMediaTypeAtom`, `uploadMediaFilesAtom`, `uploadItemDataAtom`

### Fixed
- `fix(upload): crash on Upload wizard start` — `vendors[0].id` threw because `vendors` is an object map, not an array. Changed to `Object.keys(vendors)[0]` for safe first-key access.
- `fix(upload): role-based vendor assignment` — Developer and Admin are prompted to select a vendor from the dropdown. Client and Vendor roles are automatically locked to their own user ID as the vendor, with a read-only locked field in the UI.
- Removed hardcoded `resolveUserRole()` dependency in `App.tsx` — roles now come from the database.
- Removed unused `SCRIPT_URL` and `useState` imports in upload components.

### Changed
- Sidebar restructured: **Control** (Developer only) → **Upload** → **Inventory** → **Logistics** → **Finance**

---

## [2.6.3] — 2026-02-26

### Fixed
- `fix(ui): remove stats panel and filter icons from top bar` — Removed the old "Show Stats Panels" and "Filter: All items" icon buttons from `MainHeader.tsx` in both `/git/app/` and `/Onyx.mx/app/`.

---

## [2.6.2] and earlier

> _Legacy versions. Maintained in the pre-refactor codebase history._
