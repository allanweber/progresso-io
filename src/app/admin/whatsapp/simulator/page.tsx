import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNotNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { formatPhone } from "@/lib/phone";
import { z } from "@/lib/validation";
import type { WhatsAppMessageDto } from "@/lib/whatsapp-inbox";
import { getAdminSession } from "@/server/admin";
import { whatsapp } from "@/server/dal";

/**
 * DEV-ONLY admin WhatsApp simulator — a SINGLE, self-contained, easily-removable
 * file. Delete this file and the whole feature is gone (nothing else references
 * it).
 *
 * It's a CENTRAL console to simulate the coach↔student WhatsApp conversation
 * from the STUDENT's side: pick a student, see the thread with their coach, and
 * send messages AS that student. Each send flows in through the same
 * `ingestInboundMessage` path the real webhook uses, so it lands in the owning
 * coach's inbox (/coach/whatsapp). The coach's replies come back here (the
 * coach's outbound messages render as "received"), so you can play both sides.
 *
 * Admin-only: the /admin layout gates the subtree and we re-check the admin
 * session here and in the action (a 404 otherwise). An admin has no clinic, so
 * this injects into the TARGET student's clinic directly — that's why it's a
 * small standalone tool rather than the coach-scoped dev endpoint. Linked from
 * the admin WhatsApp overview (/admin/whatsapp).
 *
 * Reach it at /admin/whatsapp/simulator.
 */

// Always evaluated per-request (reads the DB); never statically cached.
export const dynamic = "force-dynamic";

/** HH:MM (24h) for a message timestamp, locale-proof. */
function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/** Active students with a phone, across every clinic, with clinic + coach. */
async function loadStudents() {
  return db
    .select({
      studentId: schema.students.id,
      firstName: schema.students.firstName,
      lastName: schema.students.lastName,
      phone: schema.students.phone,
      clinicId: schema.students.clinicId,
      clinicName: schema.clinic.name,
      coachName: schema.user.name,
    })
    .from(schema.students)
    .innerJoin(schema.clinic, eq(schema.clinic.id, schema.students.clinicId))
    .leftJoin(schema.user, eq(schema.user.id, schema.students.coachId))
    .where(
      and(
        eq(schema.students.status, "active"),
        isNotNull(schema.students.phone),
      ),
    )
    .orderBy(schema.clinic.name, schema.students.firstName);
}

/** Send a message AS the selected student → lands in their coach's inbox. */
async function sendAsStudent(formData: FormData) {
  "use server";
  const session = await getAdminSession();
  if (!session) notFound();

  const parsed = z
    .object({
      studentId: z.string().uuid(),
      body: z.string().trim().min(1).max(4096),
    })
    .safeParse({
      studentId: formData.get("studentId"),
      body: formData.get("body"),
    });
  if (!parsed.success) redirect("/admin/whatsapp/simulator");

  const [student] = await db
    .select({
      clinicId: schema.students.clinicId,
      phone: schema.students.phone,
    })
    .from(schema.students)
    .where(eq(schema.students.id, parsed.data.studentId));

  if (student?.phone) {
    // Inject into the student's OWN clinic so it reaches that clinic's coach.
    await whatsapp.ingestInboundMessage(
      { db, clinicId: student.clinicId, userId: session.user.id, role: "coach" },
      { from: student.phone, body: parsed.data.body },
    );
  }
  redirect(`/admin/whatsapp/simulator?studentId=${parsed.data.studentId}`);
}

type StudentRow = Awaited<ReturnType<typeof loadStudents>>[number];

export default async function AdminWhatsappSimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) notFound();

  const [students, sp] = await Promise.all([loadStudents(), searchParams]);
  const selected: StudentRow | null =
    students.find((s) => s.studentId === sp.studentId) ?? null;

  // Load the selected student's thread with their coach (read-only — getThread
  // does NOT mark the coach's conversation read, so viewing here is side-effect
  // free). Rendered from the STUDENT's side: the student's own inbound messages
  // align right; the coach's outbound messages align left ("received").
  let messages: WhatsAppMessageDto[] = [];
  if (selected) {
    const ctx = {
      db,
      clinicId: selected.clinicId,
      userId: session.user.id,
      role: "coach" as const,
    };
    const inbox = await whatsapp.getInbox(ctx);
    const conv = inbox.conversations.find(
      (c) => c.studentId === selected.studentId,
    );
    if (conv) {
      const thread = await whatsapp.getThread(ctx, conv.id);
      messages = thread?.messages ?? [];
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-[28px]">
          Simulador de WhatsApp
        </h1>
        <span className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-semibold text-[#B45309]">
          dev
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Central de mensagens para simular a conversa entre coaches e alunos. Você
        escreve como o aluno; a mensagem chega na caixa de WhatsApp do coach dono
        do aluno, e as respostas do coach aparecem aqui.
      </p>

      <div className="mt-6 flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] md:h-[calc(100dvh-14rem)] md:min-h-[28rem] md:flex-row">
        {/* Student list */}
        <aside
          className={`w-full flex-shrink-0 overflow-y-auto border-b border-border md:w-72 md:border-b-0 md:border-r ${
            selected ? "hidden md:block" : "block"
          }`}
        >
          {students.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhum aluno ativo com telefone cadastrado.
            </p>
          ) : (
            <ul>
              {students.map((s) => (
                <li key={s.studentId}>
                  <Link
                    href={`/admin/whatsapp/simulator?studentId=${s.studentId}`}
                    className={`flex flex-col gap-0.5 border-b border-border/60 px-4 py-3 transition-colors hover:bg-muted/50 ${
                      s.studentId === selected?.studentId
                        ? "bg-primary-light/40"
                        : ""
                    }`}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.clinicName}
                      {s.coachName ? ` · coach ${s.coachName}` : ""}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatPhone(s.phone) || s.phone}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Conversation (student side) */}
        <section className="flex min-h-[24rem] min-w-0 flex-1 flex-col bg-[#ECE6DD]">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Selecione um aluno para simular a conversa.
            </div>
          ) : (
            <>
              <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
                <Link
                  href="/admin/whatsapp/simulator"
                  className="text-sm text-muted-foreground md:hidden"
                  aria-label="Voltar"
                >
                  ←
                </Link>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {selected.firstName} {selected.lastName}{" "}
                    <span className="font-normal text-muted-foreground">
                      (aluno)
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selected.clinicName}
                    {selected.coachName ? ` → coach ${selected.coachName}` : ""}
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-5">
                {messages.length === 0 ? (
                  <p className="m-auto text-sm text-muted-foreground">
                    Nenhuma mensagem ainda. Envie a primeira como o aluno.
                  </p>
                ) : (
                  messages.map((m) => {
                    const fromStudent = m.direction === "inbound";
                    return (
                      <div
                        key={m.id}
                        className={`flex ${
                          fromStudent ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[75%] rounded-xl px-3 py-2 text-sm leading-snug shadow-sm ${
                            fromStudent ? "bg-[#D9FDD3]" : "bg-white"
                          }`}
                        >
                          {!fromStudent && (
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-primary">
                              coach
                            </span>
                          )}
                          {m.type === "template" && (
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-primary">
                              template
                            </span>
                          )}
                          <p className="whitespace-pre-wrap text-foreground">
                            {m.body}
                          </p>
                          <div className="mt-1 text-right text-[10px] text-muted-foreground">
                            {hhmm(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form
                action={sendAsStudent}
                className="flex flex-shrink-0 items-end gap-2 border-t border-border bg-muted/40 p-3"
              >
                <input type="hidden" name="studentId" value={selected.studentId} />
                <textarea
                  name="body"
                  required
                  rows={1}
                  maxLength={4096}
                  placeholder="Escreva como o aluno…"
                  className="max-h-32 flex-1 resize-none rounded-3xl border border-border bg-white px-4 py-2.5 text-sm outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
                >
                  Enviar
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
