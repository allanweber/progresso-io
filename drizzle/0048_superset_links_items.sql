UPDATE "student_workout_version" v SET "tree" = jsonb_set(v."tree", '{sessions}', (
  SELECT coalesce(jsonb_agg(
    CASE WHEN jsonb_typeof(s->'items') = 'array' THEN jsonb_set(s, '{items}', (
      SELECT coalesce(jsonb_agg(
        CASE WHEN e->>'technique' IN ('superset', 'giant') THEN jsonb_set(e, '{technique}', 'null'::jsonb) ELSE e END
        ORDER BY ei), '[]'::jsonb)
      FROM jsonb_array_elements(s->'items') WITH ORDINALITY AS x(e, ei)
    )) ELSE s END
    ORDER BY si), '[]'::jsonb)
  FROM jsonb_array_elements(v."tree"->'sessions') WITH ORDINALITY AS y(s, si)
))
WHERE jsonb_typeof(v."tree"->'sessions') = 'array'
  AND jsonb_path_exists(v."tree", '$.sessions[*].items[*] ? (@.technique == "superset" || @.technique == "giant")');
