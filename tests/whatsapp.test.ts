import { describe, expect, it } from "vitest";

import {
  isWindowOpen,
  renderTemplate,
  WHATSAPP_WINDOW_MS,
  whatsappSendSchema,
  windowLabel,
} from "@/lib/whatsapp-inbox";

const now = new Date("2026-08-14T12:00:00.000Z").getTime();

describe("isWindowOpen", () => {
  it("is closed with no inbound ever", () => {
    expect(isWindowOpen(null, now)).toBe(false);
  });
  it("is open within 24h and closed after", () => {
    const twoHoursAgo = new Date(now - 2 * 3600_000).toISOString();
    const oneDayAgo = new Date(now - WHATSAPP_WINDOW_MS - 1000).toISOString();
    expect(isWindowOpen(twoHoursAgo, now)).toBe(true);
    expect(isWindowOpen(oneDayAgo, now)).toBe(false);
  });
  it("is closed for an unparseable timestamp", () => {
    expect(isWindowOpen("not-a-date", now)).toBe(false);
  });
});

describe("windowLabel", () => {
  it("shows remaining time when open, else 'janela fechada'", () => {
    const oneHourAgo = new Date(now - 3600_000).toISOString();
    expect(windowLabel(oneHourAgo, now)).toBe("23h 0min restantes");
    expect(windowLabel(null, now)).toBe("janela fechada");
  });
});

describe("renderTemplate", () => {
  it("substitutes {nome}, falling back when absent", () => {
    expect(renderTemplate("Oi {nome}!", { nome: "Ana" })).toBe("Oi Ana!");
    expect(renderTemplate("Oi {nome}!", {})).toBe("Oi aluno(a)!");
  });
  it("leaves unknown placeholders untouched", () => {
    expect(renderTemplate("{nome} — {outro}", { nome: "Ana" })).toBe(
      "Ana — {outro}",
    );
  });
});

describe("whatsappSendSchema", () => {
  it("requires a body for text and a key for template", () => {
    expect(whatsappSendSchema.safeParse({ type: "text", body: "oi" }).success).toBe(
      true,
    );
    expect(whatsappSendSchema.safeParse({ type: "text" }).success).toBe(false);
    expect(
      whatsappSendSchema.safeParse({ type: "template", templateKey: "k" }).success,
    ).toBe(true);
    expect(whatsappSendSchema.safeParse({ type: "template" }).success).toBe(false);
  });
});
