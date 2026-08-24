"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";

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
 * POSTs a multipart check-in via XMLHttpRequest — `fetch` can't report upload
 * progress, so we use XHR's `upload.onprogress` to drive a determinate bar tied
 * to the real byte transfer. Generic over the response shape.
 */
export function uploadCheckinForm<T>(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
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
  disabled,
  onPick,
  onRemove,
}: {
  pose: CheckinPose;
  slot: PhotoSlot | null;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = CHECKIN_POSE_LABELS[pose];
  const ready = slot !== null && !slot.compressing;

  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-xl">
      {ready ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          <img src={slot.url} alt={label} className="h-full w-full object-cover" />
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
}: {
  basePath: string;
  photos: CheckinPhotoDto[];
}) {
  if (photos.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {photos.map((p) => (
        <div
          key={p.id}
          className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- private API stream */}
          <img
            src={`${basePath}/${p.id}`}
            alt={CHECKIN_POSE_LABELS[p.pose]}
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5">
            <span className="text-caption font-semibold text-white">
              {CHECKIN_POSE_LABELS[p.pose]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
