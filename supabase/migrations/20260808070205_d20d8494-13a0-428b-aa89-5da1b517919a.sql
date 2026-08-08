ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS external_transfer_id text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payout_requests_status_created
  ON public.payout_requests (status, created_at);