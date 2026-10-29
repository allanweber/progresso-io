import { randomBytes } from "node:crypto";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  CATEGORIES,
  DATA,
  EQUIPMENT,
  EXERCISEDB_EQUIPMENT,
  EXERCISEDB_FILE,
  EXERCISEDB_PTBR_FILE,
  EXERCISEDB_TARGET,
  FORCES,
  FREE_DB_FILE,
  LEVELS,
  MATCHES_FILE,
  MECHANICS,
  MUSCLES,
  PTBR_FILE,
  readJson,
} from "./exercisedb-vocab.mjs";
import { readExerciseCatalog, repointExercise } from "./seed-exercises.mjs";

export const OPS_FILE = join(DATA, "exercise-maintenance.json");
export const ADDED_IMAGES_DIR = join(DATA, "exercise-images-added");
export const PROPOSALS_FILE = join(DATA, "opengym-link-proposals.json");
export const CATALOG_FILE = join(DATA, "exercises-catalog.ndjson.gz");
export const SUBSTITUTIONS_FILE = join(DATA, "exercise-substitutions.json");

export const addedImageFile = (key) => join(ADDED_IMAGES_DIR, key.replace(/^added\//, ""));

const credit = z.object({
  author: z.string().trim().min(1).max(200),
  license: z.string().trim().min(1).max(100),
  licenseUrl: z.string().trim().max(500).default(""),
  sourceUrl: z.string().trim().max(500).default(""),
  aiGenerated: z.boolean().default(false),
});

const fields = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).nullable(),
    instructions: z.array(z.string().trim().min(1).max(1000)).max(30),
    category: z.enum(CATEGORIES),
    level: z.enum(LEVELS),
    force: z.enum(FORCES).nullable(),
    mechanic: z.enum(MECHANICS).nullable(),
    equipment: z.enum(EQUIPMENT).nullable(),
    primaryMuscles: z.array(z.enum(MUSCLES)).min(1).max(5),
    secondaryMuscles: z.array(z.enum(MUSCLES)).max(8),
    images: z.array(z.string().min(1).max(300)).max(20),
  })
  .partial();

const code = z.string().min(1).max(120);

export const opInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create"), code, fields: fields.required({ name: true, category: true, level: true, primaryMuscles: true }) }),
  z.object({ type: z.literal("update"), code, fields }),
  z.object({ type: z.literal("archive"), code }),
  z.object({ type: z.literal("unarchive"), code }),
  z.object({ type: z.literal("link"), code, openGymId: z.string().regex(/^\d{4}$/).nullable() }),
  z.object({ type: z.literal("add-substitute"), code, substitute: code }),
  z.object({ type: z.literal("remove-substitute"), code, substitute: code }),
  z.object({ type: z.literal("add-image"), code, key: z.string().regex(/^added\/[^/]+\/[a-z0-9-]+\.webp$/), credit: credit.nullable() }),
]);

export const newOpId = () => `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;

export function readOps(file = OPS_FILE) {
  return existsSync(file) ? (readJson(file).ops ?? []) : [];
}

export function writeOps(ops, file = OPS_FILE) {
  const tmp = `${file}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({ generatedBy: "scripts/maintain-exercises.mjs", ops }, null, 1) + "\n",
  );
  renameSync(tmp, file);
}

const OPPOSITE = {
  archive: "unarchive",
  unarchive: "archive",
  "add-substitute": "remove-substitute",
  "remove-substitute": "add-substitute",
};

export function recordOp(ops, committed, op) {
  const open = (o) => !committed.has(o.id) && o.code === op.code;
  if (op.type === "update") {
    const pending = ops.find((o) => open(o) && o.type === "update");
    if (pending) {
      return ops.map((o) => (o === pending ? { ...o, at: op.at, fields: { ...o.fields, ...op.fields } } : o));
    }
    return [...ops, op];
  }
  if (op.type === "link") {
    return [...ops.filter((o) => !(open(o) && o.type === "link")), op];
  }
  if (OPPOSITE[op.type]) {
    const same = (o) => open(o) && (o.substitute ?? null) === (op.substitute ?? null);
    const opposite = ops.find((o) => same(o) && o.type === OPPOSITE[op.type]);
    if (opposite) return ops.filter((o) => o !== opposite);
    if (ops.some((o) => same(o) && o.type === op.type)) return ops;
  }
  return [...ops, op];
}

export function removeOp(ops, committed, id) {
  if (committed.has(id)) return { ok: false, error: "Operação já commitada não pode ser removida." };
  if (!ops.some((o) => o.id === id)) return { ok: false, error: "Operação não encontrada." };
  return { ok: true, ops: ops.filter((o) => o.id !== id) };
}

const SECONDARY = {
  "lower back": "lower_back",
  obliques: "abdominals",
  hamstrings: "hamstrings",
  glutes: "glutes",
  biceps: "biceps",
  rhomboids: "middle_back",
  forearms: "forearms",
  triceps: "triceps",
  shoulders: "shoulders",
  core: "abdominals",
  back: "middle_back",
  quadriceps: "quadriceps",
  calves: "calves",
  chest: "chest",
  "rear deltoids": "shoulders",
  traps: "traps",
  "upper back": "middle_back",
  trapezius: "traps",
  deltoids: "shoulders",
  brachialis: "biceps",
  groin: "adductors",
  "rotator cuff": "shoulders",
  "upper chest": "chest",
  "latissimus dorsi": "lats",
  "wrist flexors": "forearms",
  "wrist extensors": "forearms",
  abdominals: "abdominals",
  "grip muscles": "forearms",
  "lower abs": "abdominals",
  lats: "lats",
  "inner thighs": "adductors",
  soleus: "calves",
  sternocleidomastoid: "neck",
};

export function loadOpenGymCatalog() {
  const enriched = new Map(readJson(EXERCISEDB_PTBR_FILE).exercises.map((e) => [e.id, e]));
  const ptbr = new Map(readJson(PTBR_FILE).map((e) => [e.id, e]));
  const codeById = new Map(readJson(MATCHES_FILE).matches.filter((m) => m.code).map((m) => [m.openGymId, m.code]));
  return readJson(EXERCISEDB_FILE).map((x) => {
    const e = enriched.get(x.id);
    const primary = e?.primaryMuscles ?? [EXERCISEDB_TARGET[x.target] ?? (x.target === "serratus anterior" ? "chest" : null)].filter(Boolean);
    return {
      id: x.id,
      name: e?.name ?? ptbr.get(codeById.get(x.id))?.name ?? x.name,
      nameEn: x.name,
      bodyPart: x.bodyPart,
      equipmentEn: x.equipment,
      equipment: e?.equipment ?? EXERCISEDB_EQUIPMENT[x.equipment] ?? null,
      primaryMuscles: primary,
      secondaryMuscles:
        e?.secondaryMuscles ??
        [...new Set(x.secondaryMuscles.map((m) => SECONDARY[m]).filter((m) => m && !primary.includes(m)))],
      instructions: x.instructions,
    };
  });
}

export function loadCatalogState() {
  const rules = existsSync(SUBSTITUTIONS_FILE) ? readJson(SUBSTITUTIONS_FILE).substitutions : [];
  const subs = new Map(rules.map((r) => [r.exercise, r.substitutes ?? []]));
  const english = new Map([
    ...readJson(FREE_DB_FILE).map((e) => [e.id, e.name]),
    ...readJson(EXERCISEDB_FILE).map((x) => [`exercisedb-${x.id}`, x.name]),
  ]);
  return new Map(
    readExerciseCatalog(CATALOG_FILE).map((e) => [
      e.code,
      {
        code: e.code,
        name: e.name,
        description: null,
        nameEn: english.get(e.code) ?? null,
        category: e.category,
        level: e.level,
        force: e.force,
        mechanic: e.mechanic,
        equipment: e.equipment,
        primaryMuscles: e.primaryMuscles,
        secondaryMuscles: e.secondaryMuscles,
        instructions: e.instructions,
        images: e.images,
        imageCredits: e.imageCredits ?? {},
        source: e.source,
        openGymId: e.openGymId ?? null,
        noMatch: false,
        archived: false,
        mergedInto: null,
        substitutes: [...(subs.get(e.code) ?? [])],
        edited: false,
      },
    ]),
  );
}

function repointState(state, from, to) {
  for (const s of state.values()) {
    if (!s.substitutes.includes(from)) continue;
    s.substitutes = [...new Set(s.substitutes.map((c) => (c === from ? to : c)))].filter((c) => c !== s.code);
  }
  const source = state.get(from);
  const target = state.get(to);
  target.substitutes = [...new Set([...target.substitutes, ...source.substitutes])].filter((c) => c !== to && c !== from);
  source.substitutes = [];
}

export function applyOpToState(state, op) {
  if (op.type === "create") {
    if (state.has(op.code)) return false;
    state.set(op.code, {
      code: op.code,
      description: null,
      nameEn: null,
      force: null,
      mechanic: null,
      equipment: null,
      secondaryMuscles: [],
      instructions: [],
      images: [],
      imageCredits: {},
      ...op.fields,
      source: "custom",
      openGymId: null,
      noMatch: false,
      archived: false,
      mergedInto: null,
      substitutes: [],
      edited: true,
    });
    return true;
  }
  const s = state.get(op.code);
  if (!s) return false;
  s.edited = true;
  if (op.type === "update") Object.assign(s, op.fields);
  if (op.type === "archive") s.archived = true;
  if (op.type === "unarchive") s.archived = false;
  if (op.type === "add-image" && !s.images.includes(op.key)) {
    s.images = [...s.images, op.key];
    if (op.credit) s.imageCredits = { ...s.imageCredits, [op.key]: op.credit };
  }
  if (op.type === "add-substitute") {
    if (op.substitute === op.code || !state.has(op.substitute)) return false;
    if (!s.substitutes.includes(op.substitute)) s.substitutes = [...s.substitutes, op.substitute];
  }
  if (op.type === "remove-substitute") s.substitutes = s.substitutes.filter((c) => c !== op.substitute);
  if (op.type === "link") {
    s.noMatch = op.openGymId === null;
    if (op.openGymId !== null && s.openGymId !== op.openGymId) {
      const holder = [...state.values()].find((o) => o.code !== s.code && o.openGymId === op.openGymId);
      if (holder) {
        holder.openGymId = null;
        holder.edited = true;
        if (holder.source === "exercisedb") {
          holder.archived = true;
          holder.mergedInto = s.code;
          repointState(state, holder.code, s.code);
        }
      }
    }
    s.openGymId = op.openGymId;
  }
  return true;
}

export function buildState(ops) {
  const state = loadCatalogState();
  for (const op of ops) applyOpToState(state, op);
  return state;
}

export function maintenanceSeedGuards(ops, catalog) {
  const linkedIds = new Set(ops.filter((o) => o.type === "link" && o.openGymId).map((o) => o.openGymId));
  const keepCodes = new Set(ops.filter((o) => o.type === "link").map((o) => o.code));
  for (const e of catalog) if (e.openGymId && linkedIds.has(e.openGymId)) keepCodes.add(e.code);
  const removedEdges = new Set(
    ops.filter((o) => o.type === "remove-substitute").map((o) => `${o.code}:${o.substitute}`),
  );
  return { keepCodes, removedEdges };
}

const COLUMNS = {
  name: "name",
  description: "description",
  instructions: "instructions",
  category: "category",
  level: "level",
  force: "force",
  mechanic: "mechanic",
  equipment: "equipment",
  primaryMuscles: "primary_muscles",
  secondaryMuscles: "secondary_muscles",
  images: "images",
};

async function baseRow(query, code) {
  const [row] = await query(
    "select id, opengym_id, source from exercise where code = $1 and clinic_id is null",
    [code],
  );
  return row;
}

async function applyOpToDb(query, op, uploadImage) {
  if (op.type === "create") {
    const f = op.fields;
    const rows = await query(
      `insert into exercise (
        code, name, search_text, description, category, level, force, mechanic, equipment,
        primary_muscles, secondary_muscles, instructions, images, source
      ) values ($1, $2, unaccent(lower($2)), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'custom')
      on conflict (code) do nothing
      returning id`,
      [
        op.code,
        f.name,
        f.description ?? null,
        f.category,
        f.level,
        f.force ?? null,
        f.mechanic ?? null,
        f.equipment ?? null,
        f.primaryMuscles,
        f.secondaryMuscles ?? [],
        f.instructions ?? [],
        f.images ?? [],
      ],
    );
    return rows.length ? null : "código já existe";
  }

  const row = await baseRow(query, op.code);
  if (!row) return "exercício não encontrado";

  if (op.type === "update") {
    const sets = [];
    const params = [row.id];
    for (const [field, value] of Object.entries(op.fields)) {
      params.push(value);
      sets.push(`${COLUMNS[field]} = $${params.length}`);
      if (field === "name") sets.push(`search_text = unaccent(lower($${params.length}))`);
    }
    if (sets.length) {
      await query(`update exercise set ${sets.join(", ")}, updated_at = now() where id = $1`, params);
    }
    return null;
  }
  if (op.type === "archive" || op.type === "unarchive") {
    await query("update exercise set archived = $2, updated_at = now() where id = $1", [
      row.id,
      op.type === "archive",
    ]);
    return null;
  }
  if (op.type === "add-image") {
    await uploadImage(op.key);
    await query(
      `update exercise set images = array_append(images, $2),
         image_credits = case when $3::jsonb is null then image_credits else image_credits || jsonb_build_object($2, $3::jsonb) end,
         updated_at = now()
       where id = $1 and not ($2 = any(images))`,
      [row.id, op.key, op.credit ? JSON.stringify(op.credit) : null],
    );
    return null;
  }
  if (op.type === "add-substitute" || op.type === "remove-substitute") {
    const sub = await baseRow(query, op.substitute);
    if (!sub) return "substituto não encontrado";
    if (sub.id === row.id) return "mesmo exercício";
    if (op.type === "remove-substitute") {
      await query(
        "delete from exercise_substitution where clinic_id is null and exercise_id = $1 and substitute_exercise_id = $2",
        [row.id, sub.id],
      );
      return null;
    }
    await query(
      `insert into exercise_substitution (clinic_id, exercise_id, substitute_exercise_id)
       select null, $1, $2 where not exists (
         select 1 from exercise_substitution
         where clinic_id is null and exercise_id = $1 and substitute_exercise_id = $2)`,
      [row.id, sub.id],
    );
    return null;
  }
  if (op.type === "link") {
    if (op.openGymId === null) {
      await query("update exercise set opengym_id = null, updated_at = now() where id = $1", [row.id]);
      return null;
    }
    if (row.opengym_id === op.openGymId) return null;
    const [holder] = await query("select id, source, clinic_id from exercise where opengym_id = $1", [
      op.openGymId,
    ]);
    if (holder && holder.clinic_id !== null) return "openGym id em exercício de clínica";
    if (holder) {
      const merge = holder.source === "exercisedb";
      await query(
        `update exercise set opengym_id = null, archived = archived or $2, updated_at = now() where id = $1`,
        [holder.id, merge],
      );
      if (merge) await repointExercise(query, holder.id, row.id);
    }
    await query("update exercise set opengym_id = $2, updated_at = now() where id = $1", [
      row.id,
      op.openGymId,
    ]);
    return null;
  }
  return `tipo desconhecido: ${op.type}`;
}

export async function applyExerciseMaintenance(query, ops, { uploadImage = async () => {} } = {}) {
  const doneRows = await query("select id from exercise_maintenance_op");
  const done = new Set(doneRows.map((r) => r.id));
  const result = { applied: 0, skipped: [] };
  for (const op of ops) {
    if (done.has(op.id)) continue;
    const reason = await applyOpToDb(query, op, uploadImage);
    await query("insert into exercise_maintenance_op (id, status, detail) values ($1, $2, $3)", [
      op.id,
      reason ? "skipped" : "applied",
      reason,
    ]);
    if (reason) result.skipped.push({ id: op.id, code: op.code, type: op.type, reason });
    else result.applied++;
  }
  return result;
}
