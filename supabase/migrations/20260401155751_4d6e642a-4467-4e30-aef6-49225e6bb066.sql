
-- Table: community_live_streams
CREATE TABLE public.community_live_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  embed_url text NOT NULL,
  embed_type text NOT NULL DEFAULT 'youtube',
  status text NOT NULL DEFAULT 'SCHEDULED',
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  viewer_count integer NOT NULL DEFAULT 0,
  recording_url text,
  chat_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_live_streams ENABLE ROW LEVEL SECURITY;

-- Validation trigger
CREATE OR REPLACE FUNCTION public.fn_validate_live_stream()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.embed_type NOT IN ('youtube', 'twitch', 'custom') THEN
    RAISE EXCEPTION 'embed_type must be youtube, twitch, or custom';
  END IF;
  IF NEW.status NOT IN ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED') THEN
    RAISE EXCEPTION 'status must be SCHEDULED, LIVE, ENDED, or CANCELLED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_live_stream
BEFORE INSERT OR UPDATE ON public.community_live_streams
FOR EACH ROW EXECUTE FUNCTION public.fn_validate_live_stream();

-- Updated_at trigger
CREATE TRIGGER update_live_streams_updated_at
BEFORE UPDATE ON public.community_live_streams
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: members can view
CREATE POLICY "Members can view community lives"
ON public.community_live_streams FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_live_streams.community_id
      AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
  )
);

-- RLS: owner/admin/mod can insert
CREATE POLICY "Admins can create lives"
ON public.community_live_streams FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_live_streams.community_id
      AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
      AND cm.role IN ('OWNER', 'ADMIN', 'MODERATOR')
  )
);

-- RLS: owner/admin/mod can update
CREATE POLICY "Admins can update lives"
ON public.community_live_streams FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_live_streams.community_id
      AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
      AND cm.role IN ('OWNER', 'ADMIN', 'MODERATOR')
  )
);

-- RLS: owner/admin/mod can delete
CREATE POLICY "Admins can delete lives"
ON public.community_live_streams FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_live_streams.community_id
      AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
      AND cm.role IN ('OWNER', 'ADMIN', 'MODERATOR')
  )
);

-- Table: live_stream_messages (chat)
CREATE TABLE public.live_stream_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.community_live_streams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_stream_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_stream_messages_stream ON public.live_stream_messages(stream_id, created_at);

CREATE POLICY "Members can view stream chat"
ON public.live_stream_messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_live_streams ls
    JOIN community_members cm ON cm.community_id = ls.community_id
    WHERE ls.id = live_stream_messages.stream_id
      AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
  )
);

CREATE POLICY "Members can send chat messages"
ON public.live_stream_messages FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM community_live_streams ls
    JOIN community_members cm ON cm.community_id = ls.community_id
    WHERE ls.id = live_stream_messages.stream_id
      AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
      AND cm.id = live_stream_messages.member_id
  )
);

-- Table: live_stream_viewers
CREATE TABLE public.live_stream_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.community_live_streams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE(stream_id, member_id)
);

ALTER TABLE public.live_stream_viewers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view viewers"
ON public.live_stream_viewers FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_live_streams ls
    JOIN community_members cm ON cm.community_id = ls.community_id
    WHERE ls.id = live_stream_viewers.stream_id
      AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
  )
);

CREATE POLICY "Members can register as viewer"
ON public.live_stream_viewers FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM community_live_streams ls
    JOIN community_members cm ON cm.community_id = ls.community_id
    WHERE ls.id = live_stream_viewers.stream_id
      AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
      AND cm.id = live_stream_viewers.member_id
  )
);

CREATE POLICY "Members can update their viewer record"
ON public.live_stream_viewers FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.id = live_stream_viewers.member_id
      AND cm.user_id = auth.uid()
  )
);

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_viewers;
