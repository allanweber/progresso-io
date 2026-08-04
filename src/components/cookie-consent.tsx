"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "progresso-cookie-consent";

/**
 * Cookie consent banner. Progresso IO uses only strictly-necessary cookies
 * (the session), so this is an informative notice with a single accept action.
 * The choice is remembered in localStorage so it isn't shown again.
 */
export function CookieConsent() {
  // `null` until we've checked storage, to avoid a hydration flash.
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    let accepted = false;
    try {
      accepted = localStorage.getItem(STORAGE_KEY) === "accepted";
    } catch {
      accepted = false;
    }
    // Reading persisted consent is only possible after mount (no localStorage
    // during SSR), so this initial sync is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(!accepted);
  }, []);

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {
      // Ignore storage failures (e.g. private mode) — just dismiss for now.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white/95 px-6 py-4 shadow-[0_-4px_24px_rgba(15,23,42,0.08)] backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-[1120px] flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-[1.6] text-muted-foreground">
          Usamos apenas cookies essenciais para manter você conectado e proteger
          sua conta. Saiba mais na{" "}
          <Link href="/privacy" className="font-medium text-primary hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
        <Button size="sm" onClick={accept} className="shrink-0">
          Aceitar
        </Button>
      </div>
    </div>
  );
}
