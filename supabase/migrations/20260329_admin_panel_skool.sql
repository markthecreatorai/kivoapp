-- Migration: Admin Panel Skool-style
-- Adds pricing model, affiliate commissions, plugins config, community tabs config,
-- discovery settings, and payout info to the communities table

-- Pricing model (replaces access_type for Skool-style pricing)
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS pricing_model text NOT NULL DEFAULT 'free'
    CHECK (pricing_model IN ('free', 'subscription', 'freemium', 'tiers', 'one_time')),
  ADD COLUMN IF NOT EXISTS price_monthly_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_yearly_cents  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_options text NOT NULL DEFAULT 'monthly_and_annual'
    CHECK (billing_options IN ('monthly_only', 'monthly_and_annual', 'annual_only')),
  ADD COLUMN IF NOT EXISTS free_trial_days integer NOT NULL DEFAULT 0;

-- Affiliate commissions
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS affiliate_commission_pct integer NOT NULL DEFAULT 0
    CHECK (affiliate_commission_pct IN (0, 10, 20, 30, 40, 50));

-- Plugins config (jsonb map of plugin_key -> enabled boolean)
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS plugins_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Community tabs visibility config
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS tabs_config jsonb NOT NULL DEFAULT '{
    "feed": true,
    "classroom": true,
    "members": true,
    "leaderboard": true,
    "events": true,
    "about": true
  }'::jsonb;

-- Community rules (array of rule strings)
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS community_rules jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Discovery settings
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS discovery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discovery_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS discovery_category text DEFAULT NULL;

-- Payout / bank info (stored encrypted-ish as jsonb — replace with proper vault in prod)
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS payout_info jsonb DEFAULT NULL;

-- Index for discovery queries
CREATE INDEX IF NOT EXISTS idx_communities_discovery
  ON communities (discovery_enabled, is_active)
  WHERE discovery_enabled = true AND is_active = true;
