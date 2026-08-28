"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2, Maximize2, X } from "lucide-react";

import { PhotoLightbox } from "@/components/checkins/photo-lightbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { compressImage } from "@/lib/image-compression";
import {
  CHECKIN_POSE_LABELS,
  CHECKIN_POSE_VALUES,
  type CheckinPhotoDto,
} from "@/lib/student-checkins";
import type { CheckinPose } from "@/db/schema";

/**
 * Shared check-in photo UI, used by BOTH the aluno submit form and the coach
 * manual check-in: the pose upload slots (pick → client compress → thumbnail),
 * the slot state hook, the XHR uploader with a determinate progress bar, and a
 * read-only grid for viewing a check-in's photos.
 */

export type PhotoSlot = { blob: Blob; url: string; compressing: boolean };

export const EMPTY_PHOTO_SLOTS: Record<CheckinPose, PhotoSlot | null> = {
  frente: null,
  costas: null,
  lado_esquerdo: null,
  lado_direito: null,
};

/** Manages the four pose slots: pick (compress), remove, reset, revoking URLs. */
export function usePhotoSlots() {
  const [photos, setPhotos] =
    useState<Record<CheckinPose, PhotoSlot | null>>(EMPTY_PHOTO_SLOTS);

  async function pick(pose: CheckinPose, file: File) {
    setPhotos((prev) => {
      if (prev[pose]) URL.revokeObjectURL(prev[pose]!.url);
      return { ...prev, [pose]: { blob: file, url: "", compressing: true } };
    });
    const blob = await compressImage(file);
    const url = URL.createObjectURL(blob);
    setPhotos((prev) => ({ ...prev, [pose]: { blob, url, compressing: false } }));
  }

  function remove(pose: CheckinPose) {
    setPhotos((prev) => {
      if (prev[pose]) URL.revokeObjectURL(prev[pose]!.url);
      return { ...prev, [pose]: null };
    });
  }

  function reset() {
    setPhotos((prev) => {
      for (const pose of CHECKIN_POSE_VALUES) {
        if (prev[pose]) URL.revokeObjectURL(prev[pose]!.url);
      }
      return EMPTY_PHOTO_SLOTS;
    });
  }

  return { photos, pick, remove, reset };
}

/** Appends each present (compressed) slot to the FormData under its pose key. */
export function appendPhotos(
  fd: FormData,
  photos: Record<CheckinPose, PhotoSlot | null>,
) {
  for (const pose of CHECKIN_POSE_VALUES) {
    const slot = photos[pose];
    if (!slot) continue;
    const ext = slot.blob.type === "image/webp" ? "webp" : "jpg";
    fd.set(pose, slot.blob, `${pose}.${ext}`);
  }
}

/** Whether any slot is still compressing (submit is blocked meanwhile). */
export function anyCompressing(
  photos: Record<CheckinPose, PhotoSlot | null>,
): boolean {
  return CHECKIN_POSE_VALUES.some((p) => photos[p]?.compressing);
}

/**
 * Sends a multipart check-in via XMLHttpRequest — `fetch` can't report upload
 * progress, so we use XHR's `upload.onprogress` to drive a determinate bar tied
 * to the real byte transfer. `POST` creates, `PATCH` edits; both carry the same
 * body. Generic over the response shape.
 */
export function uploadCheckinForm<T>(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON body */
      }
      const body = data as {
        error?: string;
        fieldErrors?: Record<string, string>;
      } | null;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
      } else {
        reject(
          new ApiError(
            body?.error ?? "Não foi possível enviar o check-in.",
            xhr.status,
            body?.fieldErrors,
          ),
        );
      }
    };
    xhr.onerror = () =>
      reject(new ApiError("Falha de conexão ao enviar o check-in.", 0));
    xhr.send(formData);
  });
}

/** One pose upload card: empty (pick), compressing (spinner), or a thumbnail. */
export function PhotoUploadSlot({
  pose,
  slot,
  existingUrl,
  disabled,
  onPick,
  onRemove,
}: {
  pose: CheckinPose;
  slot: PhotoSlot | null;
  /**
   * A photo this pose ALREADY has (the edit form) — shown when nothing new has
   * been picked, so the coach sees what they are about to replace rather than an
   * empty "Adicionar" card. Picking a file covers it; removing reveals it again.
   */
  existingUrl?: string;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = CHECKIN_POSE_LABELS[pose];
  const picked = slot !== null && !slot.compressing;
  const ready = picked || (slot === null && existingUrl !== undefined);

  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-xl">
      {ready ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview / private API stream */}
          <img
            src={picked ? slot!.url : existingUrl}
            alt={label}
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5">
            <span className="text-caption font-semibold text-white">{label}</span>
          </div>
          <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="size-3" />
          </span>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remover ${label}`}
            className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 disabled:opacity-50"
          >
            <X className="size-3.5" />
          </button>
        </>
      ) : slot?.compressing ? (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-input bg-muted/30 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-caption">Comprimindo…</span>
          <span className="text-caption font-semibold text-foreground">{label}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-input bg-white text-center transition-colors hover:border-primary/60 hover:bg-primary-light/40 disabled:opacity-50 dark:bg-card"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Camera className="size-4" />
          </span>
          <span className="px-2 text-caption font-semibold leading-tight text-foreground">
            {label}
          </span>
          <span className="text-caption text-muted-foreground">Adicionar</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label={`Enviar ${label}`}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * A read-only grid of a check-in's stored photos. `basePath` is the photo route
 * prefix (owner-scoped for the aluno, clinic-scoped for the coach); each photo's
 * bytes stream from `${basePath}/${photo.id}`.
 */
export function CheckinPhotoGrid({
  basePath,
  photos,
  onReassign,
  reassigning = false,
}: {
  basePath: string;
  photos: CheckinPhotoDto[];
  /**
   * Coach-only: re-label a photo as another pose. Given, each tile grows a pose
   * selector — a left/right mix-up at upload time is common enough that the fix
   * belongs next to the photo, not in a re-upload. Omitted (the aluno's own
   * history) the grid stays read-only.
   */
  onReassign?: (photoId: string, pose: CheckinPose) => void;
  /** Whether a reassignment is in flight (disables every selector). */
  reassigning?: boolean;
}) {
  // Which photo the lightbox is showing (null = closed). The tiles crop to
  // `object-cover`, so enlarging is the only way to see the whole pose.
  const [zoomed, setZoomed] = useState<number | null>(null);

  if (photos.length === 0) return null;
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        {photos.map((p, i) => (
          <div key={p.id} className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setZoomed(i)}
              aria-label={`Ampliar ${CHECKIN_POSE_LABELS[p.pose]}`}
              className="group relative aspect-[4/5] cursor-zoom-in overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private API stream */}
              <img
                src={`${basePath}/${p.id}`}
                alt={CHECKIN_POSE_LABELS[p.pose]}
                className="h-full w-full object-cover"
              />
              {/* aria-hidden: keeps this out of the a11y tree so the four photos
                  stay the only images the specs count. */}
              <span className="pointer-events-none absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/45 text-white opacity-80 transition-opacity group-hover:opacity-100">
                <Maximize2 className="size-3.5" aria-hidden="true" />
              </span>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-left">
                <span className="text-caption font-semibold text-white">
                  {CHECKIN_POSE_LABELS[p.pose]}
                </span>
              </div>
            </button>

            {onReassign ? (
              <Select
                value={p.pose}
                disabled={reassigning}
                onValueChange={(v) => onReassign(p.id, v as CheckinPose)}
              >
                <SelectTrigger
                  aria-label={`Corrigir pose (${CHECKIN_POSE_LABELS[p.pose]})`}
                  className="h-9 rounded-lg text-body-dense"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHECKIN_POSE_VALUES.map((pose) => (
                    <SelectItem key={pose} value={pose}>
                      {CHECKIN_POSE_LABELS[pose]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        ))}
      </div>

      <PhotoLightbox
        photos={photos.map((p) => ({
          src: `${basePath}/${p.id}`,
          label: CHECKIN_POSE_LABELS[p.pose],
        }))}
        index={zoomed}
        onIndexChange={setZoomed}
      />
    </>
  );
}
