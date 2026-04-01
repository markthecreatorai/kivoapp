
-- Global notification preferences
CREATE TABLE public.user_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  new_follower_enabled boolean NOT NULL DEFAULT true,
  likes_enabled boolean NOT NULL DEFAULT true,
  kaching_enabled boolean NOT NULL DEFAULT true,
  affiliate_referral_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification prefs"
  ON public.user_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification prefs"
  ON public.user_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification prefs"
  ON public.user_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification prefs"
  ON public.user_notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_notification_preferences_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-community notification preferences
CREATE TABLE public.community_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  digest_frequency text NOT NULL DEFAULT 'daily',
  notifications_frequency text NOT NULL DEFAULT 'daily',
  admin_announcements_enabled boolean NOT NULL DEFAULT true,
  event_reminder_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, community_id)
);

ALTER TABLE public.community_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own community notification prefs"
  ON public.community_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own community notification prefs"
  ON public.community_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own community notification prefs"
  ON public.community_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own community notification prefs"
  ON public.community_notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_community_notification_preferences_updated_at
  BEFORE UPDATE ON public.community_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger for frequency values
CREATE OR REPLACE FUNCTION public.fn_validate_notification_frequencies()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.digest_frequency NOT IN ('daily', 'weekly', 'monthly', 'never') THEN
    RAISE EXCEPTION 'digest_frequency must be daily, weekly, monthly, or never';
  END IF;
  IF NEW.notifications_frequency NOT IN ('hourly', 'daily', 'weekly', 'never') THEN
    RAISE EXCEPTION 'notifications_frequency must be hourly, daily, weekly, or never';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_community_notification_prefs
  BEFORE INSERT OR UPDATE ON public.community_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_notification_frequencies();
