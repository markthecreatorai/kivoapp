
-- Enable pg_cron and pg_net for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily subscription health check at 8am UTC
SELECT cron.schedule(
  'subscription-health-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url:='https://wfuwenylojhabresnrvi.supabase.co/functions/v1/subscription-health-daily',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmdXdlbnlsb2poYWJyZXNucnZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMTQ3NzEsImV4cCI6MjA4ODU5MDc3MX0._1kAuL6VJYuWJvqWmu9EuQqHwCW5OL_AxyMdXXz-lps"}'::jsonb,
    body:='{"source":"cron"}'::jsonb
  ) as request_id;
  $$
);
