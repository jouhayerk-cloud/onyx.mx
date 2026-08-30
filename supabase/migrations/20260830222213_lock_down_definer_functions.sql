-- =============================================================================
-- PENDING APPROVAL — not yet applied.
-- =============================================================================
-- Follow-up to the security audit. Everything here came out of
-- `supabase advisors --type security` after the cypher migration landed.
--
-- Apply with:  supabase db push       (or paste into the SQL editor)
-- Rollback notes at the bottom.
-- =============================================================================


-- ── 1. onyx_round: pin search_path ───────────────────────────────────────────
-- Regression from the cypher migration: onyx_cypher and the trigger function
-- both pin search_path, but onyx_round was left with the role default. It is
-- only reachable through onyx_cypher today, which fully qualifies the call, so
-- this is hardening rather than an open hole — but the whole point of pinning
-- is that it does not depend on who the caller is.
-- floor() lives in pg_catalog, which is always searched, so '' is sufficient.
CREATE OR REPLACE FUNCTION public.onyx_round(n NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE WHEN $1 - floor($1) >= 0.4 THEN floor($1) + 1 ELSE floor($1) END;
$$;


-- ── 2. link_onyxchan_device: close the unauthenticated rebind ────────────────
-- As shipped this was SECURITY DEFINER, granted to `anon`, and took the target
-- user id as a parameter. Any unauthenticated caller could POST to
-- /rest/v1/rpc/link_onyxchan_device and bind any device to any user — reassign
-- a device to themselves, or push someone else's device onto a third party.
-- Nothing in src/ calls it, so revoking from anon breaks nothing today.
--
-- Two changes, because the grant alone is not the whole bug: a signed-in user
-- could still pass somebody else's uuid. Callers now link to themselves unless
-- they hold an admin role.
CREATE OR REPLACE FUNCTION public.link_onyxchan_device(p_device_id TEXT, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller UUID := auth.uid();
BEGIN
    IF caller IS NULL THEN
        RAISE EXCEPTION 'link_onyxchan_device requires an authenticated caller';
    END IF;

    IF p_user_id <> caller
       AND public.get_my_app_role() NOT IN ('Admin', 'Developer') THEN
        RAISE EXCEPTION 'not permitted to link a device to another user';
    END IF;

    UPDATE public.onyxchan_devices
       SET assigned_user_id = p_user_id,
           last_seen        = NOW()
     WHERE device_id = p_device_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_onyxchan_device(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_onyxchan_device(TEXT, UUID) TO authenticated;


-- ── 3. Trigger functions are not an API ──────────────────────────────────────
-- Both are exposed at /rest/v1/rpc/ purely because PostgREST publishes anything
-- executable in the public schema. sync_app_user_deletion DELETEs from
-- auth.users; it should never have been reachable from outside a trigger.
--
-- Verified on this database before writing: revoking EXECUTE does NOT stop the
-- trigger from firing. PostgreSQL checks EXECUTE at CREATE TRIGGER time, not on
-- each fire — tested with a scratch table and role in a rolled-back transaction.
REVOKE ALL ON FUNCTION public.inventory_compute_book_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_app_user_deletion()        FROM PUBLIC, anon, authenticated;


-- ── 4. Role helpers: revoke from anon, keep for authenticated ────────────────
-- get_my_app_role() backs 16 RLS policies across app_users, inventory, finance,
-- logistics, production and settings. RLS predicates are evaluated with the
-- querying user's privileges, so `authenticated` MUST keep EXECUTE — revoking it
-- would make every one of those policies fail. anon has no such policies and no
-- business calling either helper.
REVOKE ALL ON FUNCTION public.get_my_app_role()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_vendor_prefix() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_app_role()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_vendor_prefix() TO authenticated;


-- =============================================================================
-- VERIFY AFTER APPLYING
--   -- anon should hold EXECUTE on none of these:
--   SELECT p.proname,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('onyx_cypher','onyx_round','link_onyxchan_device',
--                        'inventory_compute_book_fields','sync_app_user_deletion',
--                        'get_my_app_role','get_my_vendor_prefix');
--   -- expected: anon = false on every row; auth = true only for the two helpers
--
--   -- the trigger must still populate codes on write:
--   UPDATE public.inventory SET price_mxn = price_mxn WHERE item_id = '<any priced row>';
--   SELECT book_aq_code, book_land_code, book_barcode FROM public.inventory WHERE item_id = '<same>';
--
--   -- and the app must still read: sign in, confirm inventory/finance/logistics sync.
--
-- ROLLBACK
--   GRANT EXECUTE ON FUNCTION public.link_onyxchan_device(TEXT, UUID) TO anon;
--   GRANT EXECUTE ON FUNCTION public.get_my_app_role()      TO anon;
--   GRANT EXECUTE ON FUNCTION public.get_my_vendor_prefix() TO anon;
--   -- and restore the pre-guard body of link_onyxchan_device if a Pico flow
--   -- turns out to depend on unauthenticated pairing (it should not — see the
--   -- device-auth item in the audit).
-- =============================================================================
