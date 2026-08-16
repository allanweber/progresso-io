import { NextResponse } from "next/server";
import { z } from "@/lib/validation";

import { formatBRL, PLAN_PRICE_CENTS } from "@/lib/billing";
import { sendSubscriptionRequestEmail } from "@/lib/email";
import { PLAN_META, SIGNUP_PLAN_IDS } from "@/lib/plans";
import { buildPixPayload, pixReceiver } from "@/lib/pix";
import { getSession } from "@/lib/session";
import { billing, clinics } from "@/server/dal";
import { apiError, forbidden, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * "Assinar" — a coach asking to subscribe, from inside the app.
 *
 * Raises (or reuses) the fatura for the chosen plan and returns the Pix
 * copia-e-cola so the coach can pay immediately, then e-mails CONTACT_EMAIL so
 * the payment can be reconciled. **Raising the fatura does not grant the plan**:
 * an admin still confirms the money and marks it paid, which flips the plan.
 *
 * The plan is validated against the self-serve allow-list and the price is
 * derived server-side — the client never sends an amount.
 */

/** Only the self-serve plans; Enterprise is "sob consulta" and has no price. */
const subscriptionSchema = z.object({
  plan: z.enum(SIGNUP_PLAN_IDS).refine((p) => p !== "free", {
    message: "Escolha um plano pago.",
  }),
});

export const POST = withRoute("coach.subscription.request", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("Escolha um plano válido para assinar.", 400);
  }
  const { plan } = parsed.data;

  const result = await billing.requestSubscription(ctx, plan);
  if ("error" in result) {
    return apiError(
      "Esse plano não pode ser assinado pelo app. Fale com a gente.",
      400,
    );
  }
  const { invoice, created } = result;

  const clinic = await clinics.getClinic(ctx);
  if (!clinic) return notFound("Clínica não encontrada.");

  // Pix is optional infrastructure: with no PIX_KEY the fatura still exists and
  // the coach is told to await contact, rather than seeing a broken code.
  const receiver = pixReceiver();
  const pixPayload = receiver
    ? buildPixPayload({
        key: receiver.key,
        merchantName: receiver.merchantName,
        merchantCity: receiver.merchantCity,
        amountCents: invoice.totalCents,
        reference: String(invoice.number),
      })
    : null;

  // Only on first raise — reopening the panel shouldn't re-notify. Awaited so a
  // serverless invocation can't be frozen mid-send; it never throws.
  if (created) {
    // Identity comes from the session, never from the request body.
    const session = await getSession();
    await sendSubscriptionRequestEmail({
      clinicName: clinic.name,
      coachName: session?.user.name ?? "Coach",
      coachEmail: session?.user.email ?? "—",
      planName: PLAN_META[plan].name,
      amount: formatBRL(PLAN_PRICE_CENTS[plan] ?? 0),
      invoiceNumber: invoice.number,
    });
  }

  return NextResponse.json({
    invoice: {
      id: invoice.id,
      number: invoice.number,
      dueDate: invoice.dueDate,
      totalCents: invoice.totalCents,
    },
    pixPayload,
    planName: PLAN_META[plan].name,
  });
});
