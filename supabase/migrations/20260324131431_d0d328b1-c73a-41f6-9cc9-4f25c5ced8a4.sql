SELECT cron.schedule(
  'subscription-health-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url:='https://wfuwenylojhabresnrvi.supabase.co/functions/v1/subscription-health-daily',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'kivo_cron_9f2a7c1e4b6d8a0f3c5e7a9b1d2f4c6'
    ),
    body:='{"source":"cron"}'::jsonb
  ) as request_id;
  $$
);