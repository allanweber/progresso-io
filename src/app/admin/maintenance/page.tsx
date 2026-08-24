"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ANAMNESIS_MODALITY_LABELS,
  ANAMNESIS_OBJECTIVE_LABELS,
} from "@/lib/anamneses";
import {
  ADMIN_ANAMNESIS_ORIGIN_LABELS,
  type AdminAnamnesisListItemDto,
  type AdminAnamnesisListResponse,
  type AdminClinicDto,
  type AdminImportResult,
  type AdminStarterDto,
  type AdminTemplateListItemDto,
  type AdminTemplateListResponse,
  type AdminTemplateStarterDto,
  type ClinicOption,
} from "@/lib/admin";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function OriginBadge({ origin }: { origin: "system" | "clinic" }) {
  return (
    <Badge variant={origin === "system" ? "base" : "neutral"}>
      {ADMIN_ANAMNESIS_ORIGIN_LABELS[origin]}
    </Badge>
  );
}

export default function AdminMaintenancePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-heading text-2xl font-bold text-foreground">
        Manutenção de dados
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ferramentas administrativas de dados da plataforma.
      </p>
      <Tabs defaultValue="anamneses" className="mt-6">
        <TabsList>
          <TabsTrigger value="anamneses">Anamneses</TabsTrigger>
          <TabsTrigger value="diets">Dietas</TabsTrigger>
          <TabsTrigger value="workouts">Treinos</TabsTrigger>
          <TabsTrigger value="clinics">Clínicas</TabsTrigger>
        </TabsList>
        <TabsContent value="anamneses" className="mt-4">
          <AnamnesesMaintenance />
        </TabsContent>
        <TabsContent value="diets" className="mt-4">
          <TemplateMaintenance resource="diets" />
        </TabsContent>
        <TabsContent value="workouts" className="mt-4">
          <TemplateMaintenance resource="workouts" />
        </TabsContent>
        <TabsContent value="clinics" className="mt-4">
          <ClinicsMaintenance />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AnamnesesMaintenance() {
  const queryClient = useQueryClient();
  const [clinic, setClinic] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] =
    useState<AdminAnamnesisListItemDto | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const clinics = useQuery({
    queryKey: ["admin-clinics"],
    queryFn: () =>
      apiFetch<{ clinics: ClinicOption[] }>("/api/admin/clinics").then(
        (r) => r.clinics,
      ),
  });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (clinic !== "all") p.set("clinic", clinic);
    if (origin !== "all") p.set("origin", origin);
    if (search.trim()) p.set("search", search.trim());
    p.set("pageSize", "100");
    return p.toString();
  }, [clinic, origin, search]);

  const list = useQuery({
    queryKey: ["admin-anamneses", query],
    queryFn: () =>
      apiFetch<AdminAnamnesisListResponse>(`/api/admin/anamneses?${query}`),
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/admin/anamneses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-anamneses"] });
      setDeleteTarget(null);
    },
  });

  const items = list.data?.items ?? [];

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="mnt-search">Buscar</Label>
          <Input
            id="mnt-search"
            placeholder="Nome da anamnese…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mnt-clinic">Clínica</Label>
          <Select value={clinic} onValueChange={setClinic}>
            <SelectTrigger id="mnt-clinic" className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as clínicas</SelectItem>
              {(clinics.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mnt-origin">Origem</Label>
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger id="mnt-origin" className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="system">Sistema</SelectItem>
              <SelectItem value="clinic">Clínica</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={() => setImportOpen(true)}>
          <Download className="size-4" />
          Importar starters
        </Button>
      </div>

      {list.isError && (
        <p className="mt-4 text-sm text-destructive">
          {(list.error as Error).message}
        </p>
      )}

      {/* Desktop table */}
      <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clínica</TableHead>
              <TableHead>Anamnese</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Atualizada</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium text-foreground">
                  {a.clinicName}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {ANAMNESIS_OBJECTIVE_LABELS[a.objective]} ·{" "}
                    {ANAMNESIS_MODALITY_LABELS[a.modality]}
                  </div>
                </TableCell>
                <TableCell>
                  <OriginBadge origin={a.origin} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(a.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(a)}
                    aria-label={`Excluir ${a.name}`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!list.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhuma anamnese encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="mt-4 space-y-2.5 md:hidden">
        {items.map((a) => (
          <li
            key={a.id}
            className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-foreground">{a.name}</div>
                <div className="text-body-dense text-muted-foreground">
                  {a.clinicName}
                </div>
              </div>
              <OriginBadge origin={a.origin} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {ANAMNESIS_OBJECTIVE_LABELS[a.objective]} ·{" "}
                {ANAMNESIS_MODALITY_LABELS[a.modality]} · {formatDate(a.updatedAt)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(a)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Excluir
              </Button>
            </div>
          </li>
        ))}
        {!list.isLoading && items.length === 0 && (
          <li className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted-foreground">
            Nenhuma anamnese encontrada.
          </li>
        )}
      </ul>

      {/* Delete confirm */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir anamnese</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <p className="text-body-dense text-muted-foreground">
              A anamnese “{deleteTarget.name}” da clínica{" "}
              <strong className="text-foreground">
                {deleteTarget.clinicName}
              </strong>{" "}
              será excluída permanentemente.{" "}
              {deleteTarget.studentUsageCount > 0 ? (
                <>
                  Está atribuída a{" "}
                  <strong className="text-foreground">
                    {deleteTarget.studentUsageCount}
                  </strong>{" "}
                  aluno(s) — as respostas já preenchidas são preservadas.
                </>
              ) : (
                "Nenhum aluno foi atribuído a partir dela."
              )}
            </p>
          )}
          {del.isError && (
            <p className="text-body-dense font-medium text-destructive">
              {(del.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && del.mutate(deleteTarget.id)}
              disabled={del.isPending}
            >
              {del.isPending ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        clinics={clinics.data ?? []}
        onImported={() =>
          queryClient.invalidateQueries({ queryKey: ["admin-anamneses"] })
        }
      />
    </div>
  );
}

function ClinicsMaintenance() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<AdminClinicDto | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const list = useQuery({
    queryKey: ["admin-clinics"],
    queryFn: () =>
      apiFetch<{ clinics: AdminClinicDto[] }>("/api/admin/clinics").then(
        (r) => r.clinics,
      ),
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true; deletedUsers: number }>(`/api/admin/clinics/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clinics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-anamneses"] });
      setDeleteTarget(null);
      setConfirmText("");
    },
  });

  const clinics = list.data ?? [];
  const canDelete =
    deleteTarget !== null && confirmText.trim() === deleteTarget.name;

  function openDelete(c: AdminClinicDto) {
    setConfirmText("");
    del.reset();
    setDeleteTarget(c);
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Todas as clínicas da plataforma. Excluir uma clínica é permanente e
        remove seus coaches, alunos e todos os dados (dietas, treinos, anamneses e
        catálogo próprio).
      </p>

      {list.isError && (
        <p className="mt-4 text-sm text-destructive">
          {(list.error as Error).message}
        </p>
      )}

      {/* Desktop table */}
      <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clínica</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Coaches</TableHead>
              <TableHead>Alunos</TableHead>
              <TableHead>Criada</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clinics.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    href={`/admin/clinics/${c.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    Plano {c.plan}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-foreground">{c.ownerName ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.ownerEmail ?? "—"}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.coachCount}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.studentCount}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(c.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDelete(c)}
                    aria-label={`Excluir ${c.name}`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!list.isLoading && clinics.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhuma clínica.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="mt-4 space-y-2.5 md:hidden">
        {clinics.map((c) => (
          <li
            key={c.id}
            className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/clinics/${c.id}`}
                  className="font-medium text-foreground hover:text-primary hover:underline"
                >
                  {c.name}
                </Link>
                <div className="text-body-dense text-muted-foreground">
                  {c.ownerEmail ?? "—"} · Plano {c.plan}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openDelete(c)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {c.coachCount} coach(es) · {c.studentCount} aluno(s) ·{" "}
              {formatDate(c.createdAt)}
            </div>
          </li>
        ))}
        {!list.isLoading && clinics.length === 0 && (
          <li className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted-foreground">
            Nenhuma clínica.
          </li>
        )}
      </ul>

      {/* Delete confirm — type-to-confirm the clinic name. */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o && !del.isPending) {
            setDeleteTarget(null);
            setConfirmText("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir clínica</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <>
              <p className="text-body-dense text-muted-foreground">
                A clínica{" "}
                <strong className="text-foreground">{deleteTarget.name}</strong> e
                TODOS os seus dados serão excluídos permanentemente:{" "}
                <strong className="text-foreground">
                  {deleteTarget.coachCount}
                </strong>{" "}
                coach(es),{" "}
                <strong className="text-foreground">
                  {deleteTarget.studentCount}
                </strong>{" "}
                aluno(s), além de dietas, treinos, anamneses e catálogo próprio.
                Esta ação não pode ser desfeita.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-clinic">
                  Digite{" "}
                  <strong className="text-foreground">{deleteTarget.name}</strong>{" "}
                  para confirmar
                </Label>
                <Input
                  id="confirm-clinic"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                  placeholder={deleteTarget.name}
                />
              </div>
            </>
          )}
          {del.isError && (
            <p className="text-body-dense font-medium text-destructive">
              {(del.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={del.isPending}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && del.mutate(deleteTarget.id)}
              disabled={!canDelete || del.isPending}
            >
              {del.isPending ? "Excluindo…" : "Excluir clínica"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Copy tuned per resource; the two tabs (Dietas/Treinos) share all the logic. */
const TEMPLATE_COPY = {
  diets: {
    col: "Dieta",
    searchPlaceholder: "Nome da dieta…",
    empty: "Nenhuma dieta encontrada.",
    deleteTitle: "Excluir dieta",
    importTitle: "Importar dietas do sistema",
    importDesc:
      "Copia as dietas selecionadas para a clínica. As que a clínica já possui são ignoradas.",
    startersLabel: "Dietas do sistema",
    the: "A dieta",
    usage: "dieta(s) de aluno",
  },
  workouts: {
    col: "Treino",
    searchPlaceholder: "Nome do treino…",
    empty: "Nenhum treino encontrado.",
    deleteTitle: "Excluir treino",
    importTitle: "Importar treinos do sistema",
    importDesc:
      "Copia os treinos selecionados para a clínica. Os que a clínica já possui são ignorados.",
    startersLabel: "Treinos do sistema",
    the: "O treino",
    usage: "treino(s) de aluno",
  },
} as const;

/**
 * The Dietas and Treinos maintenance tabs — same shape as
 * {@link AnamnesesMaintenance}: a cross-clinic list (filter by clinic / origin /
 * search) with hard-delete and an "Importar starters" dialog. Parameterised by
 * `resource` since both tabs are byte-for-byte identical bar the copy + endpoint.
 */
function TemplateMaintenance({
  resource,
}: {
  resource: "diets" | "workouts";
}) {
  const copy = TEMPLATE_COPY[resource];
  const queryClient = useQueryClient();
  const [clinic, setClinic] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] =
    useState<AdminTemplateListItemDto | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const clinics = useQuery({
    queryKey: ["admin-clinics"],
    queryFn: () =>
      apiFetch<{ clinics: ClinicOption[] }>("/api/admin/clinics").then(
        (r) => r.clinics,
      ),
  });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (clinic !== "all") p.set("clinic", clinic);
    if (origin !== "all") p.set("origin", origin);
    if (search.trim()) p.set("search", search.trim());
    p.set("pageSize", "100");
    return p.toString();
  }, [clinic, origin, search]);

  const list = useQuery({
    queryKey: ["admin-templates", resource, query],
    queryFn: () =>
      apiFetch<AdminTemplateListResponse>(`/api/admin/${resource}?${query}`),
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/admin/${resource}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-templates", resource] });
      setDeleteTarget(null);
    },
  });

  const items = list.data?.items ?? [];

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`mnt-${resource}-search`}>Buscar</Label>
          <Input
            id={`mnt-${resource}-search`}
            placeholder={copy.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`mnt-${resource}-clinic`}>Clínica</Label>
          <Select value={clinic} onValueChange={setClinic}>
            <SelectTrigger id={`mnt-${resource}-clinic`} className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as clínicas</SelectItem>
              {(clinics.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`mnt-${resource}-origin`}>Origem</Label>
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger id={`mnt-${resource}-origin`} className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="system">Sistema</SelectItem>
              <SelectItem value="clinic">Clínica</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={() => setImportOpen(true)}>
          <Download className="size-4" />
          Importar starters
        </Button>
      </div>

      {list.isError && (
        <p className="mt-4 text-sm text-destructive">
          {(list.error as Error).message}
        </p>
      )}

      {/* Desktop table */}
      <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clínica</TableHead>
              <TableHead>{copy.col}</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Atualizada</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium text-foreground">
                  {a.clinicName}
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {a.name}
                </TableCell>
                <TableCell>
                  <OriginBadge origin={a.origin} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(a.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(a)}
                    aria-label={`Excluir ${a.name}`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!list.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {copy.empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="mt-4 space-y-2.5 md:hidden">
        {items.map((a) => (
          <li
            key={a.id}
            className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-foreground">{a.name}</div>
                <div className="text-body-dense text-muted-foreground">
                  {a.clinicName}
                </div>
              </div>
              <OriginBadge origin={a.origin} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {formatDate(a.updatedAt)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(a)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Excluir
              </Button>
            </div>
          </li>
        ))}
        {!list.isLoading && items.length === 0 && (
          <li className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted-foreground">
            {copy.empty}
          </li>
        )}
      </ul>

      {/* Delete confirm */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.deleteTitle}</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <p className="text-body-dense text-muted-foreground">
              {copy.the} “{deleteTarget.name}” da clínica{" "}
              <strong className="text-foreground">
                {deleteTarget.clinicName}
              </strong>{" "}
              será excluído permanentemente.{" "}
              {deleteTarget.studentUsageCount > 0 ? (
                <>
                  Serviu de base para{" "}
                  <strong className="text-foreground">
                    {deleteTarget.studentUsageCount}
                  </strong>{" "}
                  {copy.usage} — as cópias dos alunos são preservadas.
                </>
              ) : (
                "Nenhum aluno foi atribuído a partir dele."
              )}
            </p>
          )}
          {del.isError && (
            <p className="text-body-dense font-medium text-destructive">
              {(del.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && del.mutate(deleteTarget.id)}
              disabled={del.isPending}
            >
              {del.isPending ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateImportDialog
        resource={resource}
        open={importOpen}
        onOpenChange={setImportOpen}
        clinics={clinics.data ?? []}
        onImported={() =>
          queryClient.invalidateQueries({
            queryKey: ["admin-templates", resource],
          })
        }
      />
    </div>
  );
}

function TemplateImportDialog({
  resource,
  open,
  onOpenChange,
  clinics,
  onImported,
}: {
  resource: "diets" | "workouts";
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clinics: ClinicOption[];
  onImported: () => void;
}) {
  const copy = TEMPLATE_COPY[resource];
  const [clinicId, setClinicId] = useState("");
  const [keys, setKeys] = useState<Set<string>>(new Set());

  const starters = useQuery({
    queryKey: ["admin-template-starters", resource],
    queryFn: () =>
      apiFetch<{ starters: AdminTemplateStarterDto[] }>(
        `/api/admin/${resource}/starters`,
      ).then((r) => r.starters),
    enabled: open,
  });

  const importMut = useMutation({
    mutationFn: () =>
      apiFetch<AdminImportResult>(`/api/admin/${resource}/import`, {
        method: "POST",
        body: JSON.stringify({ clinicId, keys: [...keys] }),
      }),
    onSuccess: onImported,
  });

  const all = starters.data ?? [];
  const allSelected = all.length > 0 && keys.size === all.length;

  function toggle(key: string) {
    setKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const banner =
    importMut.error instanceof ApiError ? importMut.error.message : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setClinicId("");
          setKeys(new Set());
          importMut.reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.importTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-body-dense text-muted-foreground">{copy.importDesc}</p>

        <div className="space-y-1.5">
          <Label htmlFor={`import-${resource}-clinic`}>Clínica de destino</Label>
          <Select value={clinicId} onValueChange={setClinicId}>
            <SelectTrigger id={`import-${resource}-clinic`}>
              <SelectValue placeholder="Selecione uma clínica" />
            </SelectTrigger>
            <SelectContent>
              {clinics.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{copy.startersLabel}</Label>
            <button
              type="button"
              className="text-body-dense font-medium text-primary hover:underline"
              onClick={() =>
                setKeys(allSelected ? new Set() : new Set(all.map((s) => s.key)))
              }
            >
              {allSelected ? "Limpar" : "Selecionar todos"}
            </button>
          </div>
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-[10px] border border-border p-2">
            {all.map((s) => (
              <label
                key={s.key}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-secondary"
              >
                <input
                  type="checkbox"
                  checked={keys.has(s.key)}
                  onChange={() => toggle(s.key)}
                  className="size-4 accent-primary"
                />
                <span className="text-sm text-foreground">{s.name}</span>
              </label>
            ))}
            {starters.isLoading && (
              <p className="px-2 py-1.5 text-body-dense text-muted-foreground">
                Carregando…
              </p>
            )}
          </div>
        </div>

        {importMut.isSuccess && importMut.data && (
          <p className="text-body-dense font-medium text-primary">
            {importMut.data.imported.length} importado(s),{" "}
            {importMut.data.skipped.length} já existiam.
          </p>
        )}
        {banner && (
          <p className="text-body-dense font-medium text-destructive">{banner}</p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Fechar</Button>
          </DialogClose>
          <Button
            onClick={() => importMut.mutate()}
            disabled={!clinicId || keys.size === 0 || importMut.isPending}
          >
            {importMut.isPending ? "Importando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({
  open,
  onOpenChange,
  clinics,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clinics: ClinicOption[];
  onImported: () => void;
}) {
  const [clinicId, setClinicId] = useState("");
  const [keys, setKeys] = useState<Set<string>>(new Set());

  const starters = useQuery({
    queryKey: ["admin-starters"],
    queryFn: () =>
      apiFetch<{ starters: AdminStarterDto[] }>(
        "/api/admin/anamneses/starters",
      ).then((r) => r.starters),
    enabled: open,
  });

  const importMut = useMutation({
    mutationFn: () =>
      apiFetch<AdminImportResult>("/api/admin/anamneses/import", {
        method: "POST",
        body: JSON.stringify({ clinicId, keys: [...keys] }),
      }),
    onSuccess: onImported,
  });

  const all = starters.data ?? [];
  const allSelected = all.length > 0 && keys.size === all.length;

  function toggle(key: string) {
    setKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const banner = importMut.error instanceof ApiError ? importMut.error.message : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setClinicId("");
          setKeys(new Set());
          importMut.reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar anamneses do sistema</DialogTitle>
        </DialogHeader>
        <p className="text-body-dense text-muted-foreground">
          Copia as anamneses selecionadas para a clínica. As que a clínica já
          possui são ignoradas.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="import-clinic">Clínica de destino</Label>
          <Select value={clinicId} onValueChange={setClinicId}>
            <SelectTrigger id="import-clinic">
              <SelectValue placeholder="Selecione uma clínica" />
            </SelectTrigger>
            <SelectContent>
              {clinics.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Anamneses do sistema</Label>
            <button
              type="button"
              className="text-body-dense font-medium text-primary hover:underline"
              onClick={() =>
                setKeys(allSelected ? new Set() : new Set(all.map((s) => s.key)))
              }
            >
              {allSelected ? "Limpar" : "Selecionar todas"}
            </button>
          </div>
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-[10px] border border-border p-2">
            {all.map((s) => (
              <label
                key={s.key}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-secondary"
              >
                <input
                  type="checkbox"
                  checked={keys.has(s.key)}
                  onChange={() => toggle(s.key)}
                  className="size-4 accent-primary"
                />
                <span className="text-sm text-foreground">{s.name}</span>
              </label>
            ))}
            {starters.isLoading && (
              <p className="px-2 py-1.5 text-body-dense text-muted-foreground">
                Carregando…
              </p>
            )}
          </div>
        </div>

        {importMut.isSuccess && importMut.data && (
          <p className="text-body-dense font-medium text-primary">
            {importMut.data.imported.length} importada(s),{" "}
            {importMut.data.skipped.length} já existiam.
          </p>
        )}
        {banner && (
          <p className="text-body-dense font-medium text-destructive">{banner}</p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Fechar</Button>
          </DialogClose>
          <Button
            onClick={() => importMut.mutate()}
            disabled={!clinicId || keys.size === 0 || importMut.isPending}
          >
            {importMut.isPending ? "Importando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

