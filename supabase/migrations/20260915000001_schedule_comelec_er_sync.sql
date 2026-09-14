create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.configure_comelec_er_sync_schedule(p_sync_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault, cron, net
as $$
declare
  secret_id uuid;
begin
  select id into secret_id
  from vault.secrets
  where name = 'comelec_sync_secret'
  limit 1;

  if secret_id is null then
    perform vault.create_secret(p_sync_secret, 'comelec_sync_secret', 'Internal authorization for the COMELEC ER sync scheduler');
  else
    perform vault.update_secret(secret_id, p_sync_secret, 'comelec_sync_secret', 'Internal authorization for the COMELEC ER sync scheduler');
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'comelec-er-sync-every-minute';

  perform cron.schedule(
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
        body := '{"discovery_limit":8,"er_limit":25}'::jsonb,
        timeout_milliseconds := 120000
      );
    $command$
  );
end;
$$;

revoke all on function public.configure_comelec_er_sync_schedule(text) from public;
