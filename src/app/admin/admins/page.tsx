"use client";

import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Send, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  adminInviteSchema,
  type AdminAccountDto,
  type AdminInviteDto,
  type AdminListResponse,
} from "@/lib/admin";
import { fieldError } from "@/lib/form";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** A merged table row: an activated admin or a pending invite. */
type Row =
  | ({ kind: "admin" } & AdminAccountDto)
  | ({ kind: "invite" } & AdminInviteDto);

const columnHelper = createColumnHelper<Row>();

/** Why an admin row can't be deleted (null = deletable). */
function deleteBlocked(row: AdminAccountDto, lastAdmin: boolean): string | null {
  if (row.isSelf) return "Você não pode remover a si mesmo.";
  if (row.isBootstrap) return "O administrador principal não pode ser removido.";
  if (lastAdmin) return "A plataforma precisa de ao menos um administrador.";
  return null;
}

export default function AdminAdminsPage() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminAccountDto | null>(
    null,
  );

  const list = useQuery({
    queryKey: ["admin-admins"],
    queryFn: () => apiFetch<AdminListResponse>("/api/admin/admins"),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-admins"] });
  }

  const invite = useMutation({
    mutationFn: (values: { name: string; email: string }) =>
      apiFetch<{ ok: boolean }>("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      invalidate();
      setInviteOpen(false);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/admin/admins/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      setPendingDelete(null);
    },
  });
  const resend = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/admin/admin-invitations/${id}/resend`, {
        method: "POST",
      }),
    onSuccess: invalidate,
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/admin/admin-invitations/${id}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });

  const inviteForm = useForm({
    defaultValues: { name: "", email: "" },
    validators: { onChange: adminInviteSchema },
    onSubmit: async ({ value }) => {
      try {
        await invite.mutateAsync(value);
      } catch {
        /* surfaced via invite.error */
      }
    },
  });

  const lastAdmin = (list.data?.total ?? 0) <= 1;
  const busyRow = resend.isPending || revoke.isPending;

  const rows = useMemo<Row[]>(() => {
    const admins = (list.data?.admins ?? []).map(
      (a): Row => ({ kind: "admin", ...a }),
    );
    const invites = (list.data?.invites ?? []).map(
      (i): Row => ({ kind: "invite", ...i }),
    );
    return [...admins, ...invites];
  }, [list.data]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "person",
        header: "Administrador",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <div className="min-w-0">
              <div className="truncate font-semibold text-foreground">
                {r.name}
                {r.kind === "admin" && r.isSelf && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    (você)
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-[#94A3B8]">{r.email}</div>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "status",
        header: "Status",
        cell: (ctx) =>
          ctx.row.original.kind === "admin" ? (
            <Badge variant="clinic">Ativo</Badge>
          ) : (
            <Badge variant="warn">Pendente</Badge>
          ),
      }),
      columnHelper.display({
        id: "createdAt",
        header: "Desde",
        cell: (ctx) => (
          <span className="text-body-dense text-[#94A3B8]">
            {dateFmt.format(new Date(ctx.row.original.createdAt))}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (ctx) => {
          const r = ctx.row.original;
          if (r.kind === "admin") {
            const blocked = deleteBlocked(r, lastAdmin);
            return (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setPendingDelete(r)}
                  disabled={blocked !== null}
                  title={blocked ?? undefined}
                  aria-label={`Excluir ${r.email}`}
                  className="flex items-center gap-1.5 rounded-[10px] border-[1.5px] border-input px-2.5 py-1.5 text-body-dense font-medium text-destructive transition-colors hover:border-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:border-input disabled:hover:bg-transparent"
                >
                  <Trash2 className="size-4" />
                  Excluir
                </button>
              </div>
            );
          }
          return (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => resend.mutate(r.id)}
                disabled={busyRow}
                className="flex items-center gap-1.5 rounded-[10px] border-[1.5px] border-input px-2.5 py-1.5 text-body-dense font-medium text-[#334155] transition-colors hover:bg-secondary disabled:opacity-60"
              >
                <Send className="size-4" />
                Reenviar
              </button>
              <button
                type="button"
                onClick={() => revoke.mutate(r.id)}
                disabled={busyRow}
                aria-label={`Revogar convite de ${r.email}`}
                className="flex items-center gap-1.5 rounded-[10px] border-[1.5px] border-input px-2.5 py-1.5 text-body-dense font-medium text-destructive transition-colors hover:border-destructive hover:bg-destructive/5 disabled:opacity-60"
              >
                <X className="size-4" />
                Revogar
              </button>
            </div>
          );
        },
      }),
    ],
    [lastAdmin, busyRow, resend, revoke],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const inviteServerErrors =
    invite.error instanceof ApiError ? invite.error.fieldErrors : undefined;
  const inviteBanner =
    invite.error instanceof ApiError && !invite.error.fieldErrors
      ? invite.error.message
      : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-6 text-primary" strokeWidth={2} />
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Administradores
          </h1>
        </div>
        <Button
          onClick={() => {
            inviteForm.reset();
            invite.reset();
            setInviteOpen(true);
          }}
        >
          <UserPlus className="size-4" />
          Convidar admin
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Convide novos administradores por e-mail — eles definem a própria senha
        pelo link. A remoção é permanente.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        {list.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Carregando administradores…
          </div>
        ) : list.isError ? (
          <div className="p-10 text-center text-sm text-destructive">
            {(list.error as Error).message}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum administrador ainda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-border">
                  {hg.headers.map((header) => (
                    <TableHead key={header.id}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {(resend.isError || revoke.isError) && (
        <p className="mt-3 text-body-dense font-medium text-destructive">
          {((resend.error ?? revoke.error) as ApiError).message}
        </p>
      )}

      {/* Convidar admin */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(o) => {
          if (!o && !invite.isPending) setInviteOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar administrador</DialogTitle>
            <DialogDescription>
              Enviaremos um e-mail para que a pessoa defina a senha e ative o
              acesso de administrador.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              inviteForm.handleSubmit();
            }}
            className="space-y-4"
          >
            {inviteBanner && (
              <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
                {inviteBanner}
              </div>
            )}

            <inviteForm.Field name="name">
              {(field) => (
                <Field
                  id="admin-name"
                  label="Nome"
                  placeholder="Maria Silva"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  error={fieldError(field, inviteServerErrors?.name)}
                />
              )}
            </inviteForm.Field>
            <inviteForm.Field name="email">
              {(field) => (
                <Field
                  id="admin-email"
                  type="email"
                  label="E-mail"
                  placeholder="maria@email.com"
                  autoComplete="off"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  error={fieldError(field, inviteServerErrors?.email)}
                />
              )}
            </inviteForm.Field>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={invite.isPending}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? "Enviando…" : "Enviar convite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Excluir admin */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o && !remove.isPending) setPendingDelete(null);
        }}
      >
        <DialogContent>
          {pendingDelete && (
            <>
              <DialogHeader className="flex-row items-center gap-2.5 space-y-0">
                <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10">
                  <Trash2 className="size-5 text-destructive" />
                </div>
                <DialogTitle>Excluir administrador</DialogTitle>
              </DialogHeader>
              <DialogDescription className="mt-3">
                Excluir{" "}
                <span className="font-semibold text-foreground">
                  {pendingDelete.name}
                </span>{" "}
                ({pendingDelete.email})? Esta ação é permanente e remove o acesso
                de administrador, com suas sessões e credenciais. Não é possível
                desfazer.
              </DialogDescription>

              {remove.error instanceof ApiError && (
                <div className="mt-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
                  {remove.error.message}
                </div>
              )}

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={remove.isPending}>
                    Cancelar
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => remove.mutate(pendingDelete.id)}
                  disabled={remove.isPending}
                >
                  {remove.isPending ? "Excluindo…" : "Excluir definitivamente"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
