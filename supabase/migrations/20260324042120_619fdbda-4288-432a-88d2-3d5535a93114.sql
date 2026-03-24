
-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule ops-alerts to run every 5 minutes
SELECT cron.schedule(
  'ops-alerts-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://wfuwenylojhabresnrvi.supabase.co/functions/v1/ops-alerts',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmdXdlbnlsb2poYWJyZXNucnZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMTQ3NzEsImV4cCI6MjA4ODU5MDc3MX0._1kAuL6VJYuWJvqWmu9EuQqHwCW5OL_AxyMdXXz-lps"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
