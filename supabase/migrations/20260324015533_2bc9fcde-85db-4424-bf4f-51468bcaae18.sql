
-- Email campaigns table
CREATE TABLE public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  segment_id UUID REFERENCES public.email_segments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','failed','canceled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign recipients tracking
CREATE TABLE public.campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, lead_id)
);

-- Add has_purchased and abandoned_cart filters to segments
ALTER TABLE public.email_segments ADD COLUMN IF NOT EXISTS is_dynamic BOOLEAN NOT NULL DEFAULT true;

-- RLS for email_campaigns
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own workspace campaigns"
  ON public.email_campaigns FOR ALL
  TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- RLS for campaign_recipients
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own campaign recipients"
  ON public.campaign_recipients FOR ALL
  TO authenticated
  USING (campaign_id IN (
    SELECT id FROM public.email_campaigns WHERE workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  ))
  WITH CHECK (campaign_id IN (
    SELECT id FROM public.email_campaigns WHERE workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  ));

-- Indexes
CREATE INDEX idx_email_campaigns_workspace ON public.email_campaigns(workspace_id);
CREATE INDEX idx_email_campaigns_status ON public.email_campaigns(status);
CREATE INDEX idx_campaign_recipients_campaign ON public.campaign_recipients(campaign_id);
CREATE INDEX idx_campaign_recipients_status ON public.campaign_recipients(campaign_id, status);
