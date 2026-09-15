with corrected_labels as (
  select * from (values
    ('0700000', 'Basilan'),
    ('3600000', 'Lanao del Sur'),
    ('7000000', 'Tawi-Tawi'),
    ('8700000', 'Maguindanao del Norte'),
    ('8800000', 'Maguindanao del Sur'),
    ('9900000', 'Special Geographic Area')
  ) as labels(province_code, province)
)
update public.comelec_er_records record
set province = labels.province,
    updated_at = now()
from public.comelec_er_queue queue
join corrected_labels labels on labels.province_code = queue.province_code
where record.precinct_id = queue.precinct_id
  and record.province is distinct from labels.province;
