"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api-client";
import {
  cacheHitRatio,
  formatCacheHitRatio,
  formatTokens,
  type AdminAiOverviewDto,
  type AdminAiTenantDto,
} from "@/lib/ai-programs";
import { PLAN_META } from "@/lib/plans";
import type { Plan } from "@/db/schema";

/**
 * Platform-admin AI overview.
 *
 * The point of this screen is to replace assumptions with measurements.
 * `docs/monetization.md` guesses a token count per generation, and
 * `docs/ai-generator.md` claims the base-only catalog keeps the prompt prefix
 * in the provider's cache. The columns below are how both get checked.
 *
 * There is deliberately no cost column: cost is tokens × a vendor price, and no
 * price is stored anywhere in this app. Multiply **tokens no mês** by whatever
 * the provider charges today — that stays correct across a price change, which
 * a frozen per-row number would not.
 */

const columnHelper = createColumnHelper<AdminAiTenantDto>();

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

export default function AdminAiPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-ai"],
    queryFn: () => apiFetch<AdminAiOverviewDto>("/api/admin/ai"),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Studio",
        cell: (ctx) => (
          <span className="font-medium">{ctx.getValue()}</span>
        ),
      }),
      columnHelper.display({
        id: "plan",
        header: "Plano",
        cell: (ctx) => {
          const r = ctx.row.original;
          const label = PLAN_META[r.effectivePlan as Plan]?.name ?? r.effectivePlan;
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
      columnHelper.display({
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
      columnHelper.display({
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
      columnHelper.display({
        id: "cache",
        header: "Cache",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <span className="tabular-nums">
              {formatCacheHitRatio(cacheHitRatio(r.inputTokens, r.cachedInputTokens))}
            </span>
          );
        },
      }),
      columnHelper.display({
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
    ],
    [],
  );

  const table = useReactTable({
    data: data?.tenants ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totals = data?.totals;
  const ratio = totals
    ? cacheHitRatio(totals.inputTokens, totals.cachedInputTokens)
    : null;
  const monthLabel = data
    ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
        new Date(data.monthStart),
      )
    : "";

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-[28px]">
          IA
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerações, cache e tokens por clínica{monthLabel && ` — ${monthLabel}`}.
        </p>
      </div>

      {/* An all-zero table means two different things; say which. */}
      {data && !data.configured && (
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

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Gerações no mês"
          value={isLoading ? "…" : totals?.generations ?? 0}
          hint={
            totals && totals.failed > 0 ? `${totals.failed} falharam` : undefined
          }
        />
        <Kpi
          label="Taxa de cache"
          value={isLoading ? "…" : formatCacheHitRatio(ratio)}
          hint="tokens de entrada servidos do cache"
        />
        <Kpi
          label="Tokens no mês"
          value={
            isLoading
              ? "…"
              : formatTokens(
                  (totals?.inputTokens ?? 0) +
                    (totals?.cachedInputTokens ?? 0) +
                    (totals?.outputTokens ?? 0),
                )
          }
          hint="entrada + saída, todas as clínicas"
        />
        <Kpi
          label="No limite"
          value={isLoading ? "…" : totals?.clinicsAtLimit ?? 0}
          hint="clínicas que gastaram a cota"
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <div className="border-b border-border px-4 py-3.5">
          <h2 className="font-heading text-[15px] font-semibold">
            Uso de IA por tenant
          </h2>
        </div>
        {isError ? (
          <p className="px-4 py-9 text-center text-sm text-destructive">
            {(error as Error).message}
          </p>
        ) : isLoading ? (
          <p className="px-4 py-9 text-center text-sm text-muted-foreground">
            Carregando…
          </p>
        ) : data && data.tenants.length === 0 ? (
          <p className="px-4 py-9 text-center text-sm text-muted-foreground">
            Nenhuma clínica.
          </p>
        ) : (
          <div className="overflow-x-auto">
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
    </div>
  );
}
