with params as (
  select 'OLD-STUDENT-UUID'::uuid as student_id
)
select jsonb_build_object(
  'checkins', coalesce((
    select jsonb_agg(to_jsonb(c) order by c.date, c.created_at)
    from student_checkin c, params
    where c.student_id = params.student_id
  ), '[]'::jsonb),
  'assessments', coalesce((
    select jsonb_agg(to_jsonb(a))
    from checkin_assessment a, params
    where a.student_id = params.student_id
  ), '[]'::jsonb),
  'photos', coalesce((
    select jsonb_agg(to_jsonb(p))
    from student_checkin_photo p
    join student_checkin c on c.id = p.checkin_id, params
    where c.student_id = params.student_id
  ), '[]'::jsonb),
  'evaluations', coalesce((
    select jsonb_agg(to_jsonb(e))
    from checkin_evaluation e, params
    where e.student_id = params.student_id
  ), '[]'::jsonb)
)::text as backup;
