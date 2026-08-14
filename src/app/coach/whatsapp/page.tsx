"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Construction, Lock, MessageCircle, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  COMPOSER_TEMPLATE_KEYS,
  isWindowOpen,
  windowLabel,
  type WhatsAppInboxDto,
  type WhatsAppMessageDto,
  type WhatsAppThreadDto,
} from "@/lib/whatsapp-inbox";

const POLL_MS = 10_000;

/** HH:MM (24h) for a message timestamp, locale-proof. */
function messageTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export default function CoachWhatsappPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  const inbox = useQuery({
    queryKey: ["coach-whatsapp"],
    queryFn: () => apiFetch<WhatsAppInboxDto>("/api/coach/whatsapp"),
    refetchInterval: POLL_MS,
  });

  const planLocked =
    inbox.error instanceof ApiError && inbox.error.status === 403;

  // The open conversation: the coach's explicit pick, else the first one on
  // desktop (derived during render — no effect, no cascading setState). On
  // mobile the raw `selectedId` still gates list-vs-chat, so it opens on the
  // list until a conversation is tapped.
  const effectiveId =
    selectedId ?? inbox.data?.conversations[0]?.id ?? null;

  const thread = useQuery({
    queryKey: ["coach-whatsapp", effectiveId],
    queryFn: () =>
      apiFetch<WhatsAppThreadDto>(`/api/coach/whatsapp/${effectiveId}`),
    enabled: !!effectiveId,
    refetchInterval: POLL_MS,
  });

  const send = useMutation({
    mutationFn: (payload:
      | { type: "text"; body: string }
      | { type: "template"; templateKey: string }) =>
      apiFetch<{ message: WhatsAppMessageDto }>(
        `/api/coach/whatsapp/${effectiveId}`,
        { method: "POST", body: JSON.stringify(payload) },
      ),
    onSuccess: () => {
      setDraft("");
      setSendError(null);
      queryClient.invalidateQueries({ queryKey: ["coach-whatsapp"] });
    },
    onError: (err) => {
      setSendError(
        err instanceof ApiError ? err.message : "Não foi possível enviar.",
      );
    },
  });

  const active = thread.data?.conversation ?? null;
  // Derive the window live so the 24h boundary flips without waiting for a poll.
  const windowOpen = active ? isWindowOpen(active.lastInboundAt) : false;
  // The closed-window composer only offers templates a coach can send by hand
  // (COMPOSER_TEMPLATE_KEYS) — the automation-only ones (and their unfillable
  // `{link}`/`{periodo}` placeholders) never show here.
  const composerTemplates = useMemo(
    () =>
      (inbox.data?.templates ?? []).filter(
        (t) => t.status === "approved" && COMPOSER_TEMPLATE_KEYS.has(t.key),
      ),
    [inbox.data],
  );

  if (planLocked) return <WhatsappUpsell />;

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col gap-3">
      {/* Under-development notice — shown whenever the active provider can't
          deliver (the dev provider: no real WhatsApp vendor connected yet).
          Sending records the message in the inbox but nothing reaches the
          student until a provider is connected. */}
      {inbox.data && !inbox.data.deliveryEnabled ? (
        <div className="flex flex-shrink-0 items-start gap-2.5 rounded-xl border border-[#FDE68A] bg-[#FEF3C7] px-4 py-3 text-sm text-[#92400E]">
          <Construction className="mt-0.5 size-4 flex-shrink-0" />
          <p>
            <strong>WhatsApp em desenvolvimento.</strong> Você pode enviar
            mensagens e elas ficam registradas aqui, mas ainda{" "}
            <strong>não são entregues de verdade</strong> — a entrega será
            ativada quando um provedor de WhatsApp for conectado.
          </p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-white">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-6 py-3">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          WhatsApp
        </h1>
        <ConnectionDot connected={inbox.data?.connection.status === "connected"} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Conversation list */}
        <aside
          className={`w-full flex-shrink-0 overflow-y-auto border-b border-border bg-white md:w-72 md:border-b-0 md:border-r ${
            selectedId ? "hidden md:block" : "block"
          }`}
        >
          {inbox.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : inbox.data && inbox.data.conversations.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma conversa ainda.
            </p>
          ) : (
            <ul>
              {inbox.data?.conversations.map((c) => {
                const open = isWindowOpen(c.lastInboundAt);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      data-testid="wa-conversation"
                      onClick={() => {
                        setSelectedId(c.id);
                        setSendError(null);
                      }}
                      className={`flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                        c.id === effectiveId ? "bg-primary-light/40" : ""
                      }`}
                    >
                      <Avatar initials={c.initials} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="flex-1 truncate text-sm font-semibold">
                            {c.name}
                          </span>
                          {c.unreadCount > 0 && (
                            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.lastMessagePreview ?? "—"}
                        </p>
                        <span
                          className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${
                            open ? "text-primary" : "text-destructive"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              open ? "bg-primary" : "bg-destructive"
                            }`}
                          />
                          {open ? "janela aberta" : "janela fechada"}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Chat */}
        <section
          className={`min-h-0 min-w-0 flex-1 flex-col bg-[#ECE6DD] ${
            selectedId ? "flex" : "hidden md:flex"
          }`}
        >
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Selecione uma conversa.
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
                <button
                  type="button"
                  className="text-sm text-muted-foreground md:hidden"
                  onClick={() => setSelectedId(null)}
                  aria-label="Voltar"
                >
                  ←
                </button>
                <Avatar initials={active.initials} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {active.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {active.phoneDisplay}
                  </div>
                </div>
                <span
                  data-testid="wa-window-badge"
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
                    windowOpen
                      ? "bg-primary-light text-primary"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  ⏱ {windowLabel(active.lastInboundAt)}
                </span>
              </div>

              {/* Messages */}
              <MessageList
                messages={thread.data?.messages ?? []}
                loading={thread.isLoading}
              />

              {/* Composer */}
              <div className="flex-shrink-0 border-t border-border bg-muted/40 p-3">
                {windowOpen ? (
                  <div className="flex items-end gap-2">
                    <textarea
                      data-testid="wa-composer-text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (draft.trim())
                            send.mutate({ type: "text", body: draft.trim() });
                        }
                      }}
                      placeholder="Escreva uma mensagem…"
                      rows={1}
                      className="max-h-32 flex-1 resize-none rounded-3xl border border-border bg-white px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                    <Button
                      type="button"
                      size="icon"
                      className="size-10 rounded-full"
                      data-testid="wa-send"
                      disabled={!draft.trim() || send.isPending}
                      onClick={() =>
                        send.mutate({ type: "text", body: draft.trim() })
                      }
                    >
                      <Send className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div
                      data-testid="wa-closed-banner"
                      className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs font-medium text-destructive"
                    >
                      <Lock className="size-3.5" />
                      Janela de 24h fechada — só templates pré-aprovados
                    </div>
                    {composerTemplates.length === 0 ? (
                      <p className="px-1 text-xs text-muted-foreground">
                        Nenhum template disponível para envio manual.
                      </p>
                    ) : (
                      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                        {composerTemplates.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            data-testid="wa-template"
                            disabled={send.isPending}
                            onClick={() =>
                              send.mutate({
                                type: "template",
                                templateKey: t.key,
                              })
                            }
                            className="flex items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 text-left shadow-sm transition-colors hover:bg-primary-light/30 disabled:opacity-60"
                          >
                            <div className="flex-1">
                              <div className="text-xs font-semibold">
                                {t.title}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {t.body}
                              </div>
                            </div>
                            <span className="flex-shrink-0 text-[11px] font-semibold text-primary">
                              Enviar →
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {sendError && (
                  <p className="mt-2 text-center text-xs text-destructive">
                    {sendError}
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={`size-2 rounded-full ${
          connected ? "bg-primary" : "bg-muted-foreground/40"
        }`}
      />
      {connected ? "API Business oficial ativa" : "não conectado"}
    </div>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold uppercase text-white">
      {initials}
    </div>
  );
}

function MessageList({
  messages,
  loading,
}: {
  messages: WhatsAppMessageDto[];
  loading: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-5 text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-5">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex ${
            m.direction === "outbound" ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={`max-w-[75%] rounded-xl px-3 py-2 text-sm leading-snug shadow-sm ${
              m.direction === "outbound" ? "bg-[#D9FDD3]" : "bg-white"
            }`}
          >
            {m.type === "template" && (
              <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-primary">
                template
              </span>
            )}
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground">
              {m.body}
            </p>
            <div className="mt-1 text-right text-[10px] text-muted-foreground">
              {messageTime(m.createdAt)}
            </div>
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function WhatsappUpsell() {
  return (
    <div className="p-6">
      <div className="mt-6 rounded-2xl border border-border bg-white px-6 py-16 text-center shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary-light">
          <MessageCircle className="size-7 text-primary" />
        </div>
        <h2 className="font-heading text-xl font-bold text-foreground">
          O WhatsApp é um recurso dos planos pagos
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Faça upgrade para o Solo ou Clínica e converse com seus alunos pelo
          WhatsApp — com a janela de 24h e templates pré-aprovados direto no
          painel.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/coach/settings">
              <Sparkles className="size-4" />
              Ver planos
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
