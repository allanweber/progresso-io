/**
 * Data Access Layer. All database access for tenant data goes through here,
 * scoped by clinicId (see the rule in AGENTS.md).
 *
 *   import { students } from "@/server/dal";
 *   const list = await students.listStudents(ctx);
 */
export * as admin from "./admin";
export * as clinics from "./clinics";
export * as diets from "./diets";
export * as exercises from "./exercises";
export * as foods from "./foods";
export * as invitations from "./invitations";
export * as plans from "./plans";
export * as studentDiets from "./student-diets";
export * as studentPortal from "./student-portal";
export * as students from "./students";
export * as studentWorkouts from "./student-workouts";
export * as workouts from "./workouts";
