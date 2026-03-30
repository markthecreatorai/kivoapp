
-- 1. Referral profiles
CREATE TABLE public.referral_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT UNIQUE NOT NULL,
  referral_link TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.referral_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral profile"
ON public.referral_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Public active referral codes"
ON public.referral_profiles FOR SELECT
USING (status = 'active');

-- 2. Referral attributions
CREATE TABLE public.referral_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID REFERENCES auth.users(id),
  referred_user_id UUID REFERENCES auth.users(id),
  referral_code TEXT NOT NULL,
  source TEXT,
  clicked_at TIMESTAMPTZ,
  signed_up_at TIMESTAMPTZ,
  trial_started_at TIMESTAMPTZ,
  first_paid_at TIMESTAMPTZ,
  attribution_status TEXT DEFAULT 'pending',
  lock_status TEXT DEFAULT 'locked',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral attributions"
ON public.referral_attributions FOR SELECT
USING (auth.uid() = referrer_user_id);

-- 3. Referral commissions ledger
CREATE TABLE public.referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID REFERENCES auth.users(id),
  referred_user_id UUID REFERENCES auth.users(id),
  subscription_id UUID,
  payment_id UUID,
  commission_rate DECIMAL(5,4) DEFAULT 0.20,
  gross_base_amount DECIMAL(10,2),
  commission_amount DECIMAL(10,2),
  currency TEXT DEFAULT 'BRL',
  status TEXT DEFAULT 'pending',
  available_at TIMESTAMPTZ,
  payout_id UUID,
  event_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own commissions"
ON public.referral_commissions FOR SELECT
USING (auth.uid() = referrer_user_id);

-- 4. Payout profiles
CREATE TABLE public.referral_payout_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  payout_method TEXT,
  payout_details JSONB,
  status TEXT DEFAULT 'pending_verification',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.referral_payout_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own payout profile"
ON public.referral_payout_profiles FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. Payout batches
CREATE TABLE public.referral_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID REFERENCES auth.users(id),
  total_amount DECIMAL(10,2),
  items_count INTEGER,
  payout_method TEXT,
  payout_status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  provider_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payouts"
ON public.referral_payouts FOR SELECT
USING (auth.uid() = referrer_user_id);
