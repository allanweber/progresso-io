"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Full-size viewer for check-in photos, shared by the pose grid (coach review +
 * aluno history) and the coach's Evolução comparison. The enlarged image reuses
 * the SAME private stream URL as the thumbnail — the bytes are already in the
 * browser cache, so opening is instant and no new route is needed.
 *
 * Controlled: the parent owns `index` (null = closed). Esc and the scrim close
 * it; ←/→ and the edge buttons walk the set when it has more than one photo.
 */

export type LightboxPhoto = {
  /** The photo stream URL — the same one the thumbnail uses. */
  src: string;
  /** Pose label; becomes the alt text and the caption's first line. */
  label: string;
  /** Secondary caption line (date, weight). */
  caption?: string;
};

const NAV_BUTTON =
  "absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
}: {
  photos: LightboxPhoto[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const current =
    index !== null && index >= 0 && index < photos.length ? photos[index] : null;
  const many = photos.length > 1;

  function step(delta: number) {
    if (index === null) return;
    onIndexChange((index + delta + photos.length) % photos.length);
  }

  return (
    <Dialog
      open={current !== null}
      onOpenChange={(open) => {
        if (!open) onIndexChange(null);
      }}
    >
      {current ? (
        // z-[60]: in the coach review this opens INSIDE another dialog (z-50).
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
            {/* eslint-disable-next-line @next/next/no-img-element -- private API stream */}
            <img
              src={current.src}
              alt={current.label}
              className="mx-auto max-h-[78vh] w-auto max-w-full rounded-lg object-contain"
            />
            {many ? (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Foto anterior"
                  className={`${NAV_BUTTON} left-2`}
                >
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Próxima foto"
                  className={`${NAV_BUTTON} right-2`}
                >
                  <ChevronRight className="size-5" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>

          <div className="mt-3 text-center">
            <DialogTitle className="text-body font-semibold text-white">
              {current.label}
            </DialogTitle>
            {current.caption ? (
              <p className="mt-0.5 text-caption text-white/70">
                {current.caption}
              </p>
            ) : null}
            {many ? (
              <p className="mt-1 text-caption text-white/50">
                {index! + 1} / {photos.length}
              </p>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
