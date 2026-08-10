"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import {
  notificationHref,
  notificationTitle,
  type NotificationListResponse,
} from "@/lib/notifications";

/** Compact PT-BR relative time ("agora", "há 5 min", "há 2 h", "há 3 d"). */
function relativeTime(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/**
 * The coach's notification bell in the dashboard header. Polls the notifications
 * API, shows an unread-count badge, and opens a dropdown listing recent items.
 * Opening the dropdown marks everything read for this coach.
 */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<NotificationListResponse>("/api/notifications"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const markRead = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true; unread: number }>("/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Compute relative times on open (client-only — avoids a hydration gap).
      setNow(Date.now());
      if (unread > 0) markRead.mutate();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`Notificações${unread > 0 ? ` (${unread} não lidas)` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative flex size-9 items-center justify-center rounded-[10px] border-[1.5px] border-input text-[#334155] transition-colors hover:bg-secondary focus:outline-none"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-[66px] z-50 overflow-hidden rounded-[12px] border border-border bg-white shadow-[0_8px_28px_rgba(15,23,42,0.12)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          {/* Mobile: a viewport-width sheet pinned below the header (the 320px
              dropdown would overflow the left edge, since the bell sits mid-header).
              sm+: the anchored dropdown below the bell. */}
          <div className="border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">
              Notificações
            </span>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              Nenhuma notificação por aqui.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={notificationHref(n)}
                    onClick={() => setOpen(false)}
                    className={`flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-secondary ${
                      n.read ? "" : "bg-primary-light/40"
                    }`}
                  >
                    <span className="text-[13px] font-medium text-foreground">
                      {notificationTitle(n)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {now ? relativeTime(n.createdAt, now) : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
