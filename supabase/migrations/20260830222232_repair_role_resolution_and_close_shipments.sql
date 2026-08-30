-- =============================================================================
-- PENDING APPROVAL — not yet applied.
-- =============================================================================
-- Apply AFTER PENDING_lock_down_definer_functions.sql.
--
-- Headline: the role system has never worked. get_my_app_role() joins
-- app_users.id to auth.uid(), but those UUIDs were generated independently and
-- match for ZERO of the 8 users. Every RLS predicate that calls it has been
-- evaluating NULL — for everyone — since it was written.
--
-- That is why finance reads returned nothing and why every inventory/logistics/
-- production write was silently blocked. The app only appeared to work because
-- the SELECT policies on inventory/logistics/production/settings are
-- `USING (true)`, which is also what let any account read everything.
--
-- Verified live before writing (all in rolled-back transactions):
--   role via id (today)      -> NULL for all 8 users
--   role via email (below)   -> Developer, Admin, ClientBoss x3,
--                               ClientAccounting, ClientViewer; NULL only for
--                               tester@onyx.mx and verifier@onyx.mx
--
-- Apply with:  supabase db push       (or paste into the SQL editor)
-- Rollback notes at the bottom.
-- =============================================================================


-- ── 1. Resolve roles by email, not by a UUID that was never linked ───────────
-- Matching on email rather than repointing app_users.id: it is a pure function
-- change with no data migration, and it matches what the existing
-- "app_users: own row read" policy already does (email = auth.jwt()->>'email').
--
-- Also marked STABLE. Both were implicitly VOLATILE, so Postgres re-ran them
-- once per row instead of once per statement — on a 519-row scan under RLS that
-- is 519 extra lookups per query.
CREATE OR REPLACE FUNCTION public.get_my_app_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT a.role FROM public.app_users a
     WHERE lower(a.email) = lower(auth.jwt() ->> 'email')
     LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_vendor_prefix()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT a.vendor_prefix FROM public.app_users a
     WHERE lower(a.email) = lower(auth.jwt() ->> 'email')
     LIMIT 1;
$$;


-- ── 2. Reads require a provisioned account, not merely an account ────────────
-- `USING (true)` meant any authenticated user read the entire inventory —
-- including price_mxn, book_acquisition and book_landed, the exact columns the
-- cypher work just took out of the public bundle. With self-registration open,
-- "any authenticated user" means anyone at all.
--
-- Requiring a non-null app role keeps every provisioned user working (verified:
-- Developer 519/59/241, ClientViewer 519 inventory, 0 finance) while a stranger
-- with an account gets 0 rows everywhere.
DROP POLICY IF EXISTS "inventory: authenticated read"  ON public.inventory;
DROP POLICY IF EXISTS "logistics: authenticated read"  ON public.logistics;
DROP POLICY IF EXISTS "production: authenticated read" ON public.production;
DROP POLICY IF EXISTS "settings: authenticated read"   ON public.settings;

CREATE POLICY "inventory: staff read"  ON public.inventory  FOR SELECT TO authenticated
    USING (public.get_my_app_role() IS NOT NULL);
CREATE POLICY "logistics: staff read"  ON public.logistics  FOR SELECT TO authenticated
    USING (public.get_my_app_role() IS NOT NULL);
CREATE POLICY "production: staff read" ON public.production FOR SELECT TO authenticated
    USING (public.get_my_app_role() IS NOT NULL);
CREATE POLICY "settings: staff read"   ON public.settings   FOR SELECT TO authenticated
    USING (public.get_my_app_role() IS NOT NULL);


-- ── 3. shipments was world-readable ──────────────────────────────────────────
-- "Allow public read access" was SELECT USING (true) granted to `public`, which
-- includes anon. Confirmed by an unauthenticated request against the live API:
-- HTTP 200, 210 KB, including sender names and seal numbers. This is the one
-- finding in this file that was leaking real personal data to the internet.
--
-- The write policy was `auth.role() = 'authenticated'` — any account at all,
-- for INSERT/UPDATE/DELETE. Confirmed in a rolled-back transaction that a
-- stranger's JWT could DELETE every shipment row.
DROP POLICY IF EXISTS "Allow public read access" ON public.shipments;
DROP POLICY IF EXISTS "Allow auth insert/update" ON public.shipments;

CREATE POLICY "shipments: staff read"  ON public.shipments FOR SELECT TO authenticated
    USING (public.get_my_app_role() IS NOT NULL);
CREATE POLICY "shipments: staff write" ON public.shipments FOR ALL TO authenticated
    USING      (public.get_my_app_role() = ANY (ARRAY['Developer','Admin','ClientBoss','ClientAccounting']))
    WITH CHECK (public.get_my_app_role() = ANY (ARRAY['Developer','Admin','ClientBoss','ClientAccounting']));


-- ── 4. Stop trusting self-assigned signup metadata ───────────────────────────
-- "Admins can manage all devices" tested
--     auth.users.raw_user_meta_data->>'role' IN ('Developer','Admin')
-- but raw_user_meta_data is whatever the client passed to signUp(). Login.tsx
-- sends `data: { role: 'Vendor' }`; nothing stops a crafted request sending
-- 'Admin'. All 8 existing users carry a `role` key there, so the path is real.
-- Authorisation must come from app_users, which only an admin can write.
DROP POLICY IF EXISTS "Admins can manage all devices"    ON public.onyxchan_devices;
DROP POLICY IF EXISTS "Users can view their assigned devices" ON public.onyxchan_devices;
DROP POLICY IF EXISTS "Users can view commands for their devices" ON public.onyxchan_commands;

CREATE POLICY "devices: admin manage" ON public.onyxchan_devices FOR ALL TO authenticated
    USING      (public.get_my_app_role() = ANY (ARRAY['Developer','Admin']))
    WITH CHECK (public.get_my_app_role() = ANY (ARRAY['Developer','Admin']));
CREATE POLICY "devices: owner read"   ON public.onyxchan_devices FOR SELECT TO authenticated
    USING (assigned_user_id = auth.uid());
CREATE POLICY "commands: owner read"  ON public.onyxchan_commands FOR SELECT TO authenticated
    USING (target_device IN (SELECT d.device_id FROM public.onyxchan_devices d
                              WHERE d.assigned_user_id = auth.uid()));


-- ── 5. Remove vestigial anon grants ──────────────────────────────────────────
-- RLS already yields 0 rows on these for anon, but the table GRANT is what
-- makes RLS the only thing standing between anon and the data. Revoking it
-- means a future permissive policy cannot silently re-open them.
-- Left alone deliberately: nothing here is read by the public artifact path —
-- that goes through the `artifact` edge function on the service role.
REVOKE ALL ON public.app_users         FROM anon;
REVOKE ALL ON public.settings          FROM anon;
REVOKE ALL ON public.shipments         FROM anon;
REVOKE ALL ON public.onyxchan_devices  FROM anon;
REVOKE ALL ON public.onyxchan_commands FROM anon;


-- =============================================================================
-- VERIFY AFTER APPLYING
--   -- 1. roles now resolve (expect 6 non-null, 2 null test accounts):
--   SELECT u.email, (SELECT role FROM public.app_users a
--                     WHERE lower(a.email)=lower(u.email)) AS role
--     FROM auth.users u ORDER BY 2 NULLS LAST;
--
--   -- 2. shipments closed to the internet (expect 401, not 200):
--   --    curl -s -o /dev/null -w '%{http_code}\n' \
--   --      '<project>/rest/v1/shipments?select=*' -H "apikey: <anon>"
--
--   -- 3. sign in as ramses@jouhayerk.com and confirm the app still syncs
--   --    inventory 519 / finance 59 / logistics 241, and that saving an item
--   --    now succeeds (it has been failing for everyone until this migration).
--
-- KNOWN EFFECT
--   tester@onyx.mx and verifier@onyx.mx have no app_users row and will lose all
--   read access. Add rows for them if they are still needed.
--
-- ROLLBACK
--   Restore the previous definitions:
--     CREATE OR REPLACE FUNCTION public.get_my_app_role() ... WHERE id = auth.uid();
--   and recreate the permissive policies:
--     CREATE POLICY "inventory: authenticated read" ON public.inventory
--       FOR SELECT TO authenticated USING (true);   -- (and logistics/production/settings)
--     CREATE POLICY "Allow public read access" ON public.shipments FOR SELECT USING (true);
--   Note the last one is the PII leak — do not restore it except to prove a point.
-- =============================================================================
