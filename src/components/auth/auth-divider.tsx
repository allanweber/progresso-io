export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-[#94A3B8]">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
