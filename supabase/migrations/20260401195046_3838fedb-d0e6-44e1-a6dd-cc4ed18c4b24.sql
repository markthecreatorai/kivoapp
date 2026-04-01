
-- Add parent_event_id to link recurring child events
ALTER TABLE public.community_events
ADD COLUMN IF NOT EXISTS parent_event_id uuid REFERENCES public.community_events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_community_events_parent ON public.community_events(parent_event_id);

-- Function to generate recurring occurrences from a parent event
CREATE OR REPLACE FUNCTION public.generate_recurring_occurrences(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event record;
  v_rule jsonb;
  v_interval_val integer;
  v_unit text;
  v_end_type text;
  v_end_date date;
  v_end_after integer;
  v_days text[];
  v_current_start timestamptz;
  v_current_end timestamptz;
  v_duration interval;
  v_count integer := 0;
  v_max integer := 52; -- safety cap
  v_day_of_week integer;
  v_target_dow integer;
  v_day text;
  v_dow_map jsonb := '{"Mon":1,"Tue":2,"Wed":3,"Thu":4,"Fri":5,"Sat":6,"Sun":0}'::jsonb;
BEGIN
  -- Fetch parent event
  SELECT * INTO v_event FROM community_events WHERE id = p_event_id AND is_recurring = true;
  IF v_event IS NULL THEN
    RETURN 0;
  END IF;

  -- Delete existing children (regenerate)
  DELETE FROM community_events WHERE parent_event_id = p_event_id;

  -- Parse recurrence rule
  v_rule := v_event.recurrence_rule::jsonb;
  v_interval_val := COALESCE((v_rule->>'every')::integer, 1);
  v_unit := COALESCE(v_rule->>'unit', 'week');
  v_end_type := COALESCE(v_rule->>'end', 'never');
  v_end_date := CASE WHEN v_rule->>'endDate' IS NOT NULL AND v_rule->>'endDate' != '' 
                THEN (v_rule->>'endDate')::date ELSE NULL END;
  v_end_after := CASE WHEN (v_rule->>'endAfter') IS NOT NULL 
                 THEN (v_rule->>'endAfter')::integer ELSE v_max END;

  -- Calculate duration
  IF v_event.ends_at IS NOT NULL THEN
    v_duration := v_event.ends_at - v_event.starts_at;
  ELSE
    v_duration := interval '1 hour';
  END IF;

  -- Cap occurrences
  IF v_end_type = 'never' THEN
    v_end_after := v_max;
  END IF;
  IF v_end_after > v_max THEN
    v_end_after := v_max;
  END IF;

  v_current_start := v_event.starts_at;

  -- Generate occurrences
  FOR i IN 1..v_end_after LOOP
    -- Advance by interval
    IF v_unit = 'week' THEN
      v_current_start := v_current_start + (v_interval_val * interval '1 week');
    ELSIF v_unit = 'month' THEN
      v_current_start := v_current_start + (v_interval_val * interval '1 month');
    END IF;

    -- Check end date
    IF v_end_type = 'on' AND v_end_date IS NOT NULL AND v_current_start::date > v_end_date THEN
      EXIT;
    END IF;

    v_current_end := v_current_start + v_duration;

    INSERT INTO community_events (
      community_id, created_by, title, description, starts_at, ends_at,
      is_all_day, timezone, meeting_url, meeting_platform, cover_image_url,
      is_recurring, recurrence_rule, location_type, location_value,
      duration_minutes, access_rule, access_value, remind_email_before,
      parent_event_id, status
    ) VALUES (
      v_event.community_id, v_event.created_by, v_event.title, v_event.description,
      v_current_start, v_current_end,
      v_event.is_all_day, v_event.timezone, v_event.meeting_url, v_event.meeting_platform,
      v_event.cover_image_url,
      false, NULL, v_event.location_type, v_event.location_value,
      v_event.duration_minutes, v_event.access_rule, v_event.access_value,
      v_event.remind_email_before,
      p_event_id, 'UPCOMING'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
