create or replace function public.requeue_failed_comelec_ers_if_due()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  requeued_count integer;
begin
  update public.comelec_er_queue
  set
    status = 'pending',
    attempts = 0,
    locked_at = null,
    updated_at = now()
  where status = 'failed'
    and next_check_at <= now();

  get diagnostics requeued_count = row_count;
  return requeued_count;
end;
$$;

revoke all on function public.requeue_failed_comelec_ers_if_due() from public;
