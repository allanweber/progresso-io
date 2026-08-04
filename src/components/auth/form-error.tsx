/** Inline form error banner shared across the auth forms. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive"
    >
      {message}
    </p>
  );
}
