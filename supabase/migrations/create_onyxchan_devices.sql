-- OnyxChan Device Assignment Table
-- Maps StackChan hardware units to Onyx.mx users
CREATE TABLE IF NOT EXISTS onyxchan_devices (
  device_id TEXT PRIMARY KEY,
  assigned_user_email TEXT NOT NULL,
  assigned_user_id UUID REFERENCES app_users(id),
  device_name TEXT NOT NULL DEFAULT 'OnyxChan',
  firmware_version TEXT DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE onyxchan_devices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own assigned devices
CREATE POLICY "Users can view their assigned devices"
  ON onyxchan_devices FOR SELECT
  USING (auth.uid() = assigned_user_id);

-- Policy: Service role can manage all devices (for Edge Functions)
CREATE POLICY "Service role manages all devices"
  ON onyxchan_devices FOR ALL
  USING (auth.role() = 'service_role');

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE onyxchan_devices;

-- Insert default device for Ramses
INSERT INTO onyxchan_devices (device_id, assigned_user_email, device_name)
VALUES ('onyxchan-01', 'ramses@jouhayerk.com', 'OnyxChan 1')
ON CONFLICT (device_id) DO NOTHING;
