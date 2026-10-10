-- DRAFT: NOT APPLIED. Ramses reviews and applies this.
-- 2026-10-11 - close the NULL role hole in the three OnyxChan device functions.
--
-- Problem (proved on the live project, rolled back, nothing changed): the guards read
--     IF public.get_my_app_role() NOT IN ('Admin', 'Developer') THEN RAISE ...
-- get_my_app_role() is NULL for a signed-in user whose email has no app_users row (2 of the 8 auth users today).
-- NULL NOT IN (...) is NULL, not true, so the guard does not fire. A call as such a user to
-- issue_device_token('__no_such_device__') got past the guard and failed only at "unknown device".
-- With a real device id the caller would receive a new valid device token and lock the real device out.
-- revoke_device_token and link_onyxchan_device (for another user) have the same hole.
--
-- Fix: treat a missing role as "not allowed". Server side callers keep working: the service role and a direct
-- postgres session (the SQL editor) are allowed explicitly, because they carry no app_users email.
-- link_onyxchan_device additionally refuses callers that are not provisioned in app_users.
-- CREATE OR REPLACE keeps the existing grants. Additive in effect: no table or column changes.
--
-- Verify after applying (rolled back, changes nothing; expected message: "only Admin or Developer may issue device tokens"):
--   begin; set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","email":"nobody-proof@example.invalid","role":"authenticated"}', true);
--   select public.issue_device_token('__no_such_device__'); rollback;
-- Rollback of this migration: re-run the three original definitions from 20260830234500_device_auth_per_device_tokens.sql.
begin;

create or replace function public.issue_device_token(p_device_id text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare raw_token text;
begin
    if not (
        coalesce(public.get_my_app_role(), '') in ('Admin', 'Developer')
        or coalesce(auth.role(), '') = 'service_role'
        or session_user in ('postgres', 'supabase_admin')
    ) then
        raise exception 'only Admin or Developer may issue device tokens';
    end if;
    raw_token := 'ocd_' || encode(extensions.gen_random_bytes(32), 'hex');
    update public.onyxchan_devices
       set token_hash       = encode(extensions.digest(raw_token, 'sha256'), 'hex'),
           token_issued_at  = now(),
           token_revoked_at = null
     where device_id = p_device_id;
    if not found then raise exception 'unknown device %', p_device_id; end if;
    return raw_token;
end; $$;

create or replace function public.revoke_device_token(p_device_id text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
    if not (
        coalesce(public.get_my_app_role(), '') in ('Admin', 'Developer')
        or coalesce(auth.role(), '') = 'service_role'
        or session_user in ('postgres', 'supabase_admin')
    ) then
        raise exception 'only Admin or Developer may revoke device tokens';
    end if;
    update public.onyxchan_devices
       set token_hash = null, token_revoked_at = now(), status = 'offline'
     where device_id = p_device_id;
end; $$;

create or replace function public.link_onyxchan_device(p_device_id text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
    caller   uuid := auth.uid();
    role_now text := public.get_my_app_role();
begin
    if caller is null then
        raise exception 'link_onyxchan_device requires an authenticated caller';
    end if;
    if coalesce(role_now, '') = '' then
        raise exception 'link_onyxchan_device requires a provisioned user';
    end if;
    if p_user_id <> caller and role_now not in ('Admin', 'Developer') then
        raise exception 'not permitted to link a device to another user';
    end if;
    update public.onyxchan_devices
       set assigned_user_id = p_user_id, last_seen = now()
     where device_id = p_device_id;
end; $$;

commit;
