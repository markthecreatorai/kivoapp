
-- DM Conversations
CREATE TABLE public.community_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.community_conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.community_conversations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  UNIQUE(conversation_id, member_id)
);

CREATE TABLE public.community_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.community_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Reports
CREATE TABLE public.community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE SET NULL,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE SET NULL,
  target_member_id UUID REFERENCES public.community_members(id) ON DELETE SET NULL,
  reason TEXT NOT NULL DEFAULT 'spam',
  details TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.community_members(id),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Moderation logs (audit)
CREATE TABLE public.community_moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  moderator_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  target_member_id UUID REFERENCES public.community_members(id),
  action TEXT NOT NULL,
  reason TEXT,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE SET NULL,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spam tracking
CREATE TABLE public.community_spam_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL DEFAULT 'post',
  content_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_spam_log_member_time ON public.community_spam_log(member_id, created_at DESC);
CREATE INDEX idx_reports_status ON public.community_reports(community_id, status);
CREATE INDEX idx_messages_conv ON public.community_messages(conversation_id, created_at);
CREATE INDEX idx_conv_members ON public.community_conversation_members(member_id);

-- RLS
ALTER TABLE public.community_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_moderation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_spam_log ENABLE ROW LEVEL SECURITY;

-- Helper: check if user is in a conversation
CREATE OR REPLACE FUNCTION public.is_conversation_member(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_conversation_members ccm
    JOIN community_members cm ON cm.id = ccm.member_id
    WHERE ccm.conversation_id = _conversation_id
      AND cm.user_id = _user_id
  )
$$;

-- Conversations: members can see their own
CREATE POLICY "Members see own conversations" ON public.community_conversations
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(auth.uid(), id));

CREATE POLICY "Members create conversations" ON public.community_conversations
  FOR INSERT TO authenticated
  WITH CHECK (community_id IN (SELECT public.get_community_ids_for_user(auth.uid())));

-- Conversation members
CREATE POLICY "Members see conv members" ON public.community_conversation_members
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(auth.uid(), conversation_id));

CREATE POLICY "Members add conv members" ON public.community_conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_conversation_member(auth.uid(), conversation_id)
    OR conversation_id IN (
      SELECT id FROM community_conversations WHERE community_id IN (SELECT public.get_community_ids_for_user(auth.uid()))
    ));

-- Messages
CREATE POLICY "Members see messages" ON public.community_messages
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(auth.uid(), conversation_id));

CREATE POLICY "Members send messages" ON public.community_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_conversation_member(auth.uid(), conversation_id)
    AND sender_id IN (SELECT public.get_community_member_ids_for_user(auth.uid()))
  );

-- Reports: anyone active can create, admins can view
CREATE POLICY "Members create reports" ON public.community_reports
  FOR SELECT TO authenticated
  USING (community_id IN (SELECT public.get_community_ids_for_user(auth.uid())));

CREATE POLICY "Members insert reports" ON public.community_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id IN (SELECT public.get_community_member_ids_for_user(auth.uid()))
  );

CREATE POLICY "Admins update reports" ON public.community_reports
  FOR UPDATE TO authenticated
  USING (community_id IN (SELECT public.get_community_ids_for_user(auth.uid())));

-- Moderation logs: admins can see
CREATE POLICY "Members see mod logs" ON public.community_moderation_logs
  FOR SELECT TO authenticated
  USING (community_id IN (SELECT public.get_community_ids_for_user(auth.uid())));

CREATE POLICY "Mods insert logs" ON public.community_moderation_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    moderator_id IN (SELECT public.get_community_member_ids_for_user(auth.uid()))
  );

-- Spam log: system/member insert
CREATE POLICY "Members see own spam" ON public.community_spam_log
  FOR SELECT TO authenticated
  USING (community_id IN (SELECT public.get_community_ids_for_user(auth.uid())));

CREATE POLICY "Members insert spam log" ON public.community_spam_log
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT public.get_community_member_ids_for_user(auth.uid()))
  );
