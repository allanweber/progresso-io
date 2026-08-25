"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { resendOtp } from "@/app/actions/auth";

/** Minimum seconds between OTP generations — max one code per minute. */
const COOLDOWN_SECONDS = 60;

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * "Resend code" control. Starts on cooldown (a code was just sent) and only
 * lets the user regenerate once the cooldown elapses, enforcing at most one
 * OTP per minute — matched by the server-side rate limit.
 */
export function ResendOtp({
  email,
  type,
}: {
  email: string;
  type: "email-verification" | "forget-password";
}) {
  const [remaining, setRemaining] = useState(COOLDOWN_SECONDS);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function handleResend() {
    if (remaining > 0 || pending) return;
    startTransition(async () => {
      const result = await resendOtp(email, type);
      if (result?.formError) {
        setError(result.formError);
        return;
      }
      setError(null);
      setResent(true);
      setRemaining(COOLDOWN_SECONDS);
    });
  }

  if (error) {
    return (
      <p className="text-center text-body-dense text-destructive">
        {error}{" "}
        <button
          type="button"
          onClick={() => setError(null)}
          className="font-medium text-primary hover:underline"
        >
          Tentar de novo
        </button>
      </p>
    );
  }

  if (remaining > 0) {
    return (
      <p className="text-center text-body-dense text-meta">
        {resent && (
          <span className="font-medium text-primary">Novo código enviado · </span>
        )}
        Reenviar código em {formatClock(remaining)}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={handleResend}
      disabled={pending}
      className="w-full text-center text-body-dense font-medium text-primary hover:underline disabled:opacity-50"
    >
      {pending ? "Enviando…" : "Reenviar código"}
    </button>
  );
}
