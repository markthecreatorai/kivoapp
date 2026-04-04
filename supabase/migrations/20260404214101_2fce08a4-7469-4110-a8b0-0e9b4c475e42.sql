
-- Add archive and popularity columns to community_resources
ALTER TABLE public.community_resources
  ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;

-- Create index for archive filtering
CREATE INDEX IF NOT EXISTS idx_community_resources_archived
  ON public.community_resources (community_id, archived_at);

-- Resource events table for tracking
CREATE TABLE public.community_resource_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.community_resources(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view', 'download', 'click')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_resource_events_resource ON public.community_resource_events (resource_id, event_type);
CREATE INDEX idx_resource_events_member ON public.community_resource_events (member_id);

ALTER TABLE public.community_resource_events ENABLE ROW LEVEL SECURITY;

-- Members can insert their own events
CREATE POLICY "Members can track own events"
  ON public.community_resource_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.id = community_resource_events.member_id
        AND cm.user_id = auth.uid()
        AND cm.community_id = community_resource_events.community_id
        AND cm.status = 'ACTIVE'
    )
  );

-- Members can read events in their community
CREATE POLICY "Members can read community events"
  ON public.community_resource_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.community_id = community_resource_events.community_id
        AND cm.status = 'ACTIVE'
    )
  );

-- Trigger to auto-increment counters
CREATE OR REPLACE FUNCTION public.fn_increment_resource_event_count()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.event_type = 'download' THEN
    UPDATE community_resources SET download_count = download_count + 1 WHERE id = NEW.resource_id;
  ELSIF NEW.event_type = 'click' THEN
    UPDATE community_resources SET click_count = click_count + 1 WHERE id = NEW.resource_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resource_event_count
  AFTER INSERT ON public.community_resource_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_increment_resource_event_count();
