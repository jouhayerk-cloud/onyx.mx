-- =============================================================================
-- PENDING APPROVAL — not yet applied.
-- =============================================================================
-- Per-device credentials for OnyxChan hardware.
--
-- Devices cannot sign in: there is no browser, no redirect, no human at the
-- moment of connection. They need a long-lived bearer credential that is
-- per-device, revocable, and strictly less privileged than a staff session —
-- never the service-role key, which would hand the whole database to anything
-- that can read a device's flash.
--
-- Threat this closes: /heartbeat on the edge function took device_id from the
-- request body, so any caller could rewrite any device's status. The device now
-- proves which device it is, and the body's device_id is ignored entirely.
-- =============================================================================


-- ── 1. Telemetry columns the code has always assumed ─────────────────────────
-- get_robot_status reads battery_level, rssi and accessories; /heartbeat writes
-- battery_level and rssi. None of them existed. select('*') hides the read side
-- (missing keys read as undefined, so the function silently returned invented
-- defaults like 92% battery) but the heartbeat UPDATE would have failed outright.
ALTER TABLE public.onyxchan_devices
    ADD COLUMN IF NOT EXISTS battery_level INT,
    ADD COLUMN IF NOT EXISTS rssi          INT,
    ADD COLUMN IF NOT EXISTS accessories   TEXT[];


-- ── 2. The credential ────────────────────────────────────────────────────────
-- Only the SHA-256 hash is stored. A database leak therefore does not yield
-- working device tokens, and the raw value exists exactly once: in the response
-- to issue_device_token, and thereafter only in the device's flash.
ALTER TABLE public.onyxchan_devices
    ADD COLUMN IF NOT EXISTS token_hash         TEXT,
    ADD COLUMN IF NOT EXISTS token_issued_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS token_revoked_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS token_last_used_at TIMESTAMPTZ;

-- Partial unique index: two devices must never share a hash, but many devices
-- may legitimately have no token yet.
CREATE UNIQUE INDEX IF NOT EXISTS idx_onyxchan_devices_token_hash
    ON public.onyxchan_devices (token_hash) WHERE token_hash IS NOT NULL;


-- ── 3. Issue (admin only, returns the raw token exactly once) ────────────────
CREATE OR REPLACE FUNCTION public.issue_device_token(p_device_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    raw_token TEXT;
BEGIN
    IF public.get_my_app_role() NOT IN ('Admin', 'Developer') THEN
        RAISE EXCEPTION 'only Admin or Developer may issue device tokens';
    END IF;

    -- 32 bytes from the CSPRNG. Prefixed so it is recognisable in a support
    -- conversation without revealing anything.
    raw_token := 'ocd_' || encode(extensions.gen_random_bytes(32), 'hex');

    UPDATE public.onyxchan_devices
       SET token_hash       = encode(extensions.digest(raw_token, 'sha256'), 'hex'),
           token_issued_at  = now(),
           token_revoked_at = NULL
     WHERE device_id = p_device_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown device %', p_device_id;
    END IF;

    -- Issuing again supersedes the previous token: the old hash is overwritten,
    -- so a lost or copied token stops working the moment a new one is issued.
    RETURN raw_token;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_device_token(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_device_token(TEXT) TO authenticated;


-- ── 4. Revoke ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_device_token(p_device_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF public.get_my_app_role() NOT IN ('Admin', 'Developer') THEN
        RAISE EXCEPTION 'only Admin or Developer may revoke device tokens';
    END IF;

    UPDATE public.onyxchan_devices
       SET token_hash       = NULL,
           token_revoked_at = now(),
           status           = 'offline'
     WHERE device_id = p_device_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_device_token(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_device_token(TEXT) TO authenticated;


-- ── 5. Verify (edge function only) ───────────────────────────────────────────
-- Returns the device_id a token belongs to, or NULL. EXECUTE is revoked from
-- anon and authenticated: a signed-in user must not be able to sit in a loop
-- testing candidate tokens against this.
--
-- Hash comparison is not constant-time. That is acceptable here because the
-- compared value is a SHA-256 digest of a 256-bit secret — there is no
-- meaningful prefix to walk — but it is the reason the token must stay long and
-- random rather than becoming a human-chosen string later.
CREATE OR REPLACE FUNCTION public.verify_device_token(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT d.device_id
      FROM public.onyxchan_devices d
     WHERE d.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
       AND d.token_revoked_at IS NULL
     LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_device_token(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_device_token(TEXT) TO service_role;


-- ── 6. Heartbeat recording, scoped to the calling device ─────────────────────
-- Takes the device_id the token proved, never one from a request body.
CREATE OR REPLACE FUNCTION public.record_device_heartbeat(
    p_device_id TEXT, p_battery INT DEFAULT NULL, p_rssi INT DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.onyxchan_devices
       SET status             = 'online',
           battery_level      = COALESCE(p_battery, battery_level),
           rssi               = COALESCE(p_rssi, rssi),
           last_seen          = now(),
           token_last_used_at = now()
     WHERE device_id = p_device_id;
$$;

REVOKE ALL ON FUNCTION public.record_device_heartbeat(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_device_heartbeat(TEXT, INT, INT) TO service_role;


-- =============================================================================
-- PROVISIONING A DEVICE
--   -- 1. create the row (assigned_user_email is NOT NULL)
--   INSERT INTO public.onyxchan_devices (device_id, assigned_user_email, device_name)
--   VALUES ('onyxchan-01', 'ramses@jouhayerk.com', 'OnyxChan 01');
--
--   -- 2. issue the token, signed in as Admin/Developer. Copy it now; it is
--   --    never retrievable again.
--   SELECT public.issue_device_token('onyxchan-01');
--
--   -- 3. flash it to the device and send it as:  Authorization: Bearer ocd_...
--
--   -- revoke a lost device:
--   SELECT public.revoke_device_token('onyxchan-01');
--
-- VERIFY AFTER APPLYING
--   SELECT device_id, token_hash IS NOT NULL AS has_token,
--          token_issued_at, token_revoked_at FROM public.onyxchan_devices;
--   -- anon and authenticated must NOT be able to verify tokens:
--   SELECT has_function_privilege('anon','public.verify_device_token(text)','EXECUTE'),
--          has_function_privilege('authenticated','public.verify_device_token(text)','EXECUTE');
--   -- expected: false, false
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.record_device_heartbeat(TEXT, INT, INT);
--   DROP FUNCTION IF EXISTS public.verify_device_token(TEXT);
--   DROP FUNCTION IF EXISTS public.revoke_device_token(TEXT);
--   DROP FUNCTION IF EXISTS public.issue_device_token(TEXT);
--   -- columns are additive and safe to leave
-- =============================================================================
