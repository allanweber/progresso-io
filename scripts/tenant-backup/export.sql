with params as (
  select 'CLINIC-UUID'::uuid as clinic_id
),
users as (
  select u.*
  from "user" u, params
  where u.clinic_id = params.clinic_id
    or u.id in (select s.user_id from student s where s.clinic_id = params.clinic_id)
    or u.id in (select c.owner_user_id from clinic c where c.id = params.clinic_id)
)
select jsonb_build_object(
  'clinic_id', (select clinic_id from params),
  'exported_at', now(),
  'catalog', jsonb_build_object(
    'food', (select coalesce(jsonb_object_agg(id, code), '{}') from food where clinic_id is null and code is not null),
    'exercise', (select coalesce(jsonb_object_agg(id, code), '{}') from exercise where clinic_id is null and code is not null),
    'food_group', (select coalesce(jsonb_object_agg(id, slug), '{}') from food_group)
  ),
  'clinic', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from clinic t, params where t.id = params.clinic_id),
  'user', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from users t),
  'account', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from account t where t.user_id in (select id from users)),
  'student', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student t, params where t.clinic_id = params.clinic_id),
  'anamnesis', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from anamnesis t, params where t.clinic_id = params.clinic_id),
  'student_anamnesis', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_anamnesis t, params where t.clinic_id = params.clinic_id),
  'ai_generation', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from ai_generation t, params where t.clinic_id = params.clinic_id),
  'food', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from food t, params where t.clinic_id = params.clinic_id),
  'food_nutrient', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from food_nutrient t join food f on f.id = t.food_id, params where f.clinic_id = params.clinic_id),
  'food_measure', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from food_measure t, params where t.clinic_id = params.clinic_id),
  'food_substitution', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from food_substitution t, params where t.clinic_id = params.clinic_id),
  'food_favorite', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from food_favorite t, params where t.clinic_id = params.clinic_id),
  'exercise', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from exercise t, params where t.clinic_id = params.clinic_id),
  'exercise_substitution', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from exercise_substitution t, params where t.clinic_id = params.clinic_id),
  'diet', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from diet t, params where t.clinic_id = params.clinic_id),
  'diet_meal', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from diet_meal t join diet d on d.id = t.diet_id, params where d.clinic_id = params.clinic_id),
  'diet_meal_item', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from diet_meal_item t join diet_meal m on m.id = t.diet_meal_id join diet d on d.id = m.diet_id, params where d.clinic_id = params.clinic_id),
  'diet_meal_item_substitute', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from diet_meal_item_substitute t join diet_meal_item i on i.id = t.diet_meal_item_id join diet_meal m on m.id = i.diet_meal_id join diet d on d.id = m.diet_id, params where d.clinic_id = params.clinic_id),
  'student_diet', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_diet t, params where t.clinic_id = params.clinic_id),
  'student_diet_version', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_diet_version t join student_diet sd on sd.id = t.student_diet_id, params where sd.clinic_id = params.clinic_id),
  'workout', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from workout t, params where t.clinic_id = params.clinic_id),
  'workout_session', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from workout_session t join workout w on w.id = t.workout_id, params where w.clinic_id = params.clinic_id),
  'workout_exercise', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from workout_exercise t join workout_session ws on ws.id = t.workout_session_id join workout w on w.id = ws.workout_id, params where w.clinic_id = params.clinic_id),
  'workout_exercise_substitute', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from workout_exercise_substitute t join workout_exercise we on we.id = t.workout_exercise_id join workout_session ws on ws.id = we.workout_session_id join workout w on w.id = ws.workout_id, params where w.clinic_id = params.clinic_id),
  'student_workout', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_workout t, params where t.clinic_id = params.clinic_id),
  'student_workout_version', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_workout_version t join student_workout sw on sw.id = t.student_workout_id, params where sw.clinic_id = params.clinic_id),
  'student_checkin', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_checkin t, params where t.clinic_id = params.clinic_id),
  'checkin_assessment', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from checkin_assessment t, params where t.clinic_id = params.clinic_id),
  'student_checkin_photo', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_checkin_photo t, params where t.clinic_id = params.clinic_id),
  'checkin_evaluation', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from checkin_evaluation t, params where t.clinic_id = params.clinic_id),
  'student_note', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from student_note t, params where t.clinic_id = params.clinic_id),
  'calendar_event', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from calendar_event t, params where t.clinic_id = params.clinic_id),
  'invoice', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from invoice t, params where t.clinic_id = params.clinic_id),
  'invoice_line_item', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from invoice_line_item t join invoice i on i.id = t.invoice_id, params where i.clinic_id = params.clinic_id),
  'invoice_reminder', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from invoice_reminder t join invoice i on i.id = t.invoice_id, params where i.clinic_id = params.clinic_id),
  'clinic_plan_change', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from clinic_plan_change t, params where t.clinic_id = params.clinic_id),
  'invitation', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from invitation t, params where t.clinic_id = params.clinic_id),
  'coach_invitation', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from coach_invitation t, params where t.clinic_id = params.clinic_id),
  'notification', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from notification t, params where t.clinic_id = params.clinic_id),
  'notification_read', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from notification_read t join notification n on n.id = t.notification_id, params where n.clinic_id = params.clinic_id),
  'whatsapp_connection', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from whatsapp_connection t, params where t.clinic_id = params.clinic_id),
  'whatsapp_template', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from whatsapp_template t, params where t.clinic_id = params.clinic_id),
  'whatsapp_conversation', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from whatsapp_conversation t, params where t.clinic_id = params.clinic_id),
  'whatsapp_message', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from whatsapp_message t, params where t.clinic_id = params.clinic_id)
)::text as backup;
