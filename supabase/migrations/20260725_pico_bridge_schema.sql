-- Migration: PicoBridge Schema & Realtime Channels
-- Date: 2026-07-25
-- Description: Creates tables for M5Stack/ESP32 device registration, live sessions, and scan logs.

CREATE TABLE IF NOT EXISTS public.pico_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_mac VARCHAR(17) UNIQUE NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    hardware_model VARCHAR(100) NOT NULL,
    assigned_role VARCHAR(50) NOT NULL,
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_email VARCHAR(255) NOT NULL,
    accessories JSONB DEFAULT '[]'::jsonb,
    firmware_version VARCHAR(20) DEFAULT '1.0.0',
    is_active BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pico_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and manage their linked Pico devices"
    ON public.pico_devices FOR ALL
    USING (
        auth.uid() = owner_user_id 
        OR auth.jwt() ->> 'email' IN (SELECT email FROM app_users WHERE role IN ('Developer', 'Admin'))
    );

CREATE TABLE IF NOT EXISTS public.pico_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES public.pico_devices(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    active_workflow VARCHAR(50) DEFAULT 'idle',
    workflow_metadata JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'connected',
    connected_at TIMESTAMPTZ DEFAULT now(),
    disconnected_at TIMESTAMPTZ
);

ALTER TABLE public.pico_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own Pico sessions"
    ON public.pico_sessions FOR ALL
    USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.pico_scan_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.pico_sessions(session_id) ON DELETE SET NULL,
    device_id UUID REFERENCES public.pico_devices(id) ON DELETE CASCADE,
    scan_type VARCHAR(20) NOT NULL,
    tag_id VARCHAR(100) NOT NULL,
    rssi INTEGER,
    action_taken VARCHAR(100),
    scanned_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pico_scan_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view scan logs for their devices"
    ON public.pico_scan_logs FOR SELECT
    USING (device_id IN (SELECT id FROM public.pico_devices WHERE owner_user_id = auth.uid()));
