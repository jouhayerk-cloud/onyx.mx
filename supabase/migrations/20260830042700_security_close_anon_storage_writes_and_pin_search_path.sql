-- APPLIED 2026-08-30. Security remediation, stage 1: no application impact.

-- 1. Storage: stop anonymous uploads and overwrites.
DROP POLICY IF EXISTS "Allow public uploads to inventory-media" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to inventory-media" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads u9efqr_0" ON storage.objects;

CREATE POLICY "Authenticated uploads to inventory-media"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'inventory-media');

CREATE POLICY "Authenticated updates to inventory-media"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'inventory-media')
    WITH CHECK (bucket_id = 'inventory-media');

-- 2. Pin search_path on every SECURITY DEFINER function.
ALTER FUNCTION public.get_my_app_role()            SET search_path = '';
ALTER FUNCTION public.get_my_vendor_prefix()       SET search_path = '';
ALTER FUNCTION public.update_updated_at_column()   SET search_path = '';
ALTER FUNCTION public.update_modified_column_826() SET search_path = '';
ALTER FUNCTION public.sync_app_user_deletion()     SET search_path = '';
ALTER FUNCTION public.link_onyxchan_device(text, uuid) SET search_path = '';

-- 3. Revoke anonymous EXECUTE where it is not needed.
-- get_my_app_role / get_my_vendor_prefix stay executable: RLS policies call them
-- during evaluation, so revoking would break access checks for real users.
REVOKE EXECUTE ON FUNCTION public.link_onyxchan_device(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_app_user_deletion()         FROM anon;
