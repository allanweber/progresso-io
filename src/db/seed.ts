/**
 * Seeds the coach / aluno / super-admin scenario, in one clinic:
 *   - a coach who owns a clinic,
 *   - an aluno who belongs to that same clinic and is linked to the coach,
 *   - a platform admin (no clinic).
 *
 * Run with: `npm run db:seed` (requires DATABASE_URL). Idempotent.
 *
 * Default credentials (override via env):
 *   COACH  coach@progresso.io  / progresso123
 *   ALUNO  aluno@progresso.io  / progresso123
 *   ADMIN  admin@progresso.io  / progresso123
 */
import { config } from "dotenv";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { DietWriteInput } from "@/server/dal/diets";
import type { WorkoutWriteInput } from "@/server/dal/workouts";
import type { WorkoutReps } from "@/lib/workouts";
import type { AnamnesisSection } from "@/lib/anamneses";
import type { AnamnesisAnswers } from "@/lib/student-anamneses";
import { normalizePhone } from "@/lib/phone";
import type { TenantContext } from "@/server/tenant";

config({ path: ".env.local" });
config();

type DbModule = typeof import("@/db");
type StudentDietsDal = typeof import("@/server/dal")["studentDiets"];
type StudentWorkoutsDal = typeof import("@/server/dal")["studentWorkouts"];

/**
 * Publishes two diets for the seeded aluno (an archived "Adaptação" + the active
 * "Cutting") via the real DAL, referencing **real catalog foods** by description.
 * Nutrition and catalog substitutions are derived live on read, so this needs no
 * hand-authored macros. Idempotent: skips if the student already has a diet.
 */
async function seedAlunoDiet(
  db: NonNullable<DbModule["db"]>,
  schema: DbModule["schema"],
  studentDiets: StudentDietsDal,
  ctx: TenantContext,
  studentId: string,
): Promise<void> {
  const existing = await db
    .select({ id: schema.studentDiet.id })
    .from(schema.studentDiet)
    .where(
      and(
        eq(schema.studentDiet.clinicId, ctx.clinicId),
        eq(schema.studentDiet.studentId, studentId),
      ),
    );
  if (existing.length > 0) return;

  /** First non-archived base food whose description matches (shortest wins). */
  async function food(like: string): Promise<string | null> {
    const [row] = await db
      .select({ id: schema.food.id })
      .from(schema.food)
      .where(
        and(
          isNull(schema.food.clinicId),
          eq(schema.food.archived, false),
          sql`${schema.food.description} ILIKE ${like}`,
        ),
      )
      .orderBy(sql`char_length(${schema.food.description})`)
      .limit(1);
    return row?.id ?? null;
  }

  const [arroz, frango, pao, ovo, maca, iogurte, banana, batata, feijao] =
    await Promise.all([
      food("%arroz%cozido%"),
      food("%frango%peito%"),
      food("%pão%franc%"),
      food("%ovo%cozido%"),
      food("%maçã%"),
      food("%iogurte%"),
      food("%banana%"),
      food("%batata%doce%cozida%"),
      food("%feijão%carioca%cozido%"),
    ]);

  /** Ensures a base catalog substitution exists, so the demo shows swaps live. */
  async function ensureSub(foodId: string | null, subId: string | null, grams: number) {
    if (!foodId || !subId) return;
    const [ex] = await db
      .select({ id: schema.foodSubstitution.id })
      .from(schema.foodSubstitution)
      .where(
        and(
          isNull(schema.foodSubstitution.clinicId),
          eq(schema.foodSubstitution.foodId, foodId),
          eq(schema.foodSubstitution.substituteFoodId, subId),
        ),
      );
    if (!ex) {
      await db
        .insert(schema.foodSubstitution)
        .values({ clinicId: null, foodId, substituteFoodId: subId, grams });
    }
  }
  await ensureSub(arroz, batata, 167);
  await ensureSub(arroz, feijao, 120);
  await ensureSub(frango, ovo, 148);

  const item = (foodId: string | null, grams: number) =>
    foodId ? { foodId, grams, substitutes: [] } : null;

  const cutting: DietWriteInput = {
    name: "Cutting",
    notes: "Beber 3L de água por dia.",
    meals: [
      {
        name: "Café da manhã",
        time: "08:00",
        items: [item(pao, 100), item(ovo, 100), item(maca, 130)].filter(
          (i): i is NonNullable<typeof i> => i !== null,
        ),
      },
      {
        name: "Almoço",
        time: "12:00",
        items: [item(arroz, 250), item(frango, 170)].filter(
          (i): i is NonNullable<typeof i> => i !== null,
        ),
      },
      {
        name: "Ceia",
        time: null,
        items: [item(iogurte, 170)].filter(
          (i): i is NonNullable<typeof i> => i !== null,
        ),
      },
    ],
  };
  const adaptacao: DietWriteInput = {
    name: "Adaptação",
    notes: "Fase inicial.",
    meals: [
      {
        name: "Café da manhã",
        time: "08:00",
        items: [item(pao, 50), item(banana, 100)].filter(
          (i): i is NonNullable<typeof i> => i !== null,
        ),
      },
      {
        name: "Almoço",
        time: "12:00",
        items: [item(arroz, 200), item(frango, 150)].filter(
          (i): i is NonNullable<typeof i> => i !== null,
        ),
      },
    ],
  };

  const hasItems = (d: DietWriteInput) => d.meals.some((m) => m.items.length > 0);
  if (!hasItems(cutting)) {
    console.info("• skipped aluno diet — no matching catalog foods");
    return;
  }

  // Publish "Adaptação" first (becomes active), then "Cutting" as a new diet —
  // its first publish archives "Adaptação" and becomes the active one.
  if (hasItems(adaptacao)) {
    await studentDiets.createBlankDraft(ctx, studentId, adaptacao.name);
    await studentDiets.publishDraft(ctx, studentId, adaptacao);
  }
  await studentDiets.createBlankDraft(ctx, studentId, cutting.name);
  await studentDiets.publishDraft(ctx, studentId, cutting);
  console.info("✓ published aluno diets (Adaptação archived + Cutting active)");
}

/**
 * Publishes two workouts for the seeded aluno (an archived "Adaptação" + the
 * active "Hipertrofia") via the real DAL, referencing **real catalog exercises**
 * by name. The exercise presentation and library substitutes are derived live on
 * read, so this needs no hand-authored data. Demonstrates an advanced technique
 * (drop set), a super-set block, and a per-item custom substitute. Idempotent.
 */
async function seedAlunoWorkout(
  db: NonNullable<DbModule["db"]>,
  schema: DbModule["schema"],
  studentWorkouts: StudentWorkoutsDal,
  ctx: TenantContext,
  studentId: string,
): Promise<void> {
  const existing = await db
    .select({ id: schema.studentWorkout.id })
    .from(schema.studentWorkout)
    .where(
      and(
        eq(schema.studentWorkout.clinicId, ctx.clinicId),
        eq(schema.studentWorkout.studentId, studentId),
      ),
    );
  if (existing.length > 0) return;

  /** First non-archived base exercise whose name matches (shortest wins). */
  async function ex(like: string): Promise<string | null> {
    const [row] = await db
      .select({ id: schema.exercise.id })
      .from(schema.exercise)
      .where(
        and(
          isNull(schema.exercise.clinicId),
          eq(schema.exercise.archived, false),
          sql`${schema.exercise.name} ILIKE ${like}`,
        ),
      )
      .orderBy(sql`char_length(${schema.exercise.name})`)
      .limit(1);
    return row?.id ?? null;
  }

  const [
    supino,
    crucifixo,
    triceps,
    agacha,
    legpress,
    remada,
    puxada,
    rosca,
    desenvolvimento,
    abdominal,
    cadeira,
  ] = await Promise.all([
    ex("%supino%"),
    ex("%crucifixo%"),
    ex("%tríceps%"),
    ex("%agachamento%"),
    ex("%leg press%"),
    ex("%remada%"),
    ex("%puxada%"),
    ex("%rosca%"),
    ex("%desenvolvimento%"),
    ex("%abdominal%"),
    ex("%cadeira%"),
  ]);

  /** Ensures a base exercise substitution exists, so the demo shows swaps live. */
  async function ensureSub(exerciseId: string | null, subId: string | null) {
    if (!exerciseId || !subId || exerciseId === subId) return;
    const [row] = await db
      .select({ id: schema.exerciseSubstitution.id })
      .from(schema.exerciseSubstitution)
      .where(
        and(
          isNull(schema.exerciseSubstitution.clinicId),
          eq(schema.exerciseSubstitution.exerciseId, exerciseId),
          eq(schema.exerciseSubstitution.substituteExerciseId, subId),
        ),
      );
    if (!row) {
      await db.insert(schema.exerciseSubstitution).values({
        clinicId: null,
        exerciseId,
        substituteExerciseId: subId,
      });
    }
  }
  await ensureSub(supino, crucifixo);
  await ensureSub(agacha, legpress);

  const range = (...values: number[]): WorkoutReps => ({
    kind: "range",
    values,
  });
  const pyramid = (...values: number[]): WorkoutReps => ({
    kind: "pyramid",
    values,
  });
  const fixed = (value: number): WorkoutReps => ({ kind: "fixed", value });
  const failure: WorkoutReps = { kind: "failure" };

  type ExOpts = {
    sets: number;
    reps: WorkoutReps;
    rest?: number;
    load?: string | null;
    technique?: WorkoutWriteInput["sessions"][number]["exercises"][number]["technique"];
    note?: string | null;
    groupId?: string | null;
    customSubstitutes?: { exerciseId: string; note: string | null }[];
  };
  const item = (exerciseId: string | null, o: ExOpts) =>
    exerciseId
      ? {
          exerciseId,
          sets: o.sets,
          reps: o.reps,
          load: o.load ?? null,
          rest: o.rest ?? 90,
          technique: o.technique ?? null,
          note: o.note ?? null,
          groupId: o.groupId ?? null,
          customSubstitutes: o.customSubstitutes ?? [],
        }
      : null;

  const nonNull = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null);

  // A demo that exercises the full technique catalogue (drop set, triple drop,
  // super set, giant set, GVT, FS7, rest-pause, cluster) so the read views show
  // every variety — the badge, the continuous super/giant rail, and the reps
  // kinds (range / fixed / falha).
  const hipertrofia: WorkoutWriteInput = {
    name: "Hipertrofia · 4x semana",
    notes: "Aquecer 5 min antes de cada ficha.",
    sessions: [
      {
        name: "Ficha A · Peito e Tríceps",
        exercises: nonNull([
          item(supino, {
            sets: 4,
            reps: range(8, 10),
            rest: 90,
            load: "40 kg",
            technique: "dropset",
            note: "Desça a barra até o peito, sem quicar.",
            customSubstitutes: crucifixo
              ? [{ exerciseId: crucifixo, note: "ombro sensível" }]
              : [],
          }),
          // A super-set pair (shared groupId).
          item(crucifixo, { sets: 3, reps: range(10, 12), rest: 30, technique: "superset", groupId: "ssA" }),
          item(triceps, { sets: 3, reps: range(12, 15), rest: 60, technique: "superset", groupId: "ssA" }),
        ]),
      },
      {
        name: "Ficha B · Costas, Bíceps e Ombros",
        exercises: nonNull([
          // A giant set of three (shared groupId).
          item(remada, { sets: 4, reps: range(8, 10), rest: 20, technique: "giant", groupId: "gtB" }),
          item(puxada, { sets: 4, reps: range(8, 10), rest: 20, technique: "giant", groupId: "gtB" }),
          item(rosca, { sets: 3, reps: range(10, 12), rest: 60, technique: "giant", groupId: "gtB" }),
          item(desenvolvimento, {
            sets: 4,
            reps: pyramid(12, 10, 8, 6),
            rest: 75,
            note: "Aumente a carga a cada série.",
          }),
          item(abdominal, { sets: 3, reps: failure, rest: 45, technique: "tripledrop" }),
        ]),
      },
      {
        name: "Ficha C · Pernas",
        exercises: nonNull([
          item(agacha, { sets: 10, reps: fixed(10), rest: 60, load: "60 kg", technique: "gvt" }),
          item(legpress, { sets: 7, reps: range(10, 12), rest: 30, technique: "fs7" }),
          item(cadeira, { sets: 3, reps: range(12, 15), rest: 45, technique: "restpause" }),
        ]),
      },
    ],
  };

  const adaptacao: WorkoutWriteInput = {
    name: "Adaptação inicial",
    notes: null,
    sessions: [
      {
        name: "Treino A",
        exercises: nonNull([
          item(supino, { sets: 3, reps: range(12, 15), rest: 60 }),
          item(puxada, { sets: 3, reps: range(12, 15), rest: 60 }),
          item(legpress, { sets: 3, reps: range(15, 15), rest: 60 }),
        ]),
      },
    ],
  };

  const hasItems = (w: WorkoutWriteInput) =>
    w.sessions.some((s) => s.exercises.length > 0);

  if (hasItems(adaptacao)) {
    await studentWorkouts.createBlankDraft(ctx, studentId, adaptacao.name);
    await studentWorkouts.publishDraft(ctx, studentId, adaptacao);
  }
  if (hasItems(hipertrofia)) {
    await studentWorkouts.createBlankDraft(ctx, studentId, hipertrofia.name);
    await studentWorkouts.publishDraft(ctx, studentId, hipertrofia);
  }
  console.info(
    "✓ published aluno workouts (Adaptação archived + Hipertrofia active)",
  );
}

/**
 * Builds a believable set of answers for the seeded aluno's anamnese so the
 * profile's Perfil + Anamnese cards (and a completed status) have real content.
 * Fills the canonical metric keys plus a handful of common questions; anything
 * else is left blank (the cards only show answered questions).
 */
function demoAnamnesisAnswers(sections: AnamnesisSection[]): AnamnesisAnswers {
  // Values respect each question's mask so the demo answers are valid.
  const INT: Record<string, number> = {
    idade: 29,
    altura: 168,
    refeicoes_dia: 4,
    frequencia: 4,
    freq_treino: 4,
    sono: 7,
    semanas_gestacao: 28,
  };
  const DEC: Record<string, string> = {
    peso_atual: "71,4",
    peso_meta: "68",
    peso_habitual: "70",
    agua: "2,5",
  };
  const answers: AnamnesisAnswers = {};
  let extra = 0;
  for (const section of sections) {
    for (const q of section.questions) {
      if (q.type === "boolean") {
        if (/lgpd/i.test(q.key)) answers[q.key] = true; // consent granted
        continue;
      }
      if (q.mask === "date") {
        answers[q.key] = "10/05/1996";
        continue;
      }
      if (q.mask === "pressure") {
        answers[q.key] = "120/80";
        continue;
      }
      if (q.mask === "integer") {
        const v = INT[q.key] ?? Math.max(q.min ?? 1, Math.min(q.max ?? 4, 4));
        answers[q.key] = String(v);
        continue;
      }
      if (q.mask === "decimal") {
        answers[q.key] = DEC[q.key] ?? "2";
        continue;
      }
      // Unmasked free text.
      if (q.key === "experiencia") {
        answers[q.key] = "Intermediária · 3 anos";
        continue;
      }
      const k = q.key.toLowerCase();
      if (/alerg/.test(k)) answers[q.key] = "Lactose (intolerância)";
      else if (/medic/.test(k)) answers[q.key] = "Nenhuma";
      else if (/(les|restri|dor)/.test(k))
        answers[q.key] = "Condromalácia leve no joelho direito — evitar impacto";
      else if (/(rotina|sono)/.test(k))
        answers[q.key] = "Trabalho sentado, ~6h de sono, melhorando";
      else if (extra < 4) {
        answers[q.key] = "Sem observações relevantes.";
        extra++;
      }
    }
  }
  return answers;
}

/**
 * Seeds a realistic check-in timeline for the aluno so BOTH the portal
 * (Evolução) and the coach Feedback/Evolução tabs have data:
 *  - weekly student check-ins (weight trending down), most already answered by
 *    the coach — the newest left PENDING so the coach queue has one to respond to;
 *  - a coach ANNOTATION (note-only) entry;
 *  - a coach PRESENCIAL entry carrying a body assessment;
 *  - a body assessment on an earlier answered check-in, so the Medidas Δ table
 *    has two points to compare.
 * Inserted directly (no R2): the four pose photos use placeholder keys served as
 * labeled SVGs. Idempotent: skips if the aluno already has any check-in.
 */
async function seedAlunoCheckins(
  db: NonNullable<DbModule["db"]>,
  schema: DbModule["schema"],
  clinicId: string,
  studentId: string,
  authorUserId: string,
  coachUserId: string,
): Promise<void> {
  const existing = await db
    .select({ id: schema.studentCheckin.id })
    .from(schema.studentCheckin)
    .where(
      and(
        eq(schema.studentCheckin.clinicId, clinicId),
        eq(schema.studentCheckin.studentId, studentId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    console.info("• skipped aluno check-ins — already present");
    return;
  }

  const isoWeeksAgo = (weeks: number, dayOffset = 0) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - weeks * 7 + dayOffset);
    return d.toISOString().slice(0, 10);
  };
  const addPhotos = async (checkinId: string, date: string) => {
    await db.insert(schema.studentCheckinPhoto).values(
      schema.CHECKIN_POSES.map((pose, i) => ({
        clinicId,
        checkinId,
        pose,
        r2Key: `checkins/seed-${date}-${pose}.webp`,
        sortOrder: i,
      })),
    );
  };

  // Weekly student check-ins, oldest → newest (a cutting phase). `feedback` set
  // = already reviewed; null = still pending (the newest one).
  const points: {
    weeksAgo: number;
    weightKg: number;
    note: string;
    feedback: string | null;
  }[] = [
    { weeksAgo: 5, weightKg: 73.4, note: "Primeira semana, ainda ajustando a dieta.", feedback: "Bom começo! Foca na consistência dos treinos essa semana." },
    { weeksAgo: 4, weightKg: 72.9, note: "Semana boa, treinos completos.", feedback: "Excelente. Mantém a hidratação e o sono que discutimos." },
    { weeksAgo: 3, weightKg: 72.6, note: "Fim de semana pesou, mas mantive o foco.", feedback: "Acontece! O importante é a média da semana. Segue firme." },
    { weeksAgo: 2, weightKg: 72.0, note: "Dormindo melhor, energia lá em cima.", feedback: "Isso! O sono muda tudo. Vamos subir um pouco a carga do treino B." },
    { weeksAgo: 1, weightKg: 71.7, note: "Consegui subir carga no terra.", feedback: "Muito bom! Progressão de carga na medida certa." },
    { weeksAgo: 0, weightKg: 71.4, note: "Ótima! Bati todas as séries essa semana.", feedback: null },
  ];

  for (const p of points) {
    const date = isoWeeksAgo(p.weeksAgo);
    const [checkin] = await db
      .insert(schema.studentCheckin)
      .values({
        clinicId,
        studentId,
        date,
        author: "student",
        authorUserId,
        weightKg: p.weightKg,
        note: p.note,
        feedback: p.feedback,
        feedbackAt: p.feedback ? new Date() : null,
        feedbackByUserId: p.feedback ? coachUserId : null,
      })
      .returning({ id: schema.studentCheckin.id });
    await addPhotos(checkin.id, date);

    // An assessment recorded during the review of the 4-weeks-ago check-in
    // (the "before" point of the Medidas Δ table).
    if (p.weeksAgo === 4) {
      await db.insert(schema.checkinAssessment).values({
        clinicId,
        checkinId: checkin.id,
        studentId,
        assessedAt: date,
        circumferences: { cintura: 82, abdomen: 86, quadril: 100, braco_direito: 34, torax: 97, coxa_direita: 57 },
        skinfolds: { tricipital: 16, subescapular: 18, suprailiaca: 20, abdominal: 24, coxa: 22 },
        bodyFatPct: 21.5,
        recordedByUserId: coachUserId,
      });
    }
  }

  // A coach annotation (note only, no weight/photos/assessment).
  await db.insert(schema.studentCheckin).values({
    clinicId,
    studentId,
    date: isoWeeksAgo(3, 1),
    author: "coach",
    authorUserId: coachUserId,
    weightKg: null,
    note: "Ajustei o descanso do supino para 90s. Reforcei a hidratação.",
  });

  // A coach in-person (presencial) check-in with a body assessment — the "after"
  // point of the Medidas Δ table — plus its own photos.
  const presDate = isoWeeksAgo(1, 1);
  const [pres] = await db
    .insert(schema.studentCheckin)
    .values({
      clinicId,
      studentId,
      date: presDate,
      author: "coach",
      authorUserId: coachUserId,
      weightKg: 71.6,
      note: "Avaliação presencial. Cintura −3 cm no mês, ótima evolução.",
    })
    .returning({ id: schema.studentCheckin.id });
  await addPhotos(pres.id, presDate);
  await db.insert(schema.checkinAssessment).values({
    clinicId,
    checkinId: pres.id,
    studentId,
    assessedAt: presDate,
    circumferences: { cintura: 79, abdomen: 82, quadril: 98, braco_direito: 34.5, torax: 96, coxa_direita: 56 },
    skinfolds: { tricipital: 13, subescapular: 15, suprailiaca: 17, abdominal: 20, coxa: 19 },
    bodyFatPct: 18.5,
    recordedByUserId: coachUserId,
  });

  console.info(
    `✓ seeded ${points.length} aluno check-ins + coach feedback, annotation & presencial assessment`,
  );
}

async function seed() {
  const { db, schema } = await import("@/db");
  const { createAuth } = await import("@/lib/auth");
  const { createClinicForOwner } = await import("@/server/dal/clinics");
  const { studentDiets, studentWorkouts } = await import("@/server/dal");

  if (!db) throw new Error("DATABASE_URL is not set — cannot seed.");

  // Seed-local auth: no OTP e-mails, no Next.js cookies.
  const auth = createAuth({ nextCookiesPlugin: false, sendOtp: async () => {} });

  // Per-plan student caps (reference data). `null` = unlimited. Free blocks the
  // 4th student. Idempotent upsert so re-running keeps them in sync.
  const planLimits: { plan: (typeof schema.PLANS)[number]; maxStudents: number | null }[] = [
    { plan: "free", maxStudents: 3 },
    { plan: "solo", maxStudents: 50 },
    { plan: "clinica", maxStudents: 300 },
    { plan: "enterprise", maxStudents: null },
  ];
  for (const limit of planLimits) {
    await db
      .insert(schema.planLimit)
      .values(limit)
      .onConflictDoUpdate({
        target: schema.planLimit.plan,
        set: { maxStudents: limit.maxStudents },
      });
  }
  console.info("✓ plan limits seeded");
  const password = process.env.SEED_PASSWORD ?? "progresso123";
  const coachEmail = process.env.SEED_COACH_EMAIL ?? "coach@progresso.io";
  const alunoEmail = process.env.SEED_ALUNO_EMAIL ?? "aluno@progresso.io";
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@progresso.io";

  /** Returns the user with this email, signing them up if they don't exist. */
  async function ensureUser(name: string, email: string) {
    const existing = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, email));
    if (existing.length > 0) return existing[0];
    await auth.api.signUpEmail({ body: { name, email, password } });
    const [row] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, email));
    console.info(`✓ created ${email}`);
    return row;
  }

  // Coach — keeps the clinic auto-created for them at sign-up.
  const coach = await ensureUser("Thiago Coach", coachEmail);
  let [coachClinic] = await db
    .select()
    .from(schema.clinic)
    .where(eq(schema.clinic.ownerUserId, coach.id));
  if (!coachClinic) {
    coachClinic = await createClinicForOwner(db, {
      ownerUserId: coach.id,
      name: "Clínica de Thiago",
      plan: "solo",
    });
  }
  await db
    .update(schema.user)
    .set({ emailVerified: true, role: "coach", clinicId: coachClinic.id })
    .where(eq(schema.user.id, coach.id));
  // Give the demo coach a roomy plan so the seeded scenario isn't at the cap.
  await db
    .update(schema.clinic)
    .set({ plan: "clinica" })
    .where(eq(schema.clinic.id, coachClinic.id));

  // Aluno — belongs to the coach's clinic; drop the clinic auto-created for them.
  const aluno = await ensureUser("Ana Aluna", alunoEmail);
  await db
    .update(schema.user)
    .set({ emailVerified: true, role: "aluno", clinicId: coachClinic.id })
    .where(eq(schema.user.id, aluno.id));
  await db.delete(schema.clinic).where(eq(schema.clinic.ownerUserId, aluno.id));

  // Admin — platform admin, no clinic.
  const admin = await ensureUser("Super Admin", adminEmail);
  await db
    .update(schema.user)
    .set({ emailVerified: true, role: "admin", clinicId: null })
    .where(eq(schema.user.id, admin.id));
  await db.delete(schema.clinic).where(eq(schema.clinic.ownerUserId, admin.id));

  // Link the aluno to the coach inside the clinic.
  const link = await db
    .select()
    .from(schema.students)
    .where(
      and(
        eq(schema.students.clinicId, coachClinic.id),
        eq(schema.students.email, alunoEmail),
      ),
    );
  let studentId = link[0]?.id;
  if (!studentId) {
    const [row] = await db
      .insert(schema.students)
      .values({
        clinicId: coachClinic.id,
        coachId: coach.id,
        userId: aluno.id,
        firstName: "Ana",
        lastName: "Aluna",
        email: alunoEmail,
        goal: "Hipertrofia",
        status: "active",
        modality: "online",
      })
      .returning({ id: schema.students.id });
    studentId = row.id;
    console.info("✓ linked aluno to coach");
  }

  // A published diet for the aluno, so the /student portal has something to
  // show. The version stores a self-contained snapshot (DietTree) — no catalog
  // food rows required — mirroring how a real publish freezes the tree.
  const coachCtx: TenantContext = {
    db,
    clinicId: coachClinic.id,
    userId: coach.id,
    role: "coach",
  };
  await seedAlunoDiet(db, schema, studentDiets, coachCtx, studentId);
  await seedAlunoWorkout(db, schema, studentWorkouts, coachCtx, studentId);
  await seedAlunoCheckins(db, schema, coachClinic.id, studentId, aluno.id, coach.id);

  // The clinic's own copy of the starter anamneses (idempotent).
  const { seedClinicAnamneses } = await import("@/server/dal/anamneses");
  const seededAnamneses = await seedClinicAnamneses(db, coachClinic.id, coach.id);
  if (seededAnamneses > 0) {
    console.info(`✓ seeded ${seededAnamneses} anamneses for the clinic`);
  }

  // Give the aluno a WhatsApp number (the primary identifier), then a completed
  // anamnese (filled by the aluno) + the resulting clinic notification — so the
  // profile cards and the bell have real content. Idempotent: skipped once the
  // aluno already has a completed anamnese.
  await db
    .update(schema.students)
    .set({ phone: normalizePhone("11999990000") })
    .where(and(eq(schema.students.id, studentId), isNull(schema.students.phone)));

  const studentAnamneses = await import("@/server/dal/student-anamneses");
  const notificationsDal = await import("@/server/dal/notifications");
  const existingAnamnesis = await studentAnamneses.getStudentAnamnesis(
    coachCtx,
    studentId,
  );
  if (!existingAnamnesis || existingAnamnesis.status !== "completed") {
    // Prefer the hypertrophy starter (matches Ana's goal), else the first one.
    const [tpl] = await db
      .select({ id: schema.anamnesis.id })
      .from(schema.anamnesis)
      .where(
        and(
          eq(schema.anamnesis.clinicId, coachClinic.id),
          eq(schema.anamnesis.objective, "hypertrophy"),
        ),
      )
      .limit(1);
    const [fallback] = tpl
      ? [tpl]
      : await db
          .select({ id: schema.anamnesis.id })
          .from(schema.anamnesis)
          .where(eq(schema.anamnesis.clinicId, coachClinic.id))
          .limit(1);
    const templateId = (tpl ?? fallback)?.id;
    if (templateId) {
      const assigned = await studentAnamneses.assignAnamnesis(
        coachCtx,
        studentId,
        templateId,
      );
      if (assigned.ok) {
        const sa = assigned.studentAnamnesis;
        const filled = await studentAnamneses.submitFill(
          db,
          sa.id,
          demoAnamnesisAnswers(sa.sections),
        );
        if (filled) {
          await notificationsDal.createNotification(db, {
            clinicId: coachClinic.id,
            type: "anamnesis_completed",
            data: {
              studentId,
              studentName: filled.studentName,
              anamnesisName: filled.anamnesisName,
            },
          });
          console.info("✓ seeded aluno anamnese (completed) + notification");
        }
      }
    }
  }

  // An ISOLATED clinic for the admin data-maintenance e2e. The admin spec
  // deletes/imports anamneses here, so it must never touch the demo coach's
  // clinic that the coach/student specs read. Sign-up auto-seeds its starters
  // (with source_key); we just rename it and ensure the set is present.
  const e2eOwner = await ensureUser("Admin E2E Coach", "admin-e2e@progresso.io");
  const [e2eClinic] = await db
    .select()
    .from(schema.clinic)
    .where(eq(schema.clinic.ownerUserId, e2eOwner.id));
  if (e2eClinic) {
    await db
      .update(schema.user)
      .set({ emailVerified: true, role: "coach", clinicId: e2eClinic.id })
      .where(eq(schema.user.id, e2eOwner.id));
    await db
      .update(schema.clinic)
      .set({ name: "Clínica Admin E2E", plan: "clinica" })
      .where(eq(schema.clinic.id, e2eClinic.id));
    await seedClinicAnamneses(db, e2eClinic.id, e2eOwner.id);
    console.info("✓ seeded isolated admin-e2e clinic");
  }

  console.info("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
