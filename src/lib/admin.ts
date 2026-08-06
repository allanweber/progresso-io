import {
  FOOD_SORTS,
  type FoodNutrientDto,
  type FoodSubstituteDto,
  type FoodType,
} from "@/lib/foods";
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

/* -------------------------------------------------------------------------- */
/*  Food catalog — platform admin (phase 3)                                    */
/* -------------------------------------------------------------------------- */

export type AdminFoodOrigin = "base" | "clinic";

/**
 * Query for the admin's cross-clinic food listing. `origin` narrows to the
 * shared base or to clinic-owned foods; `clinic` narrows to one clinic; `sort`
 * mirrors the coach listing's whitelist. Validated before hitting the DAL.
 */
export const adminFoodListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  group: z.string().trim().max(80).optional(),
  type: z.enum(["ingrediente", "preparacao"]).optional(),
  origin: z.enum(["base", "clinic"]).optional(),
  clinic: z.string().uuid("Clínica inválida.").optional(),
  archived: z.boolean().optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(FOOD_SORTS).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});
export type AdminFoodListQuery = z.output<typeof adminFoodListQuerySchema>;

/** A row in the admin food listing (per 100 g; hot macros + clinic). */
export type AdminFoodListItemDto = {
  id: string;
  code: string | null;
  description: string;
  type: FoodType;
  groupName: string;
  groupSlug: string;
  origin: AdminFoodOrigin;
  clinicName: string | null;
  archived: boolean;
  substituteCount: number;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
};

export type AdminFoodListResponse = {
  items: AdminFoodListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** An admin food-detail: identity + who owns it + full profile + base subs. */
export type AdminFoodDetailDto = {
  id: string;
  code: string | null;
  description: string;
  type: FoodType;
  groupName: string;
  groupSlug: string;
  origin: AdminFoodOrigin;
  clinicName: string | null;
  archived: boolean;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
  nutrients: FoodNutrientDto[];
  substitutes: FoodSubstituteDto[];
};
