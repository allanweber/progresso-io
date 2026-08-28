"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Expand,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { exerciseImageUrl, type ExerciseDetailDto } from "@/lib/exercises";
import { cn } from "@/lib/utils";

/**
 * The exercise image carousel and the full-size viewer it expands into, shared
 * by the read views (exercise + substitute detail) and the **builder**, where
 * an exercise is otherwise only a 36px thumbnail — in a ficha row, in the
 * "Adicionar exercício" search dropdown and on the prescription step. Anywhere
 * an exercise's picture is shown, it can be opened full-size.
 *
 * The lightbox is modelled on `components/checkins/photo-lightbox`: same z-[60]
 * (it often opens *inside* another dialog), same scrim, same ←/→ walk.
 */

const NAV_BUTTON =
  "absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Full-size viewer for an exercise's images. Controlled: the parent owns
 * `index` (null = closed). Esc and the scrim close it; ←/→ and the edge buttons
 * walk the set when it has more than one image.
 */
export function ExerciseImageLightbox({
  images,
  name,
  index,
  onIndexChange,
}: {
  /** Resolved image URLs (see `exerciseImageUrl`). */
  images: string[];
  /** The exercise's name — the alt text and the caption. */
  name: string;
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const current =
    index !== null && index >= 0 && index < images.length ? images[index] : null;
  const many = images.length > 1;

  function step(delta: number) {
    if (index === null) return;
    onIndexChange((index + delta + images.length) % images.length);
  }

  return (
    <Dialog
      open={current !== null}
      onOpenChange={(open) => {
        if (!open) onIndexChange(null);
      }}
    >
      {current ? (
        // z-[60]: this often opens INSIDE another dialog (z-50).
        <DialogContent
          overlayClassName="z-[60] bg-black/80"
          className="z-[60] max-w-[min(96vw,880px)] border-0 bg-neutral-950 p-3 [&>button]:bg-black/50 [&>button]:text-white/80 [&>button:hover]:bg-black/70 [&>button:hover]:text-white"
          onKeyDown={(event) => {
            if (!many) return;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              step(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              step(1);
            }
          }}
        >
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current}
              alt={name}
              className="mx-auto max-h-[78vh] w-auto max-w-full rounded-lg object-contain"
            />
            {many ? (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Imagem anterior"
                  className={`${NAV_BUTTON} left-2`}
                >
                  <ChevronLeft className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Próxima imagem"
                  className={`${NAV_BUTTON} right-2`}
                >
                  <ChevronRight className="size-5" aria-hidden />
                </button>
              </>
            ) : null}
          </div>

          <div className="mt-3 text-center">
            <DialogTitle className="text-body font-semibold text-white">
              {name}
            </DialogTitle>
            {many ? (
              <p className="mt-1 text-caption text-white/50">
                {index! + 1} / {images.length}
              </p>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/**
 * The exercise's image **carousel** — a swipeable, scroll-snapped track with
 * prev/next arrows and dot indicators. Free-exercise-db exercises usually ship a
 * start- and end-position image, so this lets the aluno flip between them. Images
 * that fail to load (e.g. the CDN / R2 isn't configured in a given environment)
 * are dropped; when none remain a dumbbell placeholder is shown. Tapping the
 * image (or the expand control) opens it full-size at the same position. Keyed by
 * exercise id by the caller, so state resets when the exercise changes.
 */
export function ExerciseImages({
  images,
  name = "",
}: {
  /** Resolved image URLs (see `exerciseImageUrl`). */
  images: string[];
  /** The exercise's name — the alt text and the full-size caption. */
  name?: string;
}) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const onErr = (src: string) => setBroken((prev) => new Set(prev).add(src));
  const shown = images.filter((src) => !broken.has(src));

  // Keep the active dot in sync as the user swipes/scrolls the track.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setIndex((prev) => (prev === i ? prev : i));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [shown.length]);

  if (shown.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl bg-surface-light text-muted-foreground">
        <Dumbbell className="size-10" />
      </div>
    );
  }

  const go = (i: number) => {
    const el = trackRef.current;
    const next = Math.max(0, Math.min(shown.length - 1, i));
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setIndex(next);
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shown.map((src, i) => (
          <div key={src} className="w-full shrink-0 snap-center">
            <button
              type="button"
              onClick={() => setZoomed(i)}
              aria-label="Ampliar imagem"
              className="block w-full cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={name}
                onError={() => onErr(src)}
                className="aspect-video w-full bg-slate-900 object-cover"
              />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setZoomed(index)}
        aria-label="Ampliar imagem"
        title="Ampliar"
        className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
      >
        <Expand className="size-4" />
      </button>

      {shown.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label="Imagem anterior"
            className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity hover:bg-black/60 disabled:opacity-0"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index === shown.length - 1}
            aria-label="Próxima imagem"
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity hover:bg-black/60 disabled:opacity-0"
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
            {shown.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => go(i)}
                aria-label={`Ir para a imagem ${i + 1}`}
                className={`pointer-events-auto h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        </>
      )}

      <ExerciseImageLightbox
        images={shown}
        name={name}
        index={zoomed}
        onIndexChange={setZoomed}
      />
    </div>
  );
}

/**
 * A thumbnail that expands into the exercise's full image set — the builder's
 * way in, where there is no detail dialog to hold a carousel (a ficha row, a
 * search result, the prescription step). The full set is fetched on the first
 * click (`/api/exercises/{id}`, the same query key the prescription fields use,
 * so the cache is shared); until it lands the thumbnail itself is shown
 * full-size, so opening never waits on the network.
 *
 * With no thumbnail there is no image to show, so it renders the inert
 * placeholder box instead of a button.
 */
export function ExerciseImageButton({
  exerciseId,
  name,
  thumbnail,
  className,
}: {
  exerciseId: string;
  name: string;
  /** The first image **key** (not a URL); resolve with `exerciseImageUrl`. */
  thumbnail: string | null;
  /** Sizing/rounding for the box (e.g. "size-9 rounded-md"). */
  className?: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const { data } = useQuery({
    queryKey: ["exercise", exerciseId],
    queryFn: () => apiFetch<ExerciseDetailDto>(`/api/exercises/${exerciseId}`),
    staleTime: 5 * 60_000,
    enabled: index !== null,
  });

  const thumb = exerciseImageUrl(thumbnail);
  if (!thumb) {
    return <div className={cn("shrink-0 bg-surface-light", className)} />;
  }

  const keys = data?.images.length ? data.images : [thumbnail!];
  const images = keys
    .map((k) => exerciseImageUrl(k))
    .filter((u): u is string => Boolean(u));

  return (
    <>
      <button
        type="button"
        onClick={() => setIndex(0)}
        aria-label={`Ampliar imagem de ${name}`}
        title="Ampliar imagem"
        className={cn(
          "group relative shrink-0 cursor-zoom-in overflow-hidden",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb} alt={name} className="size-full object-cover" />
        <span className="absolute inset-0 hidden items-center justify-center bg-black/45 text-white group-hover:flex group-focus-visible:flex">
          <Expand className="size-3.5" />
        </span>
      </button>
      <ExerciseImageLightbox
        images={images}
        name={name}
        index={index}
        onIndexChange={setIndex}
      />
    </>
  );
}
