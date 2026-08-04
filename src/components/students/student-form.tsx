"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { AnyFieldApi } from "@tanstack/react-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch, type StudentDto } from "@/lib/api-client";
import type { Modality } from "@/db/schema";
import {
  MODALITY_LABELS,
  MODALITY_VALUES,
  studentFormSchema,
} from "@/lib/students";

/**
 * The one form used for both creating and editing a student (per the "one form"
 * decision). It POSTs to the students collection or PUTs to the student, both
 * via TanStack Query, and validates with the same zod schema the API uses. On
 * success it invalidates the roster cache and navigates to the profile.
 */

type StudentFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  goal: string;
  modality: Modality;
};

const EMPTY: StudentFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  goal: "",
  modality: "online",
};

function toValues(student: StudentDto): StudentFormValues {
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    phone: student.phone ?? "",
    goal: student.goal ?? "",
    modality: student.modality,
  };
}

/** First client-side (touched) error for a field, else the server's message. */
function fieldError(field: AnyFieldApi, serverError?: string): string | undefined {
  if (field.state.meta.isTouched && field.state.meta.errors.length > 0) {
    const first = field.state.meta.errors[0];
    return typeof first === "string" ? first : first?.message;
  }
  return serverError;
}

export function StudentForm({
  mode,
  student,
}: {
  mode: "create" | "edit";
  student?: StudentDto;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (values: StudentFormValues) =>
      apiFetch<{ student: StudentDto }>(
        mode === "create" ? "/api/students" : `/api/students/${student!.id}`,
        { method: mode === "create" ? "POST" : "PUT", body: JSON.stringify(values) },
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["student", data.student.id] });
      router.push(`/coach/students/${data.student.id}`);
      router.refresh();
    },
  });

  const form = useForm({
    defaultValues: student ? toValues(student) : EMPTY,
    validators: { onChange: studentFormSchema },
    onSubmit: async ({ value }) => {
      // Errors are surfaced through `mutation` below; swallow the rejection so
      // TanStack Form doesn't treat it as an unhandled submit failure.
      try {
        await mutation.mutateAsync(value);
      } catch {
        /* handled via mutation.error */
      }
    },
  });

  const serverErrors =
    mutation.error instanceof ApiError ? mutation.error.fieldErrors : undefined;
  const banner =
    mutation.error instanceof ApiError && !mutation.error.fieldErrors
      ? mutation.error.message
      : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-5"
    >
      {banner && (
        <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          {banner}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <form.Field name="firstName">
          {(field) => (
            <Field
              id="firstName"
              label="Nome"
              placeholder="Ana"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={fieldError(field, serverErrors?.firstName)}
            />
          )}
        </form.Field>

        <form.Field name="lastName">
          {(field) => (
            <Field
              id="lastName"
              label="Sobrenome"
              placeholder="Aluna"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={fieldError(field, serverErrors?.lastName)}
            />
          )}
        </form.Field>
      </div>

      <form.Field name="email">
        {(field) => (
          <Field
            id="email"
            label="E-mail"
            type="email"
            placeholder="ana@email.com"
            autoComplete="off"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            error={fieldError(field, serverErrors?.email)}
          />
        )}
      </form.Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <form.Field name="phone">
          {(field) => (
            <Field
              id="phone"
              label="Telefone (opcional)"
              placeholder="(11) 90000-0000"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={fieldError(field, serverErrors?.phone)}
            />
          )}
        </form.Field>

        <form.Field name="modality">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="modality">Modalidade</Label>
              <select
                id="modality"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value as Modality)}
                className="flex h-11 w-full rounded-[10px] border-[1.5px] border-input bg-white px-3.5 text-sm text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
              >
                {MODALITY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {MODALITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="goal">
        {(field) => (
          <Field
            id="goal"
            label="Objetivo (opcional)"
            placeholder="Hipertrofia, emagrecimento…"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            error={fieldError(field, serverErrors?.goal)}
          />
        )}
      </form.Field>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? "Salvando…"
            : mode === "create"
              ? "Adicionar aluno"
              : "Salvar alterações"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
