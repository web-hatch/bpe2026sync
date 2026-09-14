select cron.unschedule(jobid)
from cron.job
where jobname = 'comelec-er-sync-every-minute';

select cron.schedule(
  'comelec-er-sync-every-minute',
  '* * * * *',
  $command$
    select net.http_post(
      url := 'https://xgurpnhsxmmfsrcnzxiw.supabase.co/functions/v1/sync-comelec-ers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-comelec-sync-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'comelec_sync_secret'
          limit 1
        )
      ),
      body := '{"discovery_limit":20,"er_limit":40}'::jsonb,
      timeout_milliseconds := 120000
    );
  $command$
);
