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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  costBasis,
  formatCacheHitRatio,
  formatCostBasis,
  formatTokens,
  type AdminAiModelDto,
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
import {
  aiSettingsSchema,
  isFloored,
  type AiSettingsDto,
  type AiSettingsInput,
} from "@/lib/ai-settings";
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
 * **Modelos** is the read that model shopping needs. Choosing a model is a form
 * field now, so the question worth asking is no longer only "what did this clinic
 * spend" but "what does this model cost, and how often does it need repairing" —
 * which spans tenants and so has no home on the per-clinic table. The config
 * card above it says what the server is currently asking for, because otherwise
 * a cost that moved and a config someone changed look identical here.
 *
 * **Preços** still backs the Custo column, and still matters even though the
 * provider now reports what it charged: it prices rows from before the switch,
 * it covers vendors that report nothing, and it is what makes a *forecast*
 * possible. Where a row carries both, the reported figure wins — it is the one
 * the invoice will agree with. Each estimate is priced at read time against the
 * `provider_price` in force the day the generation ran, so a vendor price change
 * is a new row (history stays correct) and a mistyped price is an edit (history
 * gets *fixed*).
 */

const tenantColumn = createColumnHelper<AdminAiTenantDto>();
const modelColumn = createColumnHelper<AdminAiModelDto>();
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

/**
 * The model settings form — a `"use client"` island only in the sense that it is
 * a separate component: it exists because TanStack Form reads `defaultValues`
 * once, at mount, so the fields have to be created *after* the saved settings
 * arrive. Rendering it earlier would leave an admin editing the coded defaults
 * while the table below described a different model entirely.
 */
function ModelSettingsForm({ settings }: { settings: AiSettingsDto }) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (value: AiSettingsInput) =>
      apiFetch<{ settings: AiSettingsDto }>("/api/admin/ai/settings", {
        method: "PUT",
        body: JSON.stringify(value),
      }),
    // Only the overview: the settings are part of it, and the usage table below
    // starts describing a different model the moment this lands.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-ai"] }),
  });

  const form = useForm({
    defaultValues: {
      model: settings.model,
      fallbackModels: settings.fallbackModels,
    } satisfies AiSettingsInput,
    validators: { onChange: aiSettingsSchema },
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

  return (
    <form
      className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className="border-b border-border px-4 py-3.5">
        <h2 className="font-heading text-[15px] font-semibold">
          Modelo em uso
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Vale para todas as clínicas e passa a valer na{" "}
          <strong>próxima geração</strong> — sem deploy, sem reiniciar. Confira
          o identificador em{" "}
          <code className="font-mono">openrouter.ai/models</code> antes de
          salvar: um modelo que não existe só falha na hora de gerar.
        </p>
      </div>

      <div className="space-y-4 px-4 py-4">
        <form.Field name="model">
          {(field) => (
            <div>
              <Field
                id="ai-model"
                label="Modelo principal"
                className="font-mono"
                placeholder="qwen/qwen3.7-flash:floor"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                error={fieldError(field) ?? serverErrors?.model}
              />
              {/* `:floor` is one suffix and roughly an order of magnitude
                      in price — and the easiest thing to lose when pasting a
                      slug off a vendor page. */}
              {field.state.value.trim() !== "" &&
                !isFloored(field.state.value) && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    Sem <code className="font-mono">:floor</code> — o roteamento
                    não vai buscar o host mais barato.
                  </p>
                )}
            </div>
          )}
        </form.Field>

        <form.Field name="fallbackModels" mode="array">
          {(field) => (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Alternativas</Label>
                  <p className="text-xs text-muted-foreground">
                    Tentadas em ordem quando o principal falha, atinge o limite
                    de uso ou é descontinuado.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => field.pushValue("")}
                >
                  <Plus className="size-4" />
                  Adicionar
                </Button>
              </div>
              {field.state.value.length === 0 ? (
                <p className="text-[13px] text-amber-600">
                  Nenhuma alternativa — se o modelo principal sair do ar, a
                  geração falha até alguém editar este campo.
                </p>
              ) : (
                <ul className="space-y-2">
                  {field.state.value.map((_: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <form.Field name={`fallbackModels[${i}]`}>
                        {(sub) => (
                          // The error has to render HERE, on the item: a bad
                          // slug fails validation at `fallbackModels[i]`, and
                          // the array-level message below never sees it. Without
                          // this, "Adicionar" then "Salvar" is a silent no-op —
                          // submit refuses and nothing on screen says why.
                          <div className="flex-1">
                            <Input
                              className="w-full font-mono"
                              placeholder="meta-llama/llama-3.1-8b-instruct:floor"
                              aria-label={`Alternativa ${i + 1}`}
                              aria-invalid={fieldError(sub) ? true : undefined}
                              value={sub.state.value}
                              onBlur={sub.handleBlur}
                              onChange={(e) => sub.handleChange(e.target.value)}
                            />
                            {fieldError(sub) && (
                              <p className="mt-1 text-[13px] text-destructive">
                                {fieldError(sub)}
                              </p>
                            )}
                          </div>
                        )}
                      </form.Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remover alternativa ${i + 1}`}
                        onClick={() => field.removeValue(i)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {fieldError(field) && (
                <p className="text-[13px] text-destructive">
                  {fieldError(field)}
                </p>
              )}
            </div>
          )}
        </form.Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {settings.customized
            ? settings.updatedAt
              ? `Salvo em ${dateFmt.format(new Date(settings.updatedAt))}.`
              : "Salvo."
            : /* Says these are ours, not a decision anyone made. */
              "Ainda no padrão do sistema — nada foi salvo aqui."}
        </p>
        <div className="flex items-center gap-3">
          {save.isSuccess && !save.isPending && (
            <span className="text-[13px] text-muted-foreground">Salvo.</span>
          )}
          {save.isError && (
            <span className="text-[13px] text-destructive">
              {(save.error as Error).message}
            </span>
          )}
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </form>
  );
}

const EMPTY_PRICE: ProviderPriceInput = {
  provider: "openrouter",
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
          const basis = formatCostBasis(
            costBasis(r.costMicroUsd, r.reportedCostMicroUsd),
          );
          return (
            <span className="tabular-nums">
              {formatMicroUsd(r.costMicroUsd)}
              {/* Says whether this is the provider's own figure or our estimate
                  of it — a 10% gap between two models means nothing until you
                  know you are comparing like with like. */}
              {basis && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {basis}
                </span>
              )}
              {/* Not decoration: it names a fixable gap — add the price for that
                  model and the figure completes itself. */}
              {r.unpricedGenerations > 0 && (
                <span
                  className="ml-1.5 text-xs text-amber-600"
                  title={`${r.unpricedGenerations} geração(ões) sem custo informado e sem preço cadastrado para o modelo/data`}
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

  const modelColumns = useMemo(
    () => [
      modelColumn.accessor("model", {
        header: "Modelo",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <div>
              <div className="font-mono text-[13px] font-medium">
                {ctx.getValue()}
              </div>
              {/* Which host actually served it. The same slug is offered by
                  several at different prices, so a cost that moved without a
                  config change usually shows up here first. */}
              <div className="text-xs text-muted-foreground">
                {r.upstreamProviders.length > 0
                  ? r.upstreamProviders.join(", ")
                  : "host não informado"}
              </div>
            </div>
          );
        },
      }),
      modelColumn.display({
        id: "generations",
        header: "Gerações",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <span className="tabular-nums">
              {r.generations}
              {r.failed > 0 && (
                <span className="text-destructive"> / {r.failed} falhas</span>
              )}
            </span>
          );
        },
      }),
      modelColumn.display({
        id: "repaired",
        header: "Reparos",
        cell: (ctx) => {
          const r = ctx.row.original;
          // The quality signal that actually decides a model swap: a repair is
          // a second round-trip, so a high rate is a cheap model billing twice.
          const share = r.succeeded > 0 ? r.repaired / r.succeeded : null;
          return (
            <span className="tabular-nums">
              {r.repaired}
              {share !== null && share > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {Math.round(share * 100)}%
                </span>
              )}
            </span>
          );
        },
      }),
      modelColumn.display({
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
      modelColumn.display({
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
      modelColumn.display({
        id: "cost",
        header: "Custo",
        cell: (ctx) => {
          const r = ctx.row.original;
          const basis = formatCostBasis(
            costBasis(r.costMicroUsd, r.reportedCostMicroUsd),
          );
          return (
            <span className="tabular-nums">
              {formatMicroUsd(r.costMicroUsd)}
              {basis && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {basis}
                </span>
              )}
            </span>
          );
        },
      }),
      modelColumn.display({
        id: "unit",
        header: "Custo / geração",
        cell: (ctx) => {
          const r = ctx.row.original;
          // The only figure that compares two models directly — a total says
          // more about how much a model was used than about what it costs.
          // Averaged over the calls that actually cost something: a failure
          // before the model was reached has no cost to average in.
          return (
            <span className="tabular-nums font-medium">
              {r.costMicroUsd !== null && r.costedGenerations > 0
                ? formatMicroUsd(
                    Math.round(r.costMicroUsd / r.costedGenerations),
                  )
                : "—"}
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
  const modelTable = useReactTable({
    data: overview.data?.models ?? [],
    columns: modelColumns,
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
            com IA” está desativado para todos os coaches. Basta definir{" "}
            <code className="font-mono">LLM_API_KEY</code> com uma chave do
            OpenRouter; modelo, roteamento e limites já têm padrão.
          </p>
        </div>
      )}

      <Tabs defaultValue="usage" className="mt-6">
        <TabsList>
          <TabsTrigger value="usage">Uso</TabsTrigger>
          <TabsTrigger value="models">Modelos</TabsTrigger>
          <TabsTrigger value="prices">Preços</TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              label="Gerações no mês"
              value={overview.isLoading ? "…" : (totals?.generations ?? 0)}
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
                !totals
                  ? undefined
                  : totals.unpricedGenerations > 0
                    ? `parcial — ${totals.unpricedGenerations} sem custo nem preço`
                    : (formatCostBasis(
                        costBasis(
                          totals.costMicroUsd,
                          totals.reportedCostMicroUsd,
                        ),
                      ) ??
                      // Nothing to cost is not the same as nothing happening: a
                      // month where every call failed before reaching a model
                      // has generations but no tokens, and saying "sem gerações"
                      // would contradict the counter beside it.
                      (totals.generations > 0
                        ? "nenhuma geração custeável"
                        : "sem gerações no mês"))
              }
            />
            <Kpi
              label="No limite"
              value={overview.isLoading ? "…" : (totals?.clinicsAtLimit ?? 0)}
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

        <TabsContent value="models" className="mt-4">
          {/* Mounted only once the settings have arrived: the form captures its
              defaults on first render, so rendering it early would leave the
              fields showing the coded defaults while the table below reported
              the model actually in use. */}
          {overview.data ? (
            <ModelSettingsForm settings={overview.data.settings} />
          ) : (
            <div className="rounded-2xl border border-border bg-white px-4 py-9 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
              {overview.isError
                ? (overview.error as Error).message
                : "Carregando…"}
            </div>
          )}

          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
            <div className="border-b border-border px-4 py-3.5">
              <h2 className="font-heading text-[15px] font-semibold">
                Uso por modelo
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Todas as clínicas somadas. “Custo / geração” é a coluna que
                compara dois modelos; o total só diz quanto cada um foi usado.
              </p>
            </div>
            {overview.isError ? (
              <p className="px-4 py-9 text-center text-sm text-destructive">
                {(overview.error as Error).message}
              </p>
            ) : overview.isLoading ? (
              <p className="px-4 py-9 text-center text-sm text-muted-foreground">
                Carregando…
              </p>
            ) : overview.data && overview.data.models.length === 0 ? (
              <p className="px-4 py-9 text-center text-sm text-muted-foreground">
                Nenhuma geração neste mês.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    {modelTable.getHeaderGroups().map((hg) => (
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
                    {modelTable.getRowModel().rows.map((row) => (
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
              Preços por <strong>milhão</strong> de tokens, em dólar. Cada
              geração é calculada com o preço vigente na data em que ela rodou —
              mudou o preço, cadastre uma nova linha e o histórico continua
              correto.
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
