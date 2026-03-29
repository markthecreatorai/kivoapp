-- =============================================================
-- Fase 1 & 5: Community Invite Links
-- =============================================================
CREATE TABLE IF NOT EXISTS community_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid REFERENCES communities(id) ON DELETE CASCADE,
  created_by uuid REFERENCES community_members(id) ON DELETE SET NULL,
  code text UNIQUE DEFAULT substr(md5(random()::text), 0, 9),
  max_uses int,
  uses_count int DEFAULT 0,
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_links_community ON community_invite_links(community_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_code ON community_invite_links(code);

-- RLS
ALTER TABLE community_invite_links ENABLE ROW LEVEL SECURITY;

-- Admins can manage their own links
CREATE POLICY "Admins manage invite links" ON community_invite_links
  USING (
    community_id IN (
      SELECT community_id FROM community_members
      WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN')
    )
  );

-- Anyone can read active links (for validation during join)
CREATE POLICY "Anyone can read active invite links" ON community_invite_links
  FOR SELECT USING (is_active = true);

-- =============================================================
-- Fase 2: Member profile fields
-- =============================================================
ALTER TABLE community_members
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{
    "likes": true,
    "comments": true,
    "dms": true,
    "events": true,
    "announcements": true
  }'::jsonb;

-- =============================================================
-- Fase 3: Lesson progress tracking
-- =============================================================
CREATE TABLE IF NOT EXISTS circle_lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES circle_lessons(id) ON DELETE CASCADE,
  member_id uuid REFERENCES community_members(id) ON DELETE CASCADE,
  completed_at timestamptz,
  progress_pct int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(lesson_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_member ON circle_lesson_progress(member_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson ON circle_lesson_progress(lesson_id);

-- RLS
ALTER TABLE circle_lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage own lesson progress" ON circle_lesson_progress
  USING (
    member_id IN (
      SELECT id FROM community_members WHERE user_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_lesson_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lesson_progress_updated_at
  BEFORE UPDATE ON circle_lesson_progress
  FOR EACH ROW EXECUTE FUNCTION update_lesson_progress_updated_at();

-- =============================================================
-- Fase 4: Community Discovery fields
-- =============================================================
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS is_listed boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS idx_communities_listed ON communities(is_listed, is_active);
