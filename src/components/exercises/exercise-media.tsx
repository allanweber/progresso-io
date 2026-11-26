"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dumbbell, Expand, Play } from "lucide-react";

import { ExerciseMuscleMap } from "@/components/exercises/exercise-muscle-map";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import {
  exerciseMediaUrl,
  type BodyMapMuscle,
  type ExerciseDetailDto,
  type ExerciseMedia as Media,
} from "@/lib/exercises";
import { cn } from "@/lib/utils";

function MediaPlayer({
  media,
  name,
  className,
  onFail,
}: {
  media: Media;
  name: string;
  className?: string;
  onFail?: () => void;
}) {
  const image = exerciseMediaUrl(media.image);
  const video = exerciseMediaUrl(media.video);
  const [playing, setPlaying] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(image) && !imageFailed;
  const hasVideo = Boolean(video) && !videoFailed;
  const showVideo = hasVideo && (playing || !hasImage);
  const showImage = !showVideo && hasImage;

  useEffect(() => {
    if (!showVideo && !showImage) onFail?.();
  }, [showVideo, showImage, onFail]);

  if (showVideo && video) {
    return (
      <video
        key={video}
        src={video}
        poster={image ?? undefined}
        autoPlay
        muted
        loop
        playsInline
        disablePictureInPicture
        aria-label={name}
        data-testid="exercise-video"
        onError={() => setVideoFailed(true)}
        className={cn("bg-white object-contain", className)}
      />
    );
  }
  if (showImage && image) {
    return (
      <div className={cn("relative bg-white", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={name}
          data-testid="exercise-image"
          onError={() => setImageFailed(true)}
          className="size-full object-contain"
        />
        {hasVideo && (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Reproduzir vídeo de ${name}`}
            data-testid="exercise-play"
            className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Play className="ml-0.5 size-6 fill-current" aria-hidden />
          </button>
        )}
      </div>
    );
  }
  return null;
}

export function ExerciseMediaLightbox({
  media,
  name,
  open,
  onOpenChange,
}: {
  media: Media;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          overlayClassName="z-[60] bg-black/80"
          className="z-[60] max-w-[min(96vw,560px)] border-0 bg-white p-3 text-neutral-900"
        >
          <MediaPlayer
            media={media}
            name={name}
            className="mx-auto aspect-square w-full max-h-[78vh] rounded-lg"
          />
          <DialogTitle className="mt-2 text-center text-body font-semibold">
            {name}
          </DialogTitle>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function ExerciseMedia({
  media,
  name,
  mapPrimary,
  mapSecondary,
  className,
}: {
  media: Media;
  name: string;
  mapPrimary?: BodyMapMuscle[];
  mapSecondary?: BodyMapMuscle[];
  className?: string;
}) {
  const [failed, setFailed] = useState(!media.image && !media.video);
  const [zoomed, setZoomed] = useState(false);
  const markFailed = useCallback(() => setFailed(true), []);

  if (failed) {
    if (mapPrimary?.length) {
      return (
        <ExerciseMuscleMap
          primary={mapPrimary}
          secondary={mapSecondary}
          both
          className={cn("aspect-square rounded-2xl", className)}
        />
      );
    }
    return (
      <div
        className={cn(
          "flex aspect-square items-center justify-center rounded-2xl bg-surface-light text-muted-foreground",
          className,
        )}
      >
        <Dumbbell className="size-10" aria-hidden />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-white", className)}>
      <MediaPlayer
        media={media}
        name={name}
        className="aspect-square w-full"
        onFail={markFailed}
      />
      <button
        type="button"
        onClick={() => setZoomed(true)}
        aria-label={`Ampliar ${name}`}
        title="Ampliar"
        className="absolute right-2 top-2 flex size-8 cursor-zoom-in items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/65"
      >
        <Expand className="size-4" aria-hidden />
      </button>
      <ExerciseMediaLightbox
        media={media}
        name={name}
        open={zoomed}
        onOpenChange={setZoomed}
      />
    </div>
  );
}

export function ExerciseThumb({
  image,
  className,
}: {
  image: string | null;
  className?: string;
}) {
  const src = exerciseMediaUrl(image);
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center bg-surface-light text-muted-foreground",
          className,
        )}
      >
        <Dumbbell className="size-1/2 max-h-6 max-w-6" aria-hidden />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      data-testid="exercise-thumb"
      onError={() => setBroken(true)}
      className={cn("shrink-0 bg-white object-contain", className)}
    />
  );
}

export function ExerciseMediaButton({
  exerciseId,
  name,
  image,
  className,
}: {
  exerciseId: string;
  name: string;
  image: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["exercise", exerciseId],
    queryFn: () => apiFetch<ExerciseDetailDto>(`/api/exercises/${exerciseId}`),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  if (!image) return <ExerciseThumb image={null} className={className} />;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ampliar imagem de ${name}`}
        title="Ampliar imagem"
        className={cn("group relative shrink-0 cursor-zoom-in overflow-hidden", className)}
      >
        <ExerciseThumb image={image} className="size-full" />
        <span className="absolute inset-0 hidden items-center justify-center bg-black/45 text-white group-hover:flex group-focus-visible:flex">
          <Expand className="size-3.5" aria-hidden />
        </span>
      </button>
      <ExerciseMediaLightbox
        media={{ image, video: data?.video ?? null }}
        name={name}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
