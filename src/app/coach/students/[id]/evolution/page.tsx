"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Columns2,
  Maximize2,
  TrendingDown,
  TrendingUp,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { StudentTabs } from "@/components/students/student-tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [comparing, setComparing] = useState(false);
  // Zoom + pan are shared by BOTH panes of the comparison, so the two sides
  // always show the same region at the same magnification.
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
    w: number;
    h: number;
  } | null>(null);

  function resetView() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    drag.current = null;
  }

  /** Zooms about the centre, pulling the pan back inside the new bounds. */
  function zoomBy(delta: number) {
    setScale((current) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current + delta));
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      else
        setOffset((o) => ({
          // The frame is unknown here; scaling the offset by the zoom ratio
          // keeps the same point centred and never grows it past the old bound.
          x: (o.x * (next - 1)) / Math.max(current - 1, next - 1),
          y: (o.y * (next - 1)) / Math.max(current - 1, next - 1),
        }));
      return next;
    });
  }

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

  // The TWO MOST RECENT check-ins that carry photos — `photoSets` is oldest →
  // newest. Comparing against the very first set answers "since we started",
  // which stops being the useful question once a student has a year of history:
  // what a coach reads on this tab is "what changed since last time".
  const previousPhotos = photoSets.length > 1 ? photoSets[photoSets.length - 2] : undefined;
  const latestPhotos = photoSets[photoSets.length - 1];
  const hasComparablePhotos = photoSets.length > 0;
  const canCompare = previousPhotos !== undefined;

  // The tiles crop to `object-cover`; the lightbox shows the whole pose. Its set
  // is the pair for the SELECTED pose, so the arrows walk anterior ↔ atual.
  const comparableSets = canCompare
    ? [previousPhotos, latestPhotos]
    : [latestPhotos];
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
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                {/* The action belongs beside the title, not in the pill strip:
                    a 36px ghost button next to an 18px heading is the row's
                    natural height, while the same button wedged among 24px pills
                    reads as a misalignment. Left = what this card does, right =
                    which pose you are looking at. */}
                <div className="flex items-center gap-1">
                  <div className="font-heading text-subtitle font-semibold">
                    Fotos comparáveis
                  </div>
                  {canCompare ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Comparar lado a lado"
                      onClick={() => setComparing(true)}
                    >
                      <Columns2 className="size-4" />
                      Comparar
                    </Button>
                  ) : null}
                </div>
                <PoseSwitcher pose={pose} onChange={setPose} />
              </div>
              <p className="mb-3 text-label text-muted-foreground">
                {canCompare
                  ? `Os dois últimos check-ins com fotos: ${formatCheckinDate(previousPhotos.date)} e ${formatCheckinDate(latestPhotos!.date)}.`
                  : "O último check-in com fotos."}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {canCompare ? (
                  <>
                    <ComparePhoto
                      studentId={id}
                      set={previousPhotos}
                      pose={pose}
                      onOpen={() => setZoom(zoomIndexFor(previousPhotos))}
                    />
                    <ComparePhoto
                      studentId={id}
                      set={latestPhotos}
                      pose={pose}
                      onOpen={() => setZoom(zoomIndexFor(latestPhotos))}
                    />
                  </>
                ) : (
                  <>
                    <ComparePhoto
                      studentId={id}
                      set={latestPhotos}
                      pose={pose}
                      onOpen={() => setZoom(zoomIndexFor(latestPhotos))}
                    />
                    <div className="flex aspect-[3/4] items-center justify-center rounded-xl border border-dashed border-border text-center text-label text-muted-foreground">
                      Envie mais check-ins com fotos para comparar.
                    </div>
                  </>
                )}
              </div>

              {/* Side by side, both whole, on the same dark surface the single
                  photo viewer uses — this IS the viewer, with two panes. The
                  tiles crop to `object-cover` and the lightbox shows one pose at
                  a time; neither answers "what changed", which can only be read
                  with both images open at once. Zoom and pan are SHARED, so both
                  sides magnify the same region — comparing an abdomen at 1× on
                  one side and 2.5× on the other would be worse than useless. */}
              <Dialog
                open={comparing}
                onOpenChange={(o) => {
                  setComparing(o);
                  if (!o) resetView();
                }}
              >
                <DialogContent
                  overlayClassName="bg-black/80"
                  className="max-w-[min(96vw,1100px)] border-0 bg-neutral-950 p-3 [&>button]:bg-black/50 [&>button]:text-white/80 [&>button:hover]:bg-black/70 [&>button:hover]:text-white"
                >
                  <DialogHeader className="flex-row flex-wrap items-center gap-2 pr-10">
                    <DialogTitle className="text-body font-semibold text-white">
                      Comparar · {CHECKIN_POSE_LABELS[pose]}
                    </DialogTitle>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <PoseSwitcher
                        pose={pose}
                        tone="dark"
                        onChange={(p) => {
                          setPose(p);
                          resetView();
                        }}
                      />
                      <div className="flex items-center gap-0.5 rounded-full bg-white/10 p-0.5">
                        <button
                          type="button"
                          aria-label="Diminuir zoom"
                          disabled={scale <= MIN_SCALE}
                          onClick={() => zoomBy(-ZOOM_STEP)}
                          className={ZOOM_BUTTON}
                        >
                          <ZoomOut className="size-4" aria-hidden="true" />
                        </button>
                        <span className="min-w-11 text-center text-caption tabular-nums text-white/80">
                          {Math.round(scale * 100)}%
                        </span>
                        <button
                          type="button"
                          aria-label="Aumentar zoom"
                          disabled={scale >= MAX_SCALE}
                          onClick={() => zoomBy(ZOOM_STEP)}
                          className={ZOOM_BUTTON}
                        >
                          <ZoomIn className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </DialogHeader>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {comparableSets.map((set, i) => {
                      const photoId = set ? posePhotoId(set, pose) : null;
                      return (
                        <div
                          key={set?.checkinId ?? i}
                          className="flex flex-col gap-1.5"
                        >
                          <div
                            className={cn(
                              "relative flex h-[52vh] items-center justify-center overflow-hidden rounded-lg bg-black sm:h-[68vh]",
                              scale > 1
                                ? "cursor-grab active:cursor-grabbing"
                                : "",
                            )}
                            onDoubleClick={() =>
                              setScale((z) => (z > 1 ? 1 : 2))
                            }
                            onWheel={(e) =>
                              zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
                            }
                            onPointerDown={(e) => {
                              if (scale <= 1) return;
                              e.currentTarget.setPointerCapture(e.pointerId);
                              drag.current = {
                                x: e.clientX,
                                y: e.clientY,
                                ox: offset.x,
                                oy: offset.y,
                                w: e.currentTarget.clientWidth,
                                h: e.currentTarget.clientHeight,
                              };
                            }}
                            onPointerMove={(e) => {
                              const d = drag.current;
                              if (!d) return;
                              setOffset({
                                x: clampPan(
                                  d.ox + (e.clientX - d.x),
                                  d.w,
                                  scale,
                                ),
                                y: clampPan(
                                  d.oy + (e.clientY - d.y),
                                  d.h,
                                  scale,
                                ),
                              });
                            }}
                            onPointerUp={() => {
                              drag.current = null;
                            }}
                            onPointerCancel={() => {
                              drag.current = null;
                            }}
                          >
                            {set && photoId ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element -- private API stream */}
                                <img
                                  src={`/api/students/${id}/checkin/${set.checkinId}/photo/${photoId}`}
                                  alt={CHECKIN_POSE_LABELS[pose]}
                                  draggable={false}
                                  className="max-h-full max-w-full select-none object-contain"
                                  style={{
                                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setZoom(zoomIndexFor(set))}
                                  aria-label={`Ampliar ${CHECKIN_POSE_LABELS[pose]} de ${formatCheckinDate(set.date)}`}
                                  className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <Maximize2 className="size-4" aria-hidden="true" />
                                </button>
                              </>
                            ) : (
                              <span className="text-label text-white/50">
                                Sem foto nesta pose
                              </span>
                            )}
                          </div>
                          <p className="text-center text-caption text-white/70">
                            {set ? formatCheckinDate(set.date) : "—"}
                            {set?.weightKg != null
                              ? ` · ${formatCheckinWeight(set.weightKg)} kg`
                              : ""}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <p className="mt-1 text-center text-caption text-white/40">
                    Role ou use −/+ para aproximar; arraste para mover. Os dois
                    lados acompanham juntos.
                  </p>
                </DialogContent>
              </Dialog>

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
/* -------------------------------------------------------------------------- */
/*  Comparison viewer zoom                                                     */
/* -------------------------------------------------------------------------- */

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.25;

const ZOOM_BUTTON =
  "flex size-7 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Keeps a pan inside the image: at scale `z` the picture overflows its frame by
 * `(z - 1) / 2` of the frame on each side, and dragging past that would park
 * empty space in view — the one thing a comparison must never show.
 */
function clampPan(value: number, frame: number, scale: number): number {
  const max = ((scale - 1) * frame) / 2;
  return Math.max(-max, Math.min(max, value));
}

/**
 * The four pose pills — above the tiles on the card, and again inside the
 * comparison viewer, whose surface is dark like the lightbox's.
 */
function PoseSwitcher({
  pose,
  onChange,
  tone = "light",
}: {
  pose: CheckinPose;
  onChange: (pose: CheckinPose) => void;
  tone?: "light" | "dark";
}) {
  return (
    <div className="flex gap-1">
      {CHECKIN_POSE_VALUES.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-pressed={pose === p}
          className={cn(
            "rounded-full px-2.5 py-1 text-caption font-semibold transition-colors",
            pose === p
              ? "bg-primary text-primary-foreground"
              : tone === "dark"
                ? "bg-white/10 text-white/70 hover:bg-white/20"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
          )}
        >
          {CHECKIN_POSE_LABELS[p].replace("Pose ", "")}
        </button>
      ))}
    </div>
  );
}

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
