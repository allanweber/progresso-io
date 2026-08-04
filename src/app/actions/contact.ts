"use server";

import { sendContactEmail } from "@/lib/email";
import { type FieldErrors, parseForm, z } from "@/lib/validation";

export type ContactState =
  | { formError?: string; fieldErrors?: FieldErrors; ok?: boolean }
  | undefined;

const contactSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome."),
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

  try {
    await sendContactEmail(parsed.data);
  } catch {
    return {
      formError: "Não foi possível enviar sua mensagem. Tente novamente.",
    };
  }
  return { ok: true };
}
