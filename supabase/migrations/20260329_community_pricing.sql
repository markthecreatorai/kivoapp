-- =============================================================
-- Fase 8: Community Pricing & Billing fields
-- =============================================================
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS billing_period text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS checkout_product_slug text,
  ADD COLUMN IF NOT EXISTS about_video_url text,
  ADD COLUMN IF NOT EXISTS online_count int DEFAULT 0;

-- =============================================================
-- Fase 8: Circle Courses Access Rules
-- =============================================================
ALTER TABLE circle_courses
  ADD COLUMN IF NOT EXISTS access_rule text DEFAULT 'FREE',
  ADD COLUMN IF NOT EXISTS required_level int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS course_price numeric,
  ADD COLUMN IF NOT EXISTS course_product_slug text;

-- Index for discovery queries
CREATE INDEX IF NOT EXISTS idx_communities_slug ON communities(slug, is_active);
