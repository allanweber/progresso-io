"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root error boundary. Next renders this — replacing the root layout — when an
 * error escapes every nested boundary, so it must ship its own <html>/<body>.
 * We report the error to Sentry and show a minimal PT-BR fallback. Inline styles
 * only, since the app's stylesheet may not have loaded at this point.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div style={{ maxWidth: "28rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
            Algo deu errado
          </h1>
          <p style={{ marginTop: "0.5rem", color: "#64748b" }}>
            Já fomos avisados e estamos verificando. Tente recarregar a página.
          </p>
        </div>
      </body>
    </html>
  );
}
