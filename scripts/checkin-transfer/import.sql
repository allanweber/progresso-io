with params as (
  select
    'NEW-STUDENT-UUID'::uuid as student_id,
    'NEW-COACH-USER-ID'::text as coach_user_id,
    $backup$PASTE-BACKUP-JSON-HERE$backup$::jsonb as doc
),
target as (
  select s.id as student_id, s.clinic_id, s.user_id as student_user_id, u.id as coach_user_id, p.doc
  from params p
  join student s on s.id = p.student_id
  join "user" u on u.id = p.coach_user_id
),
checkins as (
  insert into student_checkin (
    id, clinic_id, student_id, date, author, modality, author_user_id, weight_kg, note,
    feedback, feedback_at, feedback_by_user_id,
    diet_version_id, diet_name, diet_version, workout_version_id, workout_name, workout_version,
    created_at, updated_at
  )
  select
    c.id, t.clinic_id, t.student_id, c.date, c.author, c.modality,
    case c.author when 'student' then t.student_user_id else t.coach_user_id end,
    case when c.weight_kg > 0 then c.weight_kg end,
    c.note, c.feedback, c.feedback_at,
    case when c.feedback_at is not null then t.coach_user_id end,
    null, c.diet_name, c.diet_version, null, c.workout_name, c.workout_version,
    c.created_at, c.updated_at
  from target t,
    jsonb_to_recordset(t.doc -> 'checkins') as c(
      id uuid, date date, author text, modality text, weight_kg double precision, note text,
      feedback text, feedback_at timestamp, diet_name text, diet_version integer,
      workout_name text, workout_version integer, created_at timestamp, updated_at timestamp
    )
  returning 1
),
assessments as (
  insert into checkin_assessment (
    id, clinic_id, checkin_id, student_id, assessed_at, protocol,
    circumferences, skinfolds, body_fat_pct, body_fat_source, recorded_by_user_id, created_at
  )
  select
    a.id, t.clinic_id, a.checkin_id, t.student_id, a.assessed_at,
    coalesce(a.protocol, 'personalizada'),
    coalesce(a.circumferences, '{}'), coalesce(a.skinfolds, '{}'),
    a.body_fat_pct,
    case when a.body_fat_pct is not null then coalesce(a.body_fat_source, 'manual') end,
    t.coach_user_id, a.created_at
  from target t,
    jsonb_to_recordset(t.doc -> 'assessments') as a(
      id uuid, checkin_id uuid, assessed_at date, protocol text,
      circumferences jsonb, skinfolds jsonb, body_fat_pct double precision,
      body_fat_source text, created_at timestamp
    )
  returning 1
),
photos as (
  insert into student_checkin_photo (id, clinic_id, checkin_id, pose, storage_key, sort_order)
  select p.id, t.clinic_id, p.checkin_id, p.pose, p.r2_key, p.sort_order
  from target t,
    jsonb_to_recordset(t.doc -> 'photos') as p(
      id uuid, checkin_id uuid, pose text, r2_key text, sort_order integer
    )
  returning 1
),
evaluations as (
  insert into checkin_evaluation (
    id, clinic_id, checkin_id, student_id, ai_generation_id, status, payload,
    body_fat_pct, body_fat_source, confidence, decided_by_user_id, decided_at, created_at, updated_at
  )
  select
    e.id, t.clinic_id, e.checkin_id, t.student_id, null, e.status, e.payload,
    e.body_fat_pct, e.body_fat_source, e.confidence,
    case when e.decided_at is not null then t.coach_user_id end,
    e.decided_at, e.created_at, e.updated_at
  from target t,
    jsonb_to_recordset(t.doc -> 'evaluations') as e(
      id uuid, checkin_id uuid, status text, payload jsonb, body_fat_pct double precision,
      body_fat_source text, confidence text, decided_at timestamp,
      created_at timestamp, updated_at timestamp
    )
  returning 1
)
select
  (select count(*) from target) as student_found,
  (select count(*) from checkins) as checkins,
  (select count(*) from assessments) as assessments,
  (select count(*) from photos) as photos,
  (select count(*) from evaluations) as evaluations;
