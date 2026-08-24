"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";

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
  WHATSAPP_CONNECTION_LABEL,
  type AdminWhatsAppOverviewDto,
} from "@/lib/whatsapp-inbox";

/** KPI tile for the overview header. */
function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      <div className="text-body-dense text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-heading text-3xl font-bold text-foreground">
        {value}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: AdminWhatsAppOverviewDto["tenants"][number]["status"];
}) {
  const variant = status === "connected" ? "clinic" : "neutral";
  return (
    <Badge variant={variant}>
      <span
        className={`mr-1.5 inline-block size-1.5 rounded-full ${
          status === "connected" ? "bg-primary" : "bg-muted-foreground/50"
        }`}
      />
      {WHATSAPP_CONNECTION_LABEL[status]}
    </Badge>
  );
}

export default function AdminWhatsappPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-whatsapp"],
    queryFn: () => apiFetch<AdminWhatsAppOverviewDto>("/api/admin/whatsapp"),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-[28px]">
            WhatsApp
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Conexões e uso por clínica.
          </p>
        </div>
        {/* Admin-only dev messaging console (student ↔ coach). Always available
            to platform admins. */}
        <Link
          href="/admin/whatsapp/simulator"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/50"
        >
          <MessageSquare className="size-4 text-primary" />
          Simulador de mensagens
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Conectados" value={isLoading ? "…" : data?.connectedCount ?? 0} />
        <Kpi
          label="Msgs este mês"
          value={isLoading ? "…" : data?.totalMessagesThisMonth ?? 0}
        />
        <Kpi
          label="Janelas abertas"
          value={isLoading ? "…" : data?.totalOpenWindows ?? 0}
        />
        <Kpi label="Clínicas" value={isLoading ? "…" : data?.tenants.length ?? 0} />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <div className="border-b border-border px-4 py-3.5">
          <h2 className="font-heading text-subtitle font-semibold">
            Conexões WhatsApp por tenant
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Studio</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Msgs este mês</TableHead>
                <TableHead className="text-right">Janelas abertas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.tenants.map((t) => (
                <TableRow key={t.clinicId}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.phoneDisplay ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {t.messagesThisMonth}
                  </TableCell>
                  <TableCell className="text-right">{t.openWindows}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
