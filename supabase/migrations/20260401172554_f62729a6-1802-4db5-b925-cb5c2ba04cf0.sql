
-- Global chat preferences
CREATE TABLE public.user_chat_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chat_notifications_enabled boolean NOT NULL DEFAULT true,
  chat_email_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.user_chat_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat prefs" ON public.user_chat_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chat prefs" ON public.user_chat_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own chat prefs" ON public.user_chat_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own chat prefs" ON public.user_chat_preferences FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_user_chat_preferences_updated_at
  BEFORE UPDATE ON public.user_chat_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-community chat preferences
CREATE TABLE public.community_chat_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  chat_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, community_id)
);

ALTER TABLE public.community_chat_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own community chat prefs" ON public.community_chat_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own community chat prefs" ON public.community_chat_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own community chat prefs" ON public.community_chat_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own community chat prefs" ON public.community_chat_preferences FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_community_chat_preferences_updated_at
  BEFORE UPDATE ON public.community_chat_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Blocked users
CREATE TABLE public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  blocked_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, blocked_user_id)
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks" ON public.blocked_users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own blocks" ON public.blocked_users FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own blocks" ON public.blocked_users FOR DELETE USING (auth.uid() = user_id);
