-- APPLIED 2026-08-30. Security remediation, stage 2: close anonymous access.
--
-- Safe because the public read path moved server-side first: the `artifact` edge
-- function runs on the service role and returns a curated field set, so printed
-- QR labels keep resolving without the database being open to anonymous callers.

DROP POLICY IF EXISTS "Allow all for inventory" ON public.inventory;
DROP POLICY IF EXISTS "Public read access for artifact traceability" ON public.inventory;

CREATE POLICY "inventory: authenticated read"
    ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory: staff insert"
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

DROP POLICY IF EXISTS "Allow all for finance" ON public.finance;
CREATE POLICY "finance: finance roles read"
    ON public.finance FOR SELECT TO authenticated
    USING (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'));
CREATE POLICY "finance: finance roles write"
    ON public.finance FOR ALL TO authenticated
    USING      (public.get_my_app_role() IN ('Developer','Admin','ClientAccounting'))
    WITH CHECK (public.get_my_app_role() IN ('Developer','Admin','ClientAccounting'));
REVOKE ALL ON public.finance FROM anon;

DROP POLICY IF EXISTS "Allow all for logistics" ON public.logistics;
CREATE POLICY "logistics: authenticated read"
    ON public.logistics FOR SELECT TO authenticated USING (true);
CREATE POLICY "logistics: staff write"
    ON public.logistics FOR ALL TO authenticated
    USING      (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'))
    WITH CHECK (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'));
REVOKE ALL ON public.logistics FROM anon;

DROP POLICY IF EXISTS "Allow all for production" ON public.production;
DROP POLICY IF EXISTS "Public read access for production artifacts" ON public.production;
CREATE POLICY "production: authenticated read"
    ON public.production FOR SELECT TO authenticated USING (true);
CREATE POLICY "production: staff write"
    ON public.production FOR ALL TO authenticated
    USING      (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'))
    WITH CHECK (public.get_my_app_role() IN ('Developer','Admin','ClientBoss','ClientAccounting'));
REVOKE ALL ON public.production FROM anon;

-- 826 tables: the old client-read policy matched the table's own defaults, so
-- effectively every row was public including price_mxn and vendor_notes.
DROP POLICY IF EXISTS "Clients read available inventory" ON public.inventory_826;
REVOKE ALL ON public.inventory_826 FROM anon;
REVOKE ALL ON public.finance_826   FROM anon;
REVOKE ALL ON public.logistics_826 FROM anon;
