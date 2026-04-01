
ALTER TABLE community_events ADD COLUMN IF NOT EXISTS location_type text DEFAULT NULL;
ALTER TABLE community_events ADD COLUMN IF NOT EXISTS location_value text DEFAULT NULL;
ALTER TABLE community_events ADD COLUMN IF NOT EXISTS remind_email_before integer DEFAULT NULL;
ALTER TABLE community_events ADD COLUMN IF NOT EXISTS access_rule text DEFAULT 'all_members';
ALTER TABLE community_events ADD COLUMN IF NOT EXISTS access_value text DEFAULT NULL;
ALTER TABLE community_events ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT NULL;
