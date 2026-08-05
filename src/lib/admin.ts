import type { StudentDto } from "@/lib/students";
import { z } from "@/lib/validation";

/**
 * Client-safe admin domain: the DTOs the admin screens read and the zod schema
 * the students API validates its filters with. No server/database import, so it
 * bundles into the client page.
 */

/** A clinic as offered in the admin's clinic filter. */
export type ClinicOption = { id: string; name: string };

/** A platform student row: the student plus its clinic name and access flag. */
export type AdminStudentDto = StudentDto & {
  clinicName: string;
  hasAccount: boolean;
};

/**
 * Filters for the platform-wide student list. Both optional — omitted means
 * "no filter". `clinicId` must be a real UUID; `email` is a trimmed, lowercased
 * substring. Validated on the server before hitting the admin DAL.
 */
export const adminStudentFilterSchema = z.object({
  clinicId: z.string().uuid("Clínica inválida.").optional(),
  email: z.string().trim().toLowerCase().max(200).optional(),
});

export type AdminStudentFilterValues = z.output<typeof adminStudentFilterSchema>;
