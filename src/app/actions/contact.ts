"use server";

import { sendContactEmail } from "@/lib/email";
import { clientIp, hit } from "@/server/rate-limit";
import { type FieldErrors, parseForm, z } from "@/lib/validation";

export type ContactState =
  | { formError?: string; fieldErrors?: FieldErrors; ok?: boolean }
  | undefined;

const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(120, "Nome muito longo."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Informe um e-mail válido.")),
  message: z
    .string()
    .trim()
    .min(10, "Escreva uma mensagem com pelo menos 10 caracteres.")
    .max(2000, "Mensagem muito longa."),
});

export async function sendContactMessage(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = parseForm(contactSchema, formData);
  if (!parsed.success) return { fieldErrors: parsed.fieldErrors };

  // Curb contact-form spam / e-mail bombing: a handful per IP per hour.
  if (!hit(`contact:${await clientIp()}`, 5, 60 * 60_000)) {
    return { formError: "Muitas mensagens. Aguarde um pouco e tente de novo." };
  }

  try {
    await sendContactEmail(parsed.data);
  } catch {
    return {
      formError: "Não foi possível enviar sua mensagem. Tente novamente.",
    };
  }
  return { ok: true };
}
