do $import$
declare
  doc jsonb := $backup$PASTE-BACKUP-JSON-HERE$backup$::jsonb;
  remap jsonb := '{
    "food": ["group_id"],
    "food_measure": ["food_id"],
    "food_substitution": ["food_id", "substitute_food_id"],
    "food_favorite": ["food_id"],
    "exercise_substitution": ["exercise_id", "substitute_exercise_id"],
    "diet_meal_item": ["food_id"],
    "diet_meal_item_substitute": ["food_id"],
    "workout_exercise": ["exercise_id"],
    "workout_exercise_substitute": ["substitute_exercise_id"]
  }';
  id_map jsonb;
  rows jsonb;
  tbl text;
  col text;
  n integer;
begin
  select coalesce(jsonb_object_agg(k.key, t.id), '{}') into id_map
  from (
    select key, value, 'food' as kind from jsonb_each_text(doc -> 'catalog' -> 'food')
    union all
    select key, value, 'exercise' from jsonb_each_text(doc -> 'catalog' -> 'exercise')
    union all
    select key, value, 'food_group' from jsonb_each_text(doc -> 'catalog' -> 'food_group')
  ) k
  join (
    select id, code as value, 'food' as kind from food where clinic_id is null
    union all
    select id, code, 'exercise' from exercise where clinic_id is null
    union all
    select id, slug, 'food_group' from food_group
  ) t on t.kind = k.kind and t.value = k.value;

  insert into "user"
  select * from jsonb_populate_recordset(
    null::"user",
    (select coalesce(jsonb_agg(u - 'clinic_id'), '[]') from jsonb_array_elements(doc -> 'user') u)
  );
  get diagnostics n = row_count;
  raise notice 'user: %', n;

  insert into clinic select * from jsonb_populate_recordset(null::clinic, doc -> 'clinic');
  get diagnostics n = row_count;
  raise notice 'clinic: %', n;

  update "user" u
  set clinic_id = (r ->> 'clinic_id')::uuid
  from jsonb_array_elements(doc -> 'user') r
  where u.id = r ->> 'id';

  foreach tbl in array array[
    'account',
    'student',
    'anamnesis',
    'student_anamnesis',
    'ai_generation',
    'food',
    'food_nutrient',
    'food_measure',
    'food_substitution',
    'food_favorite',
    'exercise',
    'exercise_substitution',
    'diet',
    'diet_meal',
    'diet_meal_item',
    'diet_meal_item_substitute',
    'student_diet',
    'student_diet_version',
    'workout',
    'workout_session',
    'workout_exercise',
    'workout_exercise_substitute',
    'student_workout',
    'student_workout_version',
    'student_checkin',
    'checkin_assessment',
    'student_checkin_photo',
    'checkin_evaluation',
    'student_note',
    'calendar_event',
    'invoice',
    'invoice_line_item',
    'invoice_reminder',
    'clinic_plan_change',
    'invitation',
    'coach_invitation',
    'notification',
    'notification_read',
    'whatsapp_connection',
    'whatsapp_template',
    'whatsapp_conversation',
    'whatsapp_message'
  ] loop
    select coalesce(jsonb_agg(
      r || (
        select coalesce(jsonb_object_agg(c, coalesce(id_map -> (r ->> c), r -> c)), '{}')
        from jsonb_array_elements_text(coalesce(remap -> tbl, '[]')) c
      )
    ), '[]') into rows
    from jsonb_array_elements(coalesce(doc -> tbl, '[]')) r;

    for col in
      select a.attname
      from pg_constraint k
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      where k.contype = 'f'
        and k.conrelid = tbl::regclass
        and k.confrelid = '"user"'::regclass
        and not a.attnotnull
    loop
      select count(*) into n
      from jsonb_array_elements(rows) r
      where r ->> col is not null and not exists (select 1 from "user" u where u.id = r ->> col);
      if n > 0 then
        raise notice '%.%: % references to users outside the clinic set to null', tbl, col, n;
        select coalesce(jsonb_agg(
          case
            when r ->> col is not null and not exists (select 1 from "user" u where u.id = r ->> col)
              then jsonb_set(r, array[col], 'null')
            else r
          end
        ), '[]') into rows
        from jsonb_array_elements(rows) r;
      end if;
    end loop;

    execute format(
      'insert into %I select * from jsonb_populate_recordset(null::%I, $1)',
      tbl, tbl
    ) using rows;
    get diagnostics n = row_count;
    raise notice '%: %', tbl, n;
  end loop;

  update student_checkin_photo p
  set storage_key = 'checkins/' || c.student_id || '/' || substring(p.storage_key from length('checkins/') + 1)
  from student_checkin c
  where c.id = p.checkin_id
    and p.clinic_id = (doc ->> 'clinic_id')::uuid
    and p.storage_key ~ '^checkins/[^/]+$';
  get diagnostics n = row_count;
  raise notice 'student_checkin_photo: % keys moved to checkins/<student-id>/', n;
end
$import$;
