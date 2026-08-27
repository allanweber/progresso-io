"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, TrendingDown, TrendingUp } from "lucide-react";

import { StudentTabs } from "@/components/students/student-tabs";
import {
  PhotoLightbox,
  type LightboxPhoto,
} from "@/components/checkins/photo-lightbox";
import { WeightChart } from "@/components/checkins/weight-chart";
import {
  CIRCUMFERENCE_LABELS,
  CIRCUMFERENCE_SITES,
  SKINFOLD_LABELS,
  SKINFOLD_SITES,
  type CircumferenceSite,
  type SkinfoldSite,
} from "@/lib/checkin-assessment";
import { apiFetch } from "@/lib/api-client";
import {
  CHECKIN_POSE_LABELS,
  CHECKIN_POSE_VALUES,
  formatCheckinDate,
  formatCheckinWeight,
  shortCheckinDate,
  type AssessmentPointDto,
  type EvolutionDto,
  type PhotoSetDto,
} from "@/lib/student-checkins";
import type { CheckinPose } from "@/db/schema";
import type { StudentRosterDto } from "@/lib/students";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Medidas Δ table helpers                                                    */
/* -------------------------------------------------------------------------- */

type MeasureRow = {
  label: string;
  unit: string;
  first: number | null;
  last: number | null;
  delta: number | null;
  /** For body composition/measures, "down is good"; body-fat too. */
  goodDown: boolean;
};

/** First (earliest) and last (latest) value of a numeric getter across points. */
function firstLast<T extends AssessmentPointDto>(
  points: T[],
  get: (p: T) => number | undefined,
): { first: number | null; last: number | null } {
  let first: number | null = null;
  let last: number | null = null;
  for (const p of points) {
    const v = get(p);
    if (typeof v === "number") {
      if (first === null) first = v;
      last = v;
    }
  }
  return { first, last };
}

function buildMeasureRows(assessments: AssessmentPointDto[]): MeasureRow[] {
  const rows: MeasureRow[] = [];
  const add = (label: string, unit: string, get: (p: AssessmentPointDto) => number | undefined) => {
    const { first, last } = firstLast(assessments, get);
    if (first === null && last === null) return;
    const delta = first !== null && last !== null ? last - first : null;
    rows.push({ label, unit, first, last, delta, goodDown: true });
  };
  for (const s of CIRCUMFERENCE_SITES) {
    add(CIRCUMFERENCE_LABELS[s], "cm", (p) => p.circumferences[s as CircumferenceSite]);
  }
  for (const s of SKINFOLD_SITES) {
    add(SKINFOLD_LABELS[s], "mm", (p) => p.skinfolds[s as SkinfoldSite]);
  }
  add("% de gordura", "%", (p) => p.bodyFatPct ?? undefined);
  return rows;
}

/** Finds the photo id of a pose within a check-in's photo set. */
function posePhotoId(set: PhotoSetDto, pose: CheckinPose): string | null {
  return set.photos.find((p) => p.pose === pose)?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function StudentEvolutionPage() {
  const { id } = useParams<{ id: string }>();
  const [pose, setPose] = useState<CheckinPose>("frente");
  const [zoom, setZoom] = useState<number | null>(null);

  const student = useQuery({
    queryKey: ["student", id],
    queryFn: () =>
      apiFetch<{ student: StudentRosterDto }>(`/api/students/${id}`).then(
        (r) => r.student,
      ),
  });

  const evo = useQuery({
    queryKey: ["coach-evolution", id],
    queryFn: () => apiFetch<EvolutionDto>(`/api/students/${id}/evolution`),
    retry: false,
  });

  const name = student.data
    ? `${student.data.firstName} ${student.data.lastName}`
    : "Aluno";

  const data = evo.data;
  const weightSeries = data?.weightSeries ?? [];
  const assessments = data?.assessments ?? [];
  const photoSets = data?.photoSets ?? [];

  const firstW = weightSeries[0]?.weightKg;
  const lastW = weightSeries[weightSeries.length - 1]?.weightKg;
  const deltaW =
    firstW !== undefined && lastW !== undefined ? lastW - firstW : undefined;

  const measureRows = buildMeasureRows(assessments);
  const firstAssessment = assessments[0];
  const lastAssessment = assessments[assessments.length - 1];

  const earliestPhotos = photoSets[0];
  const latestPhotos = photoSets[photoSets.length - 1];
  const hasComparablePhotos = photoSets.length > 0;

  // The tiles crop to `object-cover`; the lightbox shows the whole pose. Its
  // set is the before/after of the SELECTED pose, so the arrows walk antes ↔ depois.
  const comparableSets =
    photoSets.length > 1 ? [earliestPhotos, latestPhotos] : [earliestPhotos];
  const zoomPhotos: LightboxPhoto[] = comparableSets.flatMap((set) => {
    const photoId = set ? posePhotoId(set, pose) : null;
    if (!set || !photoId) return [];
    return [
      {
        src: `/api/students/${id}/checkin/${set.checkinId}/photo/${photoId}`,
        label: CHECKIN_POSE_LABELS[pose],
        caption:
          set.weightKg !== null
            ? `${formatCheckinDate(set.date)} · ${formatCheckinWeight(set.weightKg)} kg`
            : formatCheckinDate(set.date),
      },
    ];
  });

  /** Where a tile's photo sits in {@link zoomPhotos} (null when it has none). */
  function zoomIndexFor(set: PhotoSetDto | undefined): number | null {
    const photoId = set ? posePhotoId(set, pose) : null;
    if (!set || !photoId) return null;
    const src = `/api/students/${id}/checkin/${set.checkinId}/photo/${photoId}`;
    const found = zoomPhotos.findIndex((photo) => photo.src === src);
    return found === -1 ? null : found;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/coach/students"
        className="text-body-dense text-meta transition-colors hover:text-primary"
      >
        ← Alunos
      </Link>
      <h1 className="mt-2 font-heading text-2xl font-bold text-foreground">
        {name}
      </h1>
      <div className="mt-4">
        <StudentTabs studentId={id} />
      </div>

      {evo.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>
      ) : evo.isError ? (
        <p className="mt-8 text-sm text-destructive">
          {(evo.error as Error).message}
        </p>
      ) : weightSeries.length === 0 &&
        assessments.length === 0 &&
        photoSets.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/60 p-10 text-center dark:bg-card/60">
          <p className="text-sm text-muted-foreground">
            Sem dados de evolução ainda. Assim que houver check-ins com peso,
            fotos ou medidas, a evolução aparece aqui.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {/* Weight chart */}
          {weightSeries.length > 0 ? (
            <div className="rounded-2xl bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)] dark:bg-card">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-body-dense text-muted-foreground">
                    Peso ao longo do tempo
                  </div>
                  <div className="font-heading text-2xl font-bold tracking-tight">
                    {lastW !== undefined
                      ? `${formatCheckinWeight(lastW)} kg`
                      : "—"}
                  </div>
                </div>
                {deltaW !== undefined && deltaW !== 0 ? (
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2.5 py-1 text-body-dense font-semibold",
                      deltaW < 0
                        ? "bg-primary-light text-primary"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/40",
                    )}
                  >
                    {deltaW < 0 ? (
                      <TrendingDown className="size-4" />
                    ) : (
                      <TrendingUp className="size-4" />
                    )}
                    {deltaW < 0 ? "−" : "+"}
                    {formatCheckinWeight(Math.abs(deltaW))} kg
                  </span>
                ) : null}
              </div>
              <WeightChart series={weightSeries} />
            </div>
          ) : null}

          {/* Comparable photos */}
          {hasComparablePhotos ? (
            <div className="rounded-2xl bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)] dark:bg-card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="font-heading text-subtitle font-semibold">
                  Fotos comparáveis
                </div>
                <div className="flex gap-1">
                  {CHECKIN_POSE_VALUES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPose(p)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-caption font-semibold transition-colors",
                        pose === p
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/70",
                      )}
                    >
                      {CHECKIN_POSE_LABELS[p].replace("Pose ", "")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ComparePhoto
                  studentId={id}
                  set={earliestPhotos}
                  pose={pose}
                  onOpen={() => setZoom(zoomIndexFor(earliestPhotos))}
                />
                {photoSets.length > 1 ? (
                  <ComparePhoto
                    studentId={id}
                    set={latestPhotos}
                    pose={pose}
                    onOpen={() => setZoom(zoomIndexFor(latestPhotos))}
                  />
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center rounded-xl border border-dashed border-border text-center text-label text-muted-foreground">
                    Envie mais check-ins com fotos para comparar.
                  </div>
                )}
              </div>
              <PhotoLightbox
                photos={zoomPhotos}
                index={zoom}
                onIndexChange={setZoom}
              />
            </div>
          ) : null}

          {/* Medidas Δ table */}
          {measureRows.length > 0 ? (
            <div className="rounded-2xl bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)] dark:bg-card">
              <div className="mb-3 font-heading text-subtitle font-semibold">
                Medidas
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-body-dense">
                  <thead>
                    <tr className="text-caption uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Medida</th>
                      <th className="pb-2 text-right font-medium">
                        {firstAssessment
                          ? shortCheckinDate(firstAssessment.date)
                          : "—"}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {lastAssessment
                          ? shortCheckinDate(lastAssessment.date)
                          : "—"}
                      </th>
                      <th className="pb-2 text-right font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {measureRows.map((r) => (
                      <tr key={r.label} className="border-t border-border/60">
                        <td className="py-1.5 font-medium text-foreground">
                          {r.label}{" "}
                          <span className="text-caption text-muted-foreground">
                            ({r.unit})
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                          {r.first !== null ? formatCheckinWeight(r.first) : "—"}
                        </td>
                        <td className="py-1.5 text-right font-semibold tabular-nums">
                          {r.last !== null ? formatCheckinWeight(r.last) : "—"}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 text-right font-semibold tabular-nums",
                            r.delta === null || r.delta === 0
                              ? "text-muted-foreground"
                              : (r.delta < 0) === r.goodDown
                                ? "text-primary"
                                : "text-amber-700",
                          )}
                        >
                          {r.delta === null
                            ? "—"
                            : `${r.delta < 0 ? "−" : r.delta > 0 ? "+" : ""}${formatCheckinWeight(Math.abs(r.delta))}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lastAssessment ? (
                <p className="mt-2 text-caption text-muted-foreground">
                  Última avaliação em {formatCheckinDate(lastAssessment.date)}.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** One before/after photo tile for a chosen pose (or a placeholder). */
function ComparePhoto({
  studentId,
  set,
  pose,
  onOpen,
}: {
  studentId: string;
  set: PhotoSetDto | undefined;
  pose: CheckinPose;
  /** Opens the lightbox on this tile. Absent tiles stay inert. */
  onOpen?: () => void;
}) {
  const photoId = set ? posePhotoId(set, pose) : null;
  const caption = set ? (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-5 text-center text-caption font-semibold text-white">
      {formatCheckinDate(set.date)}
    </div>
  ) : null;
  return (
    <div>
      {set && photoId ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Ampliar ${CHECKIN_POSE_LABELS[pose]} de ${formatCheckinDate(set.date)}`}
          className="group relative block aspect-[3/4] w-full cursor-zoom-in overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- private API stream */}
          <img
            src={`/api/students/${studentId}/checkin/${set.checkinId}/photo/${photoId}`}
            alt={CHECKIN_POSE_LABELS[pose]}
            className="h-full w-full object-cover"
          />
          {/* aria-hidden so the specs' image counts see only the photos. */}
          <span className="pointer-events-none absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/45 text-white opacity-80 transition-opacity group-hover:opacity-100">
            <Maximize2 className="size-3.5" aria-hidden="true" />
          </span>
          {caption}
        </button>
      ) : (
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
          <div className="flex h-full items-center justify-center text-label text-muted-foreground">
            Sem foto
          </div>
          {caption}
        </div>
      )}
      {set?.weightKg !== null && set?.weightKg !== undefined ? (
        <div className="mt-1 text-center text-caption text-muted-foreground">
          {formatCheckinWeight(set.weightKg)} kg
        </div>
      ) : null}
    </div>
  );
}
