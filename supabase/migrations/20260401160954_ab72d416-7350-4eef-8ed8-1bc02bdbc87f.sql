-- Add live_stream_id FK to community_events
ALTER TABLE public.community_events
ADD COLUMN live_stream_id uuid REFERENCES public.community_live_streams(id) ON DELETE SET NULL;

-- Index for lookups
CREATE INDEX idx_community_events_live_stream_id ON public.community_events(live_stream_id) WHERE live_stream_id IS NOT NULL;