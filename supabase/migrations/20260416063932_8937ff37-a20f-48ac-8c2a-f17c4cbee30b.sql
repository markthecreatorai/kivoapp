
CREATE TABLE public.community_post_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, member_id)
);

ALTER TABLE public.community_post_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage their own post subscriptions"
  ON public.community_post_subscriptions
  FOR ALL
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.community_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.community_members WHERE user_id = auth.uid()
    )
  );
