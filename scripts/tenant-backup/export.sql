with params as (
  select s.id as student_id, s.clinic_id, s.user_id as student_user_id
  from student s
  where s.id = 'STUDENT-UUID'::uuid
),
diet_trees as (
  select v.tree::text as tree
  from student_diet_version v
  join student_diet sd on sd.id = v.student_diet_id, params
  where sd.student_id = params.student_id
),
workout_trees as (
  select v.tree::text as tree
  from student_workout_version v
  join student_workout sw on sw.id = v.student_workout_id, params
  where sw.student_id = params.student_id
),
foods as (
  select f.*
  from food f, params
  where f.clinic_id = params.clinic_id
    and exists (select 1 from diet_trees d where position(f.id::text in d.tree) > 0)
),
exercises as (
  select e.*
  from exercise e, params
  where e.clinic_id = params.clinic_id
    and exists (select 1 from workout_trees w where position(e.id::text in w.tree) > 0)
),
checkins as (
  select c.*
  from student_checkin c, params
  where c.student_id = params.student_id
),
conversations as (
  select c.*
  from whatsapp_conversation c, params
  where c.student_id = params.student_id
)
select jsonb_build_object(
  'student_id', (select student_id from params),
  'clinic_id', (select clinic_id from params),
  'student_user_id', (select student_user_id from params),
  'clinic_user_ids', (
    select coalesce(jsonb_agg(u.id), '[]')
    from "user" u, params
    where (u.clinic_id = params.clinic_id
        or u.id in (select c.owner_user_id from clinic c where c.id = params.clinic_id))
      and u.id is distinct from params.student_user_id
  ),
  'exported_at', now(),
  'catalog', jsonb_build_object(
    'food', (select coalesce(jsonb_object_agg(id, code), '{}') from food where clinic_id is null and code is not null),
    'exercise', (select coalesce(jsonb_object_agg(id, code), '{}') from exercise where clinic_id is null and code is not null),
    'food_group', (select coalesce(jsonb_object_agg(id, slug), '{}') from food_group)
  ),
  'food', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from foods t),
  'food_nutrient', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from food_nutrient t where t.food_id in (select id from foods)),
  'food_measure', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from food_measure t where t.food_id in (select id from foods)),
  'exercise', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from exercises t),
  'student_anamnesis', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_anamnesis t, params where t.student_id = params.student_id),
  'ai_generation', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from ai_generation t, params where t.student_id = params.student_id),
  'student_diet', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_diet t, params where t.student_id = params.student_id),
  'student_diet_version', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_diet_version t join student_diet sd on sd.id = t.student_diet_id, params where sd.student_id = params.student_id),
  'student_workout', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_workout t, params where t.student_id = params.student_id),
  'student_workout_version', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_workout_version t join student_workout sw on sw.id = t.student_workout_id, params where sw.student_id = params.student_id),
  'student_checkin', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from checkins t),
  'checkin_assessment', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from checkin_assessment t, params where t.student_id = params.student_id),
  'student_checkin_photo', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_checkin_photo t where t.checkin_id in (select id from checkins)),
  'checkin_evaluation', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from checkin_evaluation t, params where t.student_id = params.student_id),
  'student_note', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_note t, params where t.student_id = params.student_id),
  'calendar_event', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from calendar_event t, params where t.student_id = params.student_id),
  'whatsapp_conversation', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from conversations t),
  'whatsapp_message', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from whatsapp_message t where t.conversation_id in (select id from conversations))
)::text as backup;
