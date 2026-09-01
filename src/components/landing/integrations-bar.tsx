import { MessageCircle } from "lucide-react";

export function IntegrationsBar() {
  return (
    <div className="border-y border-border-light px-6 py-6">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-center gap-x-12 gap-y-4">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-meta">
          Integra com
        </span>
        <span className="flex items-center gap-2 text-subtitle font-bold text-text-secondary">
          <MessageCircle className="size-[22px] text-[#25D366]" fill="#25D366" stroke="white" />
          WhatsApp Business
        </span>
      </div>
    </div>
  );
}
