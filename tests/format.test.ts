import { describe, expect, it } from "vitest";

import { countPt, formatBRL, formatDateBR } from "@/lib/format";

describe("countPt", () => {
  // The screen-reader text behind the dashboard's count badges. A queue screen
  // sits at exactly one item more often than at any other non-zero count, and
  // "1 rascunhos não publicados" is not Portuguese.
  it("agrees with the count in PT-BR", () => {
    expect(countPt(1, "conversa", "conversas")).toBe("1 conversa");
    expect(countPt(2, "conversa", "conversas")).toBe("2 conversas");
  });

  // Deliberately not Intl.PluralRules: pt-BR puts 0 in the `one` category
  // (verified — `select(0) === "one"`), so it would produce "0 conversa".
  // Brazilian usage pluralises zero.
  it("pluralises zero", () => {
    expect(countPt(0, "conversa", "conversas")).toBe("0 conversas");
  });

  it("handles a multi-word noun phrase", () => {
    expect(countPt(1, "rascunho não publicado", "rascunhos não publicados")).toBe(
      "1 rascunho não publicado",
    );
    expect(countPt(3, "rascunho não publicado", "rascunhos não publicados")).toBe(
      "3 rascunhos não publicados",
    );
  });
});

describe("formatters", () => {
  it("formats BRL cents", () => {
    expect(formatBRL(17900).replace(/ /g, " ")).toBe("R$ 179,00");
  });

  it("formats an ISO date, and an em dash for null", () => {
    expect(formatDateBR("2026-08-24")).toBe("24/08/2026");
    expect(formatDateBR(null)).toBe("—");
  });
});
