-- =============================================================================
-- Onyx.mx — Supabase Schema Migration v1
-- Control Center: app_users table
-- =============================================================================
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- =============================================================================

-- ----------------------------------------------------------------
-- TABLE: app_users
-- Stores registered users allowed to access the Onyx.mx application.
-- The Developer manages this table via the Control Center.
-- ----------------------------------------------------------------
create table if not exists app_users (
  id               uuid        default gen_random_uuid() primary key,
  email            text        not null unique,
  role             text        not null check (role in ('Developer', 'Admin', 'Client', 'Vendor')),
  display_name     text,
  notes            text,
  created_at       timestamptz default now(),
  is_active        boolean     default true,
  last_submit_at   timestamptz,      -- UTC timestamp of most recent inventory submit/upsert
  total_submits    integer     default 0  -- running count of inventory records submitted
);

-- Index on email for fast login lookups
create index if not exists app_users_email_idx on app_users (email);

-- Index on role for filtering in the Control Center
create index if not exists app_users_role_idx on app_users (role);


-- ----------------------------------------------------------------
-- SAMPLE: Insert the Developer account
-- Replace with your actual developer email address.
-- ----------------------------------------------------------------
-- insert into app_users (email, role, display_name, notes)
-- values ('dev@onyx.mx', 'Developer', 'Lead Developer', 'Primary developer account');


-- ----------------------------------------------------------------
-- OPTIONAL: Row Level Security (RLS)
-- Uncomment and apply after confirming the app is working.
-- This locks the table so only service-role can write, anon can read
-- their own row (for login checks).
-- ----------------------------------------------------------------

-- alter table app_users enable row level security;

-- -- Allow anyone to check if their email is registered (read-only)
-- create policy "Public can check own email"
--   on app_users for select
--   using (true);

-- -- Only the service role (used server-side) can insert/update/delete
-- create policy "Service role full access"
--   on app_users for all
--   using (auth.role() = 'service_role');


-- =============================================================================
-- FUTURE: user_activity_log (Phase 2)
-- Uncomment to enable a detailed per-action audit log.
-- =============================================================================
-- create table if not exists user_activity_log (
--   id           uuid        default gen_random_uuid() primary key,
--   user_email   text        references app_users(email),
--   action       text        not null,  -- 'login', 'submit', 'delete', etc.
--   details      jsonb,
--   created_at   timestamptz default now()
-- );
