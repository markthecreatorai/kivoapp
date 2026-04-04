
-- 1. Member invite links (personal per member)
CREATE TABLE IF NOT EXISTS public.member_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  code text NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  uses_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, community_id),
  UNIQUE(code)
);

CREATE INDEX idx_member_invite_links_code ON public.member_invite_links(code);
CREATE INDEX idx_member_invite_links_community ON public.member_invite_links(community_id);

ALTER TABLE public.member_invite_links ENABLE ROW LEVEL SECURITY;

-- Members can view their own links
CREATE POLICY "Members view own invite links" ON public.member_invite_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.id = member_invite_links.member_id AND cm.user_id = auth.uid()
    )
  );

-- Members can create their own link
CREATE POLICY "Members create own invite link" ON public.member_invite_links
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.id = member_invite_links.member_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );

-- Members can update their own link (uses_count)
CREATE POLICY "Members update own invite link" ON public.member_invite_links
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.id = member_invite_links.member_id AND cm.user_id = auth.uid()
    )
  );

-- Anyone can read active links for join validation
CREATE POLICY "Anyone read active member invite links" ON public.member_invite_links
  FOR SELECT USING (is_active = true);

-- 2. Invite events (tracking)
CREATE TABLE IF NOT EXISTS public.invite_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_link_id uuid NOT NULL REFERENCES public.member_invite_links(id) ON DELETE CASCADE,
  inviter_member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  invitee_user_id uuid NOT NULL,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'joined',
  points_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invitee_user_id, community_id, event_type)
);

CREATE INDEX idx_invite_events_inviter ON public.invite_events(inviter_member_id);
CREATE INDEX idx_invite_events_community ON public.invite_events(community_id);

ALTER TABLE public.invite_events ENABLE ROW LEVEL SECURITY;

-- Inviters can view their own events
CREATE POLICY "Inviters view own events" ON public.invite_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.id = invite_events.inviter_member_id AND cm.user_id = auth.uid()
    )
  );

-- System inserts (via service role or authenticated with checks)
CREATE POLICY "Authenticated insert invite events" ON public.invite_events
  FOR INSERT TO authenticated
  WITH CHECK (
    invitee_user_id = auth.uid()
    AND inviter_member_id != (
      SELECT cm.id FROM public.community_members cm
      WHERE cm.community_id = invite_events.community_id AND cm.user_id = auth.uid()
      LIMIT 1
    )
  );

-- Admins can view all events in their community
CREATE POLICY "Admins view community events" ON public.invite_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = invite_events.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
    )
  );

-- 3. Invite rewards config (per community)
CREATE TABLE IF NOT EXISTS public.invite_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE UNIQUE,
  points_per_invite integer NOT NULL DEFAULT 10,
  points_per_paid_invite integer NOT NULL DEFAULT 50,
  reward_type text NOT NULL DEFAULT 'points',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_rewards ENABLE ROW LEVEL SECURITY;

-- Anyone can read active rewards config (needed for join flow)
CREATE POLICY "Anyone read active invite rewards" ON public.invite_rewards
  FOR SELECT USING (true);

-- Admins can manage rewards
CREATE POLICY "Admins manage invite rewards" ON public.invite_rewards
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = invite_rewards.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = invite_rewards.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
    )
  );
