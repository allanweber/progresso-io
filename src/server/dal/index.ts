/**
 * Data Access Layer. All database access for tenant data goes through here,
 * scoped by clinicId (see the rule in AGENTS.md).
 *
 *   import { students } from "@/server/dal";
 *   const list = await students.listStudents(ctx);
 */
export * as admin from "./admin";
export * as adminInvitations from "./admin-invitations";
export * as billing from "./billing";
export * as anamneses from "./anamneses";
export * as clinics from "./clinics";
export * as coachCheckins from "./coach-checkins";
export * as coachInvitations from "./coach-invitations";
export * as coaches from "./coaches";
export * as diets from "./diets";
export * as exercises from "./exercises";
export * as foods from "./foods";
export * as invitations from "./invitations";
export * as notifications from "./notifications";
export * as plans from "./plans";
export * as starters from "./starters";
export * as studentAnamneses from "./student-anamneses";
export * as studentCheckins from "./student-checkins";
export * as studentDiets from "./student-diets";
export * as studentPortal from "./student-portal";
export * as students from "./students";
export * as studentWorkouts from "./student-workouts";
export * as workouts from "./workouts";
