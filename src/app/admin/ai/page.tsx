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
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Dialog,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  cacheHitRatio,
  formatCacheHitRatio,
  formatTokens,
  type AdminAiOverviewDto,
  type AdminAiTenantDto,
} from "@/lib/ai-programs";
import {
  formatMicroUsd,
  formatUsdPerMtok,
  providerPriceSchema,
  toPriceFormValues,
  type ProviderPriceDto,
  type ProviderPriceInput,
} from "@/lib/provider-prices";
import { fieldError } from "@/lib/form";
import { PLAN_META } from "@/lib/plans";
import type { Plan } from "@/db/schema";

/**
 * Platform-admin AI overview + price list.
 *
 * **Uso** replaces assumptions with measurements: `docs/monetization.md` guesses
 * a token count per generation, and `docs/ai-generator.md` claims the base-only
 * catalog keeps the prompt prefix in the provider's cache. Both get checked here.
 *
 * **Preços** is why the Custo column can exist at all. Cost is never stored on a
 * generation — each one is priced at read time against the `provider_price` in
 * force the day it ran. So a vendor price change is a new row (history stays
 * correct) and a mistyped price is an edit (history gets *fixed*), neither of
 * which a number frozen onto the audit row could do.
 */

const tenantColumn = createColumnHelper<AdminAiTenantDto>();
const priceColumn = createColumnHelper<ProviderPriceDto>();

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** KPI tile for the header row. */
function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-heading text-3xl font-bold text-foreground">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

const EMPTY_PRICE: ProviderPriceInput = {
  provider: "openai-compatible",
  model: "",
  effectiveFrom: "",
  inputUsdPerMtok: "",
  outputUsdPerMtok: "",
  cachedInputUsdPerMtok: "",
  note: "",
};

export default function AdminAiPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ProviderPriceDto | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProviderPriceDto | null>(
    null,
  );

  const overview = useQuery({
    queryKey: ["admin-ai"],
    queryFn: () => apiFetch<AdminAiOverviewDto>("/api/admin/ai"),
  });
  const prices = useQuery({
    queryKey: ["admin-ai-prices"],
    queryFn: () =>
      apiFetch<{ prices: ProviderPriceDto[] }>("/api/admin/ai/prices"),
  });

  function invalidate() {
    // Both: a price change reprices the usage table, which is the whole point.
    queryClient.invalidateQueries({ queryKey: ["admin-ai"] });
    queryClient.invalidateQueries({ queryKey: ["admin-ai-prices"] });
  }

  const save = useMutation({
    mutationFn: (value: ProviderPriceInput) =>
      editing === "new" || editing === null
        ? apiFetch("/api/admin/ai/prices", {
            method: "POST",
            body: JSON.stringify(value),
          })
        : apiFetch(`/api/admin/ai/prices/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify(value),
          }),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/admin/ai/prices/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setPendingDelete(null);
      invalidate();
    },
  });

  const form = useForm({
    defaultValues:
      editing && editing !== "new" ? toPriceFormValues(editing) : EMPTY_PRICE,
    validators: { onChange: providerPriceSchema },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync(value);
      } catch {
        /* surfaced via save.error */
      }
    },
  });

  const serverErrors =
    save.error instanceof ApiError ? save.error.fieldErrors : undefined;

  const tenantColumns = useMemo(
    () => [
      tenantColumn.accessor("name", {
        header: "Studio",
        cell: (ctx) => <span className="font-medium">{ctx.getValue()}</span>,
      }),
      tenantColumn.display({
        id: "plan",
        header: "Plano",
        cell: (ctx) => {
          const r = ctx.row.original;
          const label =
            PLAN_META[r.effectivePlan as Plan]?.name ?? r.effectivePlan;
          const trialing = r.effectivePlan !== r.plan;
          return (
            <div className="flex items-center gap-1.5">
              <Badge variant="neutral">{label}</Badge>
              {/* A trialing free clinic gets Solo's allowance — without saying so
                  the limit column looks wrong for its stored plan. */}
              {trialing && (
                <span className="text-xs text-muted-foreground">trial</span>
              )}
            </div>
          );
        },
      }),
      tenantColumn.display({
        id: "used",
        header: "Gerações",
        cell: (ctx) => {
          const r = ctx.row.original;
          const atLimit = r.limit !== null && r.used >= r.limit;
          return (
            <span
              className={atLimit ? "font-semibold text-destructive" : undefined}
            >
              {r.limit === null ? r.used : `${r.used} / ${r.limit}`}
            </span>
          );
        },
      }),
      tenantColumn.display({
        id: "outcome",
        header: "OK / falhas",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <span>
              {r.succeeded}
              {r.failed > 0 && (
                <span className="text-destructive"> / {r.failed}</span>
              )}
              {/* Repairs are successes that cost a second round-trip — a rising
                  count means the prompt is drifting out of spec. */}
              {r.repaired > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({r.repaired} reparo{r.repaired === 1 ? "" : "s"})
                </span>
              )}
            </span>
          );
        },
      }),
      tenantColumn.display({
        id: "cache",
        header: "Cache",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <span className="tabular-nums">
              {formatCacheHitRatio(
                cacheHitRatio(r.inputTokens, r.cachedInputTokens),
              )}
            </span>
          );
        },
      }),
      tenantColumn.display({
        id: "tokens",
        header: "Tokens (in / out)",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <span className="tabular-nums text-muted-foreground">
              {formatTokens(r.inputTokens + r.cachedInputTokens)} /{" "}
              {formatTokens(r.outputTokens)}
            </span>
          );
        },
      }),
      tenantColumn.display({
        id: "cost",
        header: "Custo",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <span className="tabular-nums">
              {formatMicroUsd(r.costMicroUsd)}
              {/* Not decoration: it names a fixable gap — add the price for that
                  model and the figure completes itself. */}
              {r.unpricedGenerations > 0 && (
                <span
                  className="ml-1.5 text-xs text-muted-foreground"
                  title={`${r.unpricedGenerations} geração(ões) sem preço cadastrado para o modelo/data`}
                >
                  parcial
                </span>
              )}
            </span>
          );
        },
      }),
    ],
    [],
  );

  const priceColumns = useMemo(
    () => [
      priceColumn.display({
        id: "model",
        header: "Modelo",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <div>
              <div className="font-medium">{r.model}</div>
              <div className="text-xs text-muted-foreground">{r.provider}</div>
            </div>
          );
        },
      }),
      priceColumn.accessor("effectiveFrom", {
        header: "Vigente desde",
        cell: (ctx) => {
          const from = new Date(ctx.getValue());
          const future = from.getTime() > Date.now();
          return (
            <span className="whitespace-nowrap">
              {dateFmt.format(from)}
              {/* A future row is legal and simply doesn't apply yet — that's how
                  an announced change is entered ahead of time. */}
              {future && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  agendado
                </span>
              )}
            </span>
          );
        },
      }),
      priceColumn.display({
        id: "input",
        header: "Entrada / M",
        cell: (ctx) => (
          <span className="tabular-nums">
            {formatUsdPerMtok(ctx.row.original.inputMicroUsdPerMtok)}
          </span>
        ),
      }),
      priceColumn.display({
        id: "cached",
        header: "Cache / M",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <span className="tabular-nums">
              {r.cachedInputMicroUsdPerMtok === null ? (
                <span
                  className="text-muted-foreground"
                  title="Não informado — cobrado como entrada normal"
                >
                  = entrada
                </span>
              ) : (
                formatUsdPerMtok(r.cachedInputMicroUsdPerMtok)
              )}
            </span>
          );
        },
      }),
      priceColumn.display({
        id: "output",
        header: "Saída / M",
        cell: (ctx) => (
          <span className="tabular-nums">
            {formatUsdPerMtok(ctx.row.original.outputMicroUsdPerMtok)}
          </span>
        ),
      }),
      priceColumn.accessor("note", {
        header: "Fonte",
        cell: (ctx) => (
          <span className="text-xs text-muted-foreground">
            {ctx.getValue() ?? "—"}
          </span>
        ),
      }),
      priceColumn.display({
        id: "actions",
        header: "",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Editar preço de ${r.model}`}
                onClick={() => {
                  save.reset();
                  setEditing(r);
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remover preço de ${r.model}`}
                onClick={() => setPendingDelete(r)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          );
        },
      }),
    ],
    [save],
  );

  const tenantTable = useReactTable({
    data: overview.data?.tenants ?? [],
    columns: tenantColumns,
    getCoreRowModel: getCoreRowModel(),
  });
  const priceTable = useReactTable({
    data: prices.data?.prices ?? [],
    columns: priceColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totals = overview.data?.totals;
  const ratio = totals
    ? cacheHitRatio(totals.inputTokens, totals.cachedInputTokens)
    : null;
  const monthLabel = overview.data
    ? new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
      }).format(new Date(overview.data.monthStart))
    : "";

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-[28px]">
          IA
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uso e custo por clínica{monthLabel && ` — ${monthLabel}`}.
        </p>
      </div>

      {/* An all-zero table means two different things; say which. */}
      {overview.data && !overview.data.configured && (
        <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-[13px] text-amber-800">
            Nenhum provedor de IA configurado nesta instalação — o botão “Gerar
            com IA” está desativado para todos os coaches. Defina{" "}
            <code className="font-mono">LLM_API_KEY</code>,{" "}
            <code className="font-mono">LLM_BASE_URL</code> e{" "}
            <code className="font-mono">LLM_MODEL</code>.
          </p>
        </div>
      )}

      <Tabs defaultValue="usage" className="mt-6">
        <TabsList>
          <TabsTrigger value="usage">Uso</TabsTrigger>
          <TabsTrigger value="prices">Preços</TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              label="Gerações no mês"
              value={overview.isLoading ? "…" : totals?.generations ?? 0}
              hint={
                totals && totals.failed > 0
                  ? `${totals.failed} falharam`
                  : undefined
              }
            />
            <Kpi
              label="Taxa de cache"
              value={overview.isLoading ? "…" : formatCacheHitRatio(ratio)}
              hint="tokens de entrada servidos do cache"
            />
            <Kpi
              label="Custo no mês"
              value={
                overview.isLoading
                  ? "…"
                  : formatMicroUsd(totals?.costMicroUsd ?? null)
              }
              hint={
                totals && totals.unpricedGenerations > 0
                  ? `parcial — ${totals.unpricedGenerations} sem preço`
                  : "calculado sobre a aba Preços"
              }
            />
            <Kpi
              label="No limite"
              value={overview.isLoading ? "…" : totals?.clinicsAtLimit ?? 0}
              hint="clínicas que gastaram a cota"
            />
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
            <div className="border-b border-border px-4 py-3.5">
              <h2 className="font-heading text-[15px] font-semibold">
                Uso de IA por tenant
              </h2>
            </div>
            {overview.isError ? (
              <p className="px-4 py-9 text-center text-sm text-destructive">
                {(overview.error as Error).message}
              </p>
            ) : overview.isLoading ? (
              <p className="px-4 py-9 text-center text-sm text-muted-foreground">
                Carregando…
              </p>
            ) : overview.data && overview.data.tenants.length === 0 ? (
              <p className="px-4 py-9 text-center text-sm text-muted-foreground">
                Nenhuma clínica.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    {tenantTable.getHeaderGroups().map((hg) => (
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
                    {tenantTable.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="align-middle">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="prices" className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-2xl text-[13px] text-muted-foreground">
              Preços por <strong>milhão</strong> de tokens, em dólar. Cada geração
              é calculada com o preço vigente na data em que ela rodou — mudou o
              preço, cadastre uma nova linha e o histórico continua correto.
            </p>
            <Button
              onClick={() => {
                save.reset();
                setEditing("new");
              }}
            >
              <Plus className="size-4" />
              Novo preço
            </Button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
            {prices.isError ? (
              <p className="px-4 py-9 text-center text-sm text-destructive">
                {(prices.error as Error).message}
              </p>
            ) : prices.isLoading ? (
              <p className="px-4 py-9 text-center text-sm text-muted-foreground">
                Carregando…
              </p>
            ) : prices.data && prices.data.prices.length === 0 ? (
              <p className="px-4 py-9 text-center text-sm text-muted-foreground">
                Nenhum preço cadastrado — o custo aparece como “—” até que você
                cadastre um.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    {priceTable.getHeaderGroups().map((hg) => (
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
                    {priceTable.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="align-middle">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create / edit ------------------------------------------------------ */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
          // Remount on target change so the form picks up new defaultValues —
          // TanStack Form reads them once, so editing a row right after a create
          // would otherwise open with the previous values still in it.
          key={editing === "new" || editing === null ? "new" : editing.id}
        >
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Novo preço" : "Editar preço"}
            </DialogTitle>
            <DialogDescription>
              Valores em dólar por milhão de tokens (ex.: 0,03).
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <form.Field name="provider">
              {(field) => (
                <Field
                  id="price-provider"
                  label="Provedor"
                  placeholder="openai-compatible"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  error={fieldError(field, serverErrors?.provider)}
                />
              )}
            </form.Field>
            <form.Field name="model">
              {(field) => (
                <Field
                  id="price-model"
                  label="Modelo"
                  placeholder="qwen-flash"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  error={fieldError(field, serverErrors?.model)}
                />
              )}
            </form.Field>
            <form.Field name="effectiveFrom">
              {(field) => (
                <Field
                  id="price-from"
                  type="datetime-local"
                  label="Vigente desde"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  error={fieldError(field, serverErrors?.effectiveFrom)}
                />
              )}
            </form.Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <form.Field name="inputUsdPerMtok">
                {(field) => (
                  <Field
                    id="price-input"
                    label="Entrada"
                    inputMode="decimal"
                    placeholder="0,03"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    error={fieldError(field, serverErrors?.inputUsdPerMtok)}
                  />
                )}
              </form.Field>
              <form.Field name="cachedInputUsdPerMtok">
                {(field) => (
                  <Field
                    id="price-cached"
                    label="Cache"
                    inputMode="decimal"
                    placeholder="opcional"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    error={fieldError(
                      field,
                      serverErrors?.cachedInputUsdPerMtok,
                    )}
                  />
                )}
              </form.Field>
              <form.Field name="outputUsdPerMtok">
                {(field) => (
                  <Field
                    id="price-output"
                    label="Saída"
                    inputMode="decimal"
                    placeholder="0,13"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    error={fieldError(field, serverErrors?.outputUsdPerMtok)}
                  />
                )}
              </form.Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Deixe “Cache” em branco se o provedor não divulga um preço para
              leitura de cache — ela será cobrada como entrada normal.
            </p>

            <form.Field name="note">
              {(field) => (
                <Field
                  id="price-note"
                  label="Fonte (opcional)"
                  placeholder="Página de preços do provedor, 16/08/2026"
                  value={field.state.value ?? ""}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  error={fieldError(field, serverErrors?.note)}
                />
              )}
            </form.Field>

            {save.isError && !serverErrors && (
              <p className="text-[13px] text-destructive">
                {(save.error as Error).message}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm ----------------------------------------------------- */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover preço</DialogTitle>
            <DialogDescription>
              As gerações cobertas por este preço voltam a aparecer como{" "}
              <strong>sem preço</strong> no relatório de uso. Nada mais é
              afetado.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-foreground">
            {pendingDelete?.model} — vigente desde{" "}
            {pendingDelete &&
              dateFmt.format(new Date(pendingDelete.effectiveFrom))}
          </p>
          {remove.isError && (
            <p className="text-[13px] text-destructive">
              {(remove.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              {remove.isPending ? "Removendo…" : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
