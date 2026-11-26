do $import$
declare
  doc jsonb := $backup$PASTE-BACKUP-JSON-HERE$backup$::jsonb;
  target_student_id uuid := 'TARGET-STUDENT-UUID';
  target_clinic_id uuid := 'TARGET-CLINIC-UUID';
  target_coach_id text := 'TARGET-COACH-ID';
  target_student_user_id text;
  source_student_id text;
  source_student_user_id text;
  source_user_ids jsonb;
  photo_keys jsonb;
  shared_tables text[] := array['food', 'food_nutrient', 'food_measure', 'exercise'];
  body text;
  pair record;
  fk record;
  rows jsonb;
  tbl text;
  n integer;
begin
  source_student_id := doc ->> 'student_id';
  source_student_user_id := doc ->> 'student_user_id';
  source_user_ids := doc -> 'clinic_user_ids';

  if source_student_id is null then
    if jsonb_array_length(coalesce(doc -> 'student', '[]')) <> 1 then
      raise exception 'The backup must contain exactly one student.';
    end if;
    source_student_id := doc -> 'student' -> 0 ->> 'id';
    source_student_user_id := doc -> 'student' -> 0 ->> 'user_id';
    select coalesce(jsonb_agg(u ->> 'id'), '[]') into source_user_ids
    from jsonb_array_elements(coalesce(doc -> 'user', '[]')) u
    where u ->> 'id' is distinct from source_student_user_id;
  end if;

  select s.user_id into target_student_user_id
  from student s
  where s.id = target_student_id and s.clinic_id = target_clinic_id;
  if not found then
    raise exception 'Student % does not exist in clinic %.', target_student_id, target_clinic_id;
  end if;

  if not exists (
    select 1 from "user" u
    where u.id = target_coach_id
      and (u.clinic_id = target_clinic_id
        or u.id in (select c.owner_user_id from clinic c where c.id = target_clinic_id))
  ) then
    raise exception 'Coach % does not belong to clinic %.', target_coach_id, target_clinic_id;
  end if;

  select coalesce(jsonb_object_agg(r ->> 'id', r -> 'storage_key'), '{}') into photo_keys
  from jsonb_array_elements(coalesce(doc -> 'student_checkin_photo', '[]')) r;

  body := (doc - 'catalog')::text;

  for pair in
    select doc ->> 'clinic_id' as old_id, target_clinic_id::text as new_id
    union all
    select source_student_id, target_student_id::text
    union all
    select source_student_user_id, target_student_user_id
    where source_student_user_id is not null and target_student_user_id is not null
    union all
    select u, target_coach_id from jsonb_array_elements_text(source_user_ids) u
    union all
    select k.key, t.id::text
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
    ) t on t.kind = k.kind and t.value = k.value
    where k.key in (
      select distinct m[1]
      from regexp_matches(
        body,
        '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
        'g'
      ) m
    )
  loop
    if pair.old_id is distinct from pair.new_id then
      body := replace(body, pair.old_id, pair.new_id);
    end if;
  end loop;

  doc := body::jsonb;

  doc := jsonb_set(doc, '{student_checkin_photo}', (
    select coalesce(jsonb_agg(r || jsonb_build_object('storage_key', photo_keys -> (r ->> 'id'))), '[]')
    from jsonb_array_elements(coalesce(doc -> 'student_checkin_photo', '[]')) r
  ));

  foreach tbl in array array[
    'food',
    'food_nutrient',
    'food_measure',
    'exercise',
    'student_anamnesis',
    'ai_generation',
    'student_diet',
    'student_diet_version',
    'student_workout',
    'student_workout_version',
    'student_checkin',
    'checkin_assessment',
    'student_checkin_photo',
    'checkin_evaluation',
    'student_note',
    'calendar_event',
    'whatsapp_conversation',
    'whatsapp_message'
  ] loop
    rows := coalesce(doc -> tbl, '[]');

    for fk in
      select a.attname as col, k.confrelid::regclass::text as ref_tbl, ra.attname as ref_col
      from pg_constraint k
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      join pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1]
      where k.contype = 'f'
        and k.conrelid = tbl::regclass
        and array_length(k.conkey, 1) = 1
        and not a.attnotnull
    loop
      execute format(
        'select count(*) from jsonb_array_elements($1) r
         where r ->> %L is not null
           and not exists (select 1 from %s x where x.%I::text = r ->> %L)',
        fk.col, fk.ref_tbl, fk.ref_col, fk.col
      ) into n using rows;
      if n > 0 then
        raise notice '%.%: % references to missing % rows set to null', tbl, fk.col, n, fk.ref_tbl;
        execute format(
          'select coalesce(jsonb_agg(
             case
               when r ->> %L is not null
                 and not exists (select 1 from %s x where x.%I::text = r ->> %L)
                 then jsonb_set(r, array[%L], ''null'')
               else r
             end
           ), ''[]'') from jsonb_array_elements($1) r',
          fk.col, fk.ref_tbl, fk.ref_col, fk.col, fk.col
        ) into rows using rows;
      end if;
    end loop;

    execute format(
      'insert into %I select * from jsonb_populate_recordset(null::%I, $1)%s',
      tbl, tbl,
      case when tbl = any(shared_tables) then ' on conflict do nothing' else '' end
    ) using rows;
    get diagnostics n = row_count;
    raise notice '%: %', tbl, n;
  end loop;

  update student_checkin_photo p
  set storage_key = 'checkins/' || source_student_id || '/' || substring(p.storage_key from length('checkins/') + 1)
  where p.id in (select (r ->> 'id')::uuid from jsonb_array_elements(doc -> 'student_checkin_photo') r)
    and p.storage_key ~ '^checkins/[^/]+$';
  get diagnostics n = row_count;
  raise notice 'student_checkin_photo: % keys moved to checkins/<source-student-id>/', n;
end
$import$;
