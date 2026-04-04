
-- Add access control and Zoom password columns
ALTER TABLE public.community_live_streams
  ADD COLUMN IF NOT EXISTS access_rule TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS access_value TEXT,
  ADD COLUMN IF NOT EXISTS recording_password TEXT;

-- Index for access queries
CREATE INDEX IF NOT EXISTS idx_live_streams_access ON public.community_live_streams(community_id, access_rule);
