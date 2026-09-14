alter table public.comelec_er_records
  add column if not exists province text,
  add column if not exists municipality text,
  add column if not exists barangay text,
  add column if not exists cast_votes bigint not null default 0,
  add column if not exists registered_voters bigint not null default 0;

create table if not exists public.comelec_er_entries (
  precinct_id text not null references public.comelec_er_records (precinct_id) on delete cascade,
  category_key text not null check (category_key in ('party_list', 'sectoral', 'district')),
  contest_name text not null,
  candidate_name text not null,
  ballot_order integer not null,
  votes bigint not null default 0,
  primary key (precinct_id, category_key, contest_name, candidate_name)
);

create index if not exists comelec_er_entries_category_idx
  on public.comelec_er_entries (category_key, contest_name, ballot_order);
create index if not exists comelec_er_entries_precinct_idx
  on public.comelec_er_entries (precinct_id);

create table if not exists public.comelec_publication_state (
  id boolean primary key default true check (id),
  last_published_at timestamptz,
  published_returns integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.comelec_publication_state (id)
values (true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('comelec-dashboard-public', 'comelec-dashboard-public', true)
on conflict (id) do update set public = true;

create or replace function public.comelec_category_contests(p_category text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with candidate_totals as (
    select contest_name, candidate_name, min(ballot_order) as ballot_order, sum(votes) as votes
    from public.comelec_er_entries
    where category_key = p_category
    group by contest_name, candidate_name
  ), contests as (
    select contest_name,
      jsonb_agg(
        jsonb_build_object('name', candidate_name, 'votes', votes, 'ballot_order', ballot_order)
        order by ballot_order, candidate_name
      ) as candidates
    from candidate_totals
    group by contest_name
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('contest_name', contest_name, 'candidates', candidates) order by contest_name),
    '[]'::jsonb
  )
  from contests;
$$;

create or replace function public.comelec_category_candidates(p_category text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select contest_name, candidate_name, min(ballot_order) as ballot_order, sum(votes) as votes
    from public.comelec_er_entries
    where category_key = p_category
    group by contest_name, candidate_name
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('name', candidate_name, 'votes', votes, 'ballot_order', ballot_order, 'contest_name', contest_name)
      order by contest_name, ballot_order, candidate_name
    ),
    '[]'::jsonb
  )
  from totals;
$$;

create or replace function public.comelec_province_rows(p_category text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with by_province as (
    select entry.category_key, entry.contest_name, entry.candidate_name, min(entry.ballot_order) as ballot_order,
      record.province, sum(entry.votes) as votes
    from public.comelec_er_entries entry
    join public.comelec_er_records record using (precinct_id)
    where entry.category_key = p_category
    group by entry.category_key, entry.contest_name, entry.candidate_name, record.province
  ), rows as (
    select contest_name, candidate_name, min(ballot_order) as ballot_order,
      jsonb_object_agg(province, votes) as province_votes, sum(votes) as total
    from by_province
    group by contest_name, candidate_name
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', candidate_name,
        'contest_name', contest_name,
        'ballot_order', ballot_order,
        'province_votes', province_votes,
        'total', total
      ) order by contest_name, ballot_order, candidate_name
    ),
    '[]'::jsonb
  )
  from rows;
$$;

create or replace function public.comelec_dashboard_root()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select
      count(*)::integer as processed_files,
      coalesce(sum(cast_votes), 0) as total_cast_votes,
      coalesce(sum(registered_voters), 0) as total_registered_voters
    from public.comelec_er_records
  )
  select jsonb_build_object(
    'generated_at', now(),
    'source', 'Downloaded COMELEC election-return JSON files',
    'processed_files', totals.processed_files,
    'total_er', 5212,
    'total_cast_votes', totals.total_cast_votes,
    'total_registered_voters', totals.total_registered_voters,
    'complete', totals.processed_files >= 5212,
    'categories', jsonb_build_object(
      'party_list', jsonb_build_object('label', 'Party-list', 'contests', public.comelec_category_contests('party_list'), 'candidates', public.comelec_category_candidates('party_list')),
      'sectoral', jsonb_build_object('label', 'Sectoral Representatives', 'contests', public.comelec_category_contests('sectoral'), 'candidates', public.comelec_category_candidates('sectoral')),
      'district', jsonb_build_object('label', 'District Representatives', 'contests', public.comelec_category_contests('district'), 'candidates', public.comelec_category_candidates('district'))
    ),
    'province_breakdown', jsonb_build_object(
      'provinces', jsonb_build_array('Basilan', 'Lanao del Sur', 'Maguindanao del Norte', 'Maguindanao del Sur', 'Special Geographic Area', 'Tawi-Tawi'),
      'party_list', public.comelec_province_rows('party_list'),
      'sectoral', public.comelec_province_rows('sectoral'),
      'district', public.comelec_province_rows('district')
    )
  )
  from totals;
$$;

revoke all on function public.comelec_category_contests(text) from public;
revoke all on function public.comelec_category_candidates(text) from public;
revoke all on function public.comelec_province_rows(text) from public;
revoke all on function public.comelec_dashboard_root() from public;
