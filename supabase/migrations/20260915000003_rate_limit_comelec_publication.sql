alter table public.comelec_publication_state
  add column if not exists last_attempted_at timestamptz;
