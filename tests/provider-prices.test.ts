import { describe, expect, it } from "vitest";

import {
  costMicroUsd,
  formatMicroUsd,
  formatUsdPerMtok,
  priceAt,
  providerPriceSchema,
  toPriceFormValues,
  type PriceLike,
} from "@/lib/provider-prices";

/**
 * The price list's pure half. `priceAt` is the whole reason `provider_price` is
 * a table rather than a config value, so its edge cases carry the design.
 */

function price(
  model: string,
  effectiveFrom: string,
  input: number,
  output: number,
  cached: number | null = null,
): PriceLike {
  return {
    provider: "openai-compatible",
    model,
    effectiveFrom,
    inputMicroUsdPerMtok: input,
    outputMicroUsdPerMtok: output,
    cachedInputMicroUsdPerMtok: cached,
  };
}

describe("priceAt", () => {
  const prices = [
    price("qwen-flash", "2026-01-01T00:00:00Z", 30_000, 130_000),
    price("qwen-flash", "2026-06-01T00:00:00Z", 40_000, 150_000),
    price("other-model", "2026-01-01T00:00:00Z", 999_000, 999_000),
  ];

  it("picks the row in force at that instant, not the newest", () => {
    // The point of the whole table: a generation from March is still priced at
    // March's rate after June's increase lands.
    const march = priceAt(prices, "openai-compatible", "qwen-flash", new Date("2026-03-15T00:00:00Z"));
    expect(march?.inputMicroUsdPerMtok).toBe(30_000);
  });

  it("switches to the newer row once its date passes", () => {
    const july = priceAt(prices, "openai-compatible", "qwen-flash", new Date("2026-07-01T00:00:00Z"));
    expect(july?.inputMicroUsdPerMtok).toBe(40_000);
  });

  it("is exact on the boundary — effectiveFrom is inclusive", () => {
    const exact = priceAt(prices, "openai-compatible", "qwen-flash", new Date("2026-06-01T00:00:00Z"));
    expect(exact?.inputMicroUsdPerMtok).toBe(40_000);
  });

  it("is null before the earliest price for that model", () => {
    // Not "fall back to the first one" — a generation that predates any recorded
    // price genuinely has no known cost, and saying so is the honest answer.
    expect(
      priceAt(prices, "openai-compatible", "qwen-flash", new Date("2025-12-31T23:59:59Z")),
    ).toBeNull();
  });

  it("never crosses models or providers", () => {
    expect(
      priceAt(prices, "openai-compatible", "unknown-model", new Date("2026-07-01T00:00:00Z")),
    ).toBeNull();
    expect(
      priceAt(prices, "some-other-vendor", "qwen-flash", new Date("2026-07-01T00:00:00Z")),
    ).toBeNull();
  });

  it("ignores a row dated in the future", () => {
    // Entering an announced increase ahead of time must not reprice today.
    const withFuture = [...prices, price("qwen-flash", "2027-01-01T00:00:00Z", 90_000, 200_000)];
    const now = priceAt(withFuture, "openai-compatible", "qwen-flash", new Date("2026-07-01T00:00:00Z"));
    expect(now?.inputMicroUsdPerMtok).toBe(40_000);
  });
});

describe("costMicroUsd", () => {
  it("bills cache reads at their own rate when one is set", () => {
    // 1k fresh @ $0.03/M = 30; 9k cached @ $0.003/M = 27; 3k out @ $0.13/M = 390.
    expect(
      costMicroUsd(
        { inputTokens: 1_000, cachedInputTokens: 9_000, outputTokens: 3_000 },
        price("m", "2026-01-01T00:00:00Z", 30_000, 130_000, 3_000),
      ),
    ).toBe(447);
  });

  it("bills cache reads as normal input when the vendor states no rate", () => {
    // Over-stating is the safe direction for an unknown discount: 10k × $0.03/M.
    expect(
      costMicroUsd(
        { inputTokens: 1_000, cachedInputTokens: 9_000, outputTokens: 0 },
        price("m", "2026-01-01T00:00:00Z", 30_000, 130_000, null),
      ),
    ).toBe(300);
  });

  it("treats missing token counts as zero, not NaN", () => {
    expect(
      costMicroUsd(
        { inputTokens: null, cachedInputTokens: null, outputTokens: null },
        price("m", "2026-01-01T00:00:00Z", 30_000, 130_000),
      ),
    ).toBe(0);
  });
});

describe("providerPriceSchema", () => {
  const valid = {
    provider: "openai-compatible",
    model: "qwen-flash",
    effectiveFrom: "2026-08-16T10:00",
    inputUsdPerMtok: "0.03",
    outputUsdPerMtok: "0.13",
    cachedInputUsdPerMtok: "",
    note: "",
  };

  it("converts decimal USD per million into micro-USD", () => {
    const parsed = providerPriceSchema.parse(valid);
    expect(parsed.inputUsdPerMtok).toBe(30_000);
    expect(parsed.outputUsdPerMtok).toBe(130_000);
  });

  it("accepts a pt-BR comma decimal", () => {
    // The admin UI is pt-BR and the value is copied off a vendor page — "0,03"
    // is what actually gets typed.
    const parsed = providerPriceSchema.parse({ ...valid, inputUsdPerMtok: "0,03" });
    expect(parsed.inputUsdPerMtok).toBe(30_000);
  });

  it("keeps a blank cached rate as null rather than zero", () => {
    // Zero would mean "cache reads are free", which is a real claim; blank means
    // "the vendor didn't say". They must not collapse into each other.
    expect(providerPriceSchema.parse(valid).cachedInputUsdPerMtok).toBeNull();
    expect(
      providerPriceSchema.parse({ ...valid, cachedInputUsdPerMtok: "0" })
        .cachedInputUsdPerMtok,
    ).toBe(0);
  });

  it("rejects a blank required price instead of reading it as free", () => {
    expect(
      providerPriceSchema.safeParse({ ...valid, inputUsdPerMtok: "" }).success,
    ).toBe(false);
  });

  it("rejects non-numeric and negative prices", () => {
    expect(
      providerPriceSchema.safeParse({ ...valid, inputUsdPerMtok: "grátis" }).success,
    ).toBe(false);
    expect(
      providerPriceSchema.safeParse({ ...valid, inputUsdPerMtok: "-1" }).success,
    ).toBe(false);
  });

  it("rejects an unparseable effective date", () => {
    expect(
      providerPriceSchema.safeParse({ ...valid, effectiveFrom: "ontem" }).success,
    ).toBe(false);
  });

  it("normalises an empty note to null", () => {
    expect(providerPriceSchema.parse(valid).note).toBeNull();
  });
});

describe("toPriceFormValues", () => {
  it("round-trips a stored row back into editable decimals", () => {
    const values = toPriceFormValues({
      id: "x",
      provider: "openai-compatible",
      model: "qwen-flash",
      effectiveFrom: "2026-08-16T10:00:00.000Z",
      inputMicroUsdPerMtok: 30_000,
      outputMicroUsdPerMtok: 130_000,
      cachedInputMicroUsdPerMtok: null,
      note: null,
    });
    expect(values.inputUsdPerMtok).toBe("0.03");
    // Blank, not "0" — re-saving an untouched form must not invent a zero rate.
    expect(values.cachedInputUsdPerMtok).toBe("");
    expect(values.effectiveFrom).toBe("2026-08-16T10:00");
    expect(providerPriceSchema.safeParse(values).success).toBe(true);
  });
});

describe("formatting", () => {
  it("keeps a single cheap generation visible instead of rounding to zero", () => {
    expect(formatMicroUsd(690)).toBe("US$ 0,000690");
  });

  it("drops precision as the amount grows", () => {
    expect(formatMicroUsd(50_000)).toBe("US$ 0,0500");
    expect(formatMicroUsd(2_500_000)).toBe("US$ 2,50");
  });

  it("shows an em dash when nothing could be priced", () => {
    expect(formatMicroUsd(null)).toBe("—");
    expect(formatUsdPerMtok(null)).toBe("—");
  });

  it("renders a per-million rate the way a vendor page quotes it", () => {
    expect(formatUsdPerMtok(30_000)).toBe("US$ 0,03");
  });
});
