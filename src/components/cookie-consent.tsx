"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GoogleAnalytics } from "@next/third-parties/google";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "progresso-cookie-consent";
// Public GA measurement id (inlined at build). Analytics only loads with it set.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

type Consent = "accepted" | "rejected" | null; // null = decided-not-yet (show banner)

/**
 * Cookie consent + analytics gate. Strictly-necessary cookies (the session)
 * are always used; Google Analytics is loaded only after the visitor accepts,
 * keeping analytics opt-in (LGPD-friendly). The choice is remembered in
 * localStorage. Rendered app-wide from the root layout.
 */
export function CookieConsent() {
  // `undefined` until we've read storage, to avoid a hydration flash.
  const [consent, setConsent] = useState<Consent | undefined>(undefined);

  useEffect(() => {
    let stored: Consent = null;
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      stored = value === "accepted" || value === "rejected" ? value : null;
    } catch {
      stored = null;
    }
    // Reading persisted consent is only possible after mount (no localStorage
    // during SSR), so this initial sync is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(stored);
  }, []);

  function decide(value: "accepted" | "rejected") {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore storage failures (e.g. private mode) — just apply for this view.
    }
    setConsent(value);
  }

  return (
    <>
      {GA_ID && consent === "accepted" && <GoogleAnalytics gaId={GA_ID} />}

      {consent === null && (
        <div
          role="dialog"
          aria-label="Aviso de cookies"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white/95 px-6 py-4 shadow-[0_-8px_40px_rgba(15,23,42,0.15)] backdrop-blur-md"
        >
          <div className="mx-auto flex max-w-[1120px] flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body-dense leading-[1.6] text-muted-foreground">
              Usamos cookies essenciais para manter você conectado e, com sua
              permissão, cookies de análise (Google Analytics) para melhorar o
              produto. Saiba mais na{" "}
              <Link href="/privacy" className="font-medium text-primary hover:underline">
                Política de Privacidade
              </Link>
              .
            </p>
            <div className="flex shrink-0 gap-2.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => decide("rejected")}
              >
                Recusar
              </Button>
              <Button size="sm" onClick={() => decide("accepted")}>
                Aceitar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
