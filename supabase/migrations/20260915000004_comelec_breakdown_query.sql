create or replace function public.comelec_breakdown(
  p_level text,
  p_province text,
  p_municipality text default null,
  p_barangay text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select
      entry.category_key,
      entry.contest_name,
      entry.candidate_name,
      entry.ballot_order,
      entry.votes,
      case p_level
        when 'municipality' then record.municipality
        when 'barangay' then record.barangay
        when 'precinct' then record.precinct_id
      end as column_name
    from public.comelec_er_entries entry
    join public.comelec_er_records record using (precinct_id)
    where record.province = p_province
      and (
        (p_level = 'municipality' and p_municipality is null and p_barangay is null)
        or (p_level = 'barangay' and record.municipality = p_municipality and p_barangay is null)
        or (p_level = 'precinct' and record.municipality = p_municipality and record.barangay = p_barangay)
      )
  ), totals as (
    select
      category_key,
      contest_name,
      candidate_name,
      min(ballot_order) as ballot_order,
      jsonb_object_agg(column_name, votes) as votes,
      sum(votes) as total
    from (
      select category_key, contest_name, candidate_name, ballot_order, column_name, sum(votes) as votes
      from filtered
      group by category_key, contest_name, candidate_name, ballot_order, column_name
    ) grouped
    group by category_key, contest_name, candidate_name
  )
  select jsonb_build_object(
    'columns', coalesce((select jsonb_agg(column_name order by column_name) from (select distinct column_name from filtered) columns), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'category_key', category_key,
          'contest_name', contest_name,
          'name', candidate_name,
          'ballot_order', ballot_order,
          'votes', votes,
          'total', total
        ) order by category_key, contest_name, ballot_order, candidate_name
      ) from totals
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.comelec_breakdown(text, text, text, text) from public;
