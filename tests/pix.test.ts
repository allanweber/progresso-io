import { describe, expect, it } from "vitest";

import { buildPixPayload, crc16, pixTxid } from "@/lib/pix";

/**
 * Pix BR Code generation. A BR Code is fully determined by its input, so these
 * assert the exact bytes a bank app will parse — length prefixes, field order
 * and the CRC. Getting any of them wrong yields a code that silently fails to
 * scan, which is the kind of bug no integration test would catch.
 */

const base = {
  key: "pix@progresso.io",
  merchantName: "Progresso IO",
  merchantCity: "Sao Paulo",
  amountCents: 17900,
  reference: "1042",
};

/** Pulls a top-level field's value out of a payload, for structural asserts. */
function readField(payload: string, id: string): string | null {
  let i = 0;
  while (i < payload.length - 4) {
    const fieldId = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    const value = payload.slice(i + 4, i + 4 + len);
    if (fieldId === id) return value;
    i += 4 + len;
  }
  return null;
}

describe("crc16 (CCITT-FALSE)", () => {
  it("matches the reference vector for 123456789", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("is always four upper-case hex digits", () => {
    for (const s of ["", "a", "Progresso", "0".repeat(200)]) {
      expect(crc16(s)).toMatch(/^[0-9A-F]{4}$/);
    }
  });
});

describe("pixTxid", () => {
  it("keeps alphanumerics and drops the rest", () => {
    expect(pixTxid("Fatura #1042/2026")).toBe("Fatura10422026");
  });

  it("caps at the 25-char limit", () => {
    expect(pixTxid("A".repeat(40))).toHaveLength(25);
  });

  it("falls back to the spec's '***' when nothing survives", () => {
    expect(pixTxid("#/-")).toBe("***");
  });
});

describe("buildPixPayload", () => {
  it("emits the mandatory fields with correct length prefixes", () => {
    const payload = buildPixPayload(base);

    expect(payload.startsWith("000201")).toBe(true); // format indicator = 01
    expect(readField(payload, "53")).toBe("986"); // BRL
    expect(readField(payload, "58")).toBe("BR");
    expect(readField(payload, "52")).toBe("0000");
  });

  it("nests the Pix key under the br.gov.bcb.pix template", () => {
    const account = readField(buildPixPayload(base), "26")!;
    expect(account).toBe("0014br.gov.bcb.pix0116pix@progresso.io");
  });

  it("formats the amount with exactly two decimals", () => {
    expect(readField(buildPixPayload(base), "54")).toBe("179.00");
    expect(
      readField(buildPixPayload({ ...base, amountCents: 37900 }), "54"),
    ).toBe("379.00");
    expect(readField(buildPixPayload({ ...base, amountCents: 5 }), "54")).toBe(
      "0.05",
    );
  });

  it("omits the amount entirely when null, so the payer types it", () => {
    expect(readField(buildPixPayload({ ...base, amountCents: null }), "54")).toBeNull();
  });

  it("strips accents and upper-cases the merchant fields", () => {
    const payload = buildPixPayload({
      ...base,
      merchantName: "Clínica Atlética",
      merchantCity: "São Paulo",
    });
    expect(readField(payload, "59")).toBe("CLINICA ATLETICA");
    expect(readField(payload, "60")).toBe("SAO PAULO");
  });

  it("truncates merchant name to 25 and city to 15", () => {
    const payload = buildPixPayload({
      ...base,
      merchantName: "A".repeat(40),
      merchantCity: "B".repeat(40),
    });
    expect(readField(payload, "59")).toHaveLength(25);
    expect(readField(payload, "60")).toHaveLength(15);
  });

  it("carries the invoice reference as the txid", () => {
    const additional = readField(buildPixPayload(base), "62")!;
    expect(additional).toBe("05041042");
  });

  it("ends with a CRC that validates over the rest of the payload", () => {
    const payload = buildPixPayload(base);

    expect(payload.slice(-8, -4)).toBe("6304");
    // Recomputing over everything up to and including "6304" must reproduce it.
    expect(crc16(payload.slice(0, -4))).toBe(payload.slice(-4));
  });

  it("is deterministic — safe to regenerate instead of storing", () => {
    expect(buildPixPayload(base)).toBe(buildPixPayload(base));
  });

  it("changes the CRC when the amount changes", () => {
    const a = buildPixPayload(base);
    const b = buildPixPayload({ ...base, amountCents: 37900 });
    expect(a.slice(-4)).not.toBe(b.slice(-4));
  });
});
