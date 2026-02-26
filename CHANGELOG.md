# Onyx.mx — Changelog

All notable changes to the `/git/app` production deployment are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

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
