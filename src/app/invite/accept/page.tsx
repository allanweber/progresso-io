"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api-client";
import { fieldError } from "@/lib/form";
import { z } from "@/lib/validation";

type InviteCheck = { valid: boolean; email?: string; firstName?: string };

const passwordSchema = z
  .object({
    password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem.",
  });

function AcceptInner() {
  const token = useSearchParams().get("token") ?? "";

  const check = useQuery({
    queryKey: ["invite", token],
    queryFn: () =>
      apiFetch<InviteCheck>(
        `/api/invite/accept?token=${encodeURIComponent(token)}`,
      ),
    enabled: token.length > 0,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: (password: string) =>
      apiFetch<{ ok: boolean; redirect: string }>("/api/invite/accept", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      }),
    onSuccess: (data) => {
      // Hard navigation so the server picks up the freshly-set session cookie.
      window.location.assign(data.redirect ?? "/student");
    },
  });

  const form = useForm({
    defaultValues: { password: "", confirm: "" },
    validators: { onChange: passwordSchema },
    onSubmit: async ({ value }) => {
      try {
        await accept.mutateAsync(value.password);
      } catch {
        /* surfaced via accept.error */
      }
    },
  });

  const invalid =
    token.length === 0 || check.isError || (check.data && !check.data.valid);

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>

      {check.isLoading ? (
        <p className="text-center text-sm text-muted-foreground">
          Verificando convite…
        </p>
      ) : invalid ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <h1 className="font-heading text-xl font-bold text-foreground">
            Convite inválido ou expirado
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Peça um novo convite ao seu coach para ativar seu acesso.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-block text-sm font-medium text-primary hover:underline"
          >
            Ir para o login
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white p-8 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-foreground">
            Ative seu acesso
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Olá{check.data?.firstName ? `, ${check.data.firstName}` : ""}! Defina
            uma senha para entrar como aluno
            {check.data?.email ? ` (${check.data.email})` : ""}.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="mt-6 space-y-4"
          >
            {accept.error instanceof ApiError && (
              <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
                {accept.error.message}
              </div>
            )}

            <form.Field name="password">
              {(field) => (
                <Field
                  id="password"
                  label="Senha"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  error={fieldError(field)}
                />
              )}
            </form.Field>

            <form.Field name="confirm">
              {(field) => (
                <Field
                  id="confirm"
                  label="Confirmar senha"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  error={fieldError(field)}
                />
              )}
            </form.Field>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={accept.isPending}
            >
              {accept.isPending ? "Ativando…" : "Ativar acesso"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-light px-4 py-12">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Carregando…</p>
        }
      >
        <AcceptInner />
      </Suspense>
    </main>
  );
}
