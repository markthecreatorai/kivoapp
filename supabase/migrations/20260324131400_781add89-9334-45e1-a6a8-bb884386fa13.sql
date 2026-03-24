-- First check if old job still exists and remove it
SELECT cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'subscription-health-daily' OR j.command LIKE '%subscription-health%';