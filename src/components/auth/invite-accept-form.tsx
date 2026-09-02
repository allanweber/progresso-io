"use client";

import Link from "next/link";
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

/**
 * Which invite this set-password screen activates. All are token-based accept
 * flows that create a login and set a password, differing only in endpoint and
 * copy: `student` activates an aluno (the default), `admin` a platform admin,
 * `coach` a coach joining a clinic's team.
 */
type InviteKind = "student" | "admin" | "coach";

const INVITE_CONFIG: Record<
  InviteKind,
  { endpoint: string; queryKey: string; roleLabel: string }
> = {
  student: {
    endpoint: "/api/invite/accept",
    queryKey: "invite",
    roleLabel: "aluno",
  },
  admin: {
    endpoint: "/api/admin-invitations/accept",
    queryKey: "admin-invite",
    roleLabel: "administrador",
  },
  coach: {
    endpoint: "/api/coach-invitations/accept",
    queryKey: "coach-invite",
    roleLabel: "coach",
  },
};

/**
 * Client island for the invite-accept page. The token is read on the server
 * (the page is a dynamic Server Component) and passed in as a prop — so the
 * route renders fresh per request instead of being a statically-cached shell
 * that only says "Carregando…" until client JS hydrates. `kind` selects the
 * student (default) or admin accept flow.
 */
export function InviteAcceptForm({
  token,
  kind = "student",
  loginPath = "/login",
}: {
  token: string;
  kind?: InviteKind;
  /**
   * Where to send the newly-activated account to sign in. Defaults to the
   * canonical `/login`; a branded portal passes its own `/<slug>/entrar` so an
   * aluno who arrived through their clinic's address never leaves it.
   */
  loginPath?: string;
}) {
  const config = INVITE_CONFIG[kind];
  const check = useQuery({
    queryKey: [config.queryKey, token],
    queryFn: () =>
      apiFetch<InviteCheck>(
        `${config.endpoint}?token=${encodeURIComponent(token)}`,
      ),
    enabled: token.length > 0,
    retry: false,
  });

  const accept = useMutation({
    // Provision the account only — no session is ever established.
    mutationFn: (password: string) =>
      apiFetch<{ ok: boolean }>(config.endpoint, {
        method: "POST",
        body: JSON.stringify({ token, password }),
      }),
    onSuccess: () => {
      // Activating the account never signs the user in (no session, no forged
      // cookie) — send them to sign in themselves, mirroring the e-mail OTP
      // flow. `loginPath` keeps a branded activation inside its own portal.
      window.location.assign(`${loginPath}?activated=1`);
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

  // A genuinely bad invite (missing/unknown/expired token) vs. a failure to
  // reach the server are different situations: the first is terminal, the
  // second is worth retrying.
  const invalidInvite =
    token.length === 0 || (check.data && !check.data.valid);

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>

      {check.isLoading ? (
        <p className="text-center text-sm text-muted-foreground">
          Verificando convite…
        </p>
      ) : check.isError ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-rest">
          <h1 className="font-heading text-xl font-bold text-foreground">
            Não foi possível verificar o convite
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Verifique sua conexão e tente novamente.
          </p>
          <Button
            type="button"
            size="lg"
            className="mt-5 w-full"
            onClick={() => check.refetch()}
            disabled={check.isFetching}
          >
            {check.isFetching ? "Verificando…" : "Tentar novamente"}
          </Button>
        </div>
      ) : invalidInvite ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-rest">
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
        <div className="rounded-2xl bg-white p-8 shadow-rest">
          <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-foreground">
            Ative seu acesso
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Olá{check.data?.firstName ? `, ${check.data.firstName}` : ""}! Defina
            uma senha para entrar como {config.roleLabel}
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
              <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
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
