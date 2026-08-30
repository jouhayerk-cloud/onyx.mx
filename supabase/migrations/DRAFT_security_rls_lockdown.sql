-- =============================================================================
-- DRAFT — NOT APPLIED. Review before running.
-- =============================================================================
-- Security remediation, stage 2: close anonymous access to the core tables.
--
-- WHY THIS IS A DRAFT
-- The public QR-tag viewer and the embedded search viewer read `inventory`
-- anonymously, and the `artifact` edge function uses the ANON key (not
-- service_role), so it is subject to RLS exactly like the browser. Revoking
-- anonymous read without a replacement path breaks all three.
--
-- This migration therefore pairs the lockdown with a column-restricted view.
-- It REQUIRES the matching code change below before it is applied:
--
--   src/lib/artifactUtils.ts        from('inventory')  ->  from('public_catalog')
--   supabase/functions/artifact/    from('inventory')  ->  from('public_catalog')
--
-- Verified beforehand: the public views render only `bookRetail`. They never
-- display price_mxn, book_acquisition or book_landed, so excluding those costs
-- nothing functionally.
-- =============================================================================


-- ── 1. Public catalogue view — safe columns only ─────────────────────────────
-- Everything a tag scan or public search needs, and nothing about what an item
-- cost to acquire.
CREATE OR REPLACE VIEW public.public_catalog
WITH (security_invoker = true) AS
SELECT
    id, item_id, item_number, vendor_id, workbook,
    shape, material, color, quantity,
    weight_kg, height_cm, width_cm, length_cm,
    short_description, detailed_description, generated_description,
    generated_color, generated_type,
    media_urls, generated_png_url, generated_svg_url, generated_image_urls,
    status, book_barcode,
    book_retail,          -- retail is public by design; cost columns are not
    created_at, updated_at
FROM public.inventory
WHERE coalesce(is_hidden, false) = false;

-- NOTE: book_barcode encodes landed cost through the DMOXHELFAN cypher, and that
-- cypher ships in the client bundle. The barcode must stay public for tag lookup,
-- so this view cannot fully hide cost until the cypher itself moves server-side.
-- Tracked separately as the cypher finding.

GRANT SELECT ON public.public_catalog TO anon, authenticated;


-- ── 2. inventory — replace blanket public access ─────────────────────────────
DROP POLICY IF EXISTS "Allow all for inventory" ON public.inventory;
DROP POLICY IF EXISTS "Public read access for artifact traceability" ON public.inventory;

CREATE POLICY "inventory: authenticated read"
    ON public.inventory FOR SELECT TO authenticated USING (true);

CREATE POLICY "inventory: staff write"
    ON public.inventory FOR INSERT TO authenticated
    WITH CHECK (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'));

CREATE POLICY "inventory: staff update"
    ON public.inventory FOR UPDATE TO authenticated
    USING      (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'))
    WITH CHECK (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'));

CREATE POLICY "inventory: admin delete"
    ON public.inventory FOR DELETE TO authenticated
    USING (public.get_my_app_role() IN ('Developer','Admin'));

REVOKE ALL ON public.inventory FROM anon;


-- ── 3. finance — no anonymous access at all ──────────────────────────────────
-- Payment amounts and bank accounts have no public use case.
DROP POLICY IF EXISTS "Allow all for finance" ON public.finance;

CREATE POLICY "finance: finance roles read"
    ON public.finance FOR SELECT TO authenticated
    USING (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'));

CREATE POLICY "finance: finance roles write"
    ON public.finance FOR ALL TO authenticated
    USING      (public.get_my_app_role() IN ('Developer','Admin','ClientAccounting'))
    WITH CHECK (public.get_my_app_role() IN ('Developer','Admin','ClientAccounting'));

REVOKE ALL ON public.finance FROM anon;


-- ── 4. logistics ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for logistics" ON public.logistics;

CREATE POLICY "logistics: authenticated read"
    ON public.logistics FOR SELECT TO authenticated USING (true);

CREATE POLICY "logistics: staff write"
    ON public.logistics FOR ALL TO authenticated
    USING      (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'))
    WITH CHECK (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'));

REVOKE ALL ON public.logistics FROM anon;


-- ── 5. production ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for production" ON public.production;
DROP POLICY IF EXISTS "Public read access for production artifacts" ON public.production;

CREATE POLICY "production: authenticated read"
    ON public.production FOR SELECT TO authenticated USING (true);

CREATE POLICY "production: staff write"
    ON public.production FOR ALL TO authenticated
    USING      (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'))
    WITH CHECK (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'));

REVOKE ALL ON public.production FROM anon;


-- ── 6. inventory_826 — stop leaking vendor cost to the public ────────────────
-- The old policy matched on the table's own defaults, so effectively every row
-- was publicly readable including price_mxn and vendor_notes. It also broke
-- vendor isolation, since permissive policies OR together.
DROP POLICY IF EXISTS "Clients read available inventory" ON public.inventory_826;
REVOKE ALL ON public.inventory_826 FROM anon;
REVOKE ALL ON public.finance_826   FROM anon;
REVOKE ALL ON public.logistics_826 FROM anon;


-- ── 7. shipments ─────────────────────────────────────────────────────────────
-- Public read is retained: the sent-truck viewer resolves manifests anonymously.
-- Writes are narrowed to signed-in users.
DROP POLICY IF EXISTS "Allow auth insert/update" ON public.shipments;

CREATE POLICY "shipments: authenticated write"
    ON public.shipments FOR ALL TO authenticated
    USING (true) WITH CHECK (true);


-- =============================================================================
-- ROLLBACK
-- If the app breaks, restore access immediately with:
--
--   CREATE POLICY "Allow all for inventory" ON public.inventory
--       FOR ALL TO public USING (true) WITH CHECK (true);
--   GRANT ALL ON public.inventory TO anon;
--
-- ...and the equivalent for finance / logistics / production. Then diagnose.
-- =============================================================================
