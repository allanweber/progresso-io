// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The public anamnese fill flow gates the questionnaire behind "confirm your
 * WhatsApp". The aluno types that number by hand, so it almost never comes back
 * in the exact shape the coach saved it in — with or without `+55`, with or
 * without the national trunk `0`. Confirming used to be an exact string compare
 * against the stored digits, which rejected the aluno's own number; these cover
 * the tolerant match (and that a genuinely different number is still refused).
 *
 * The DAL is mocked so the gate runs without a database.
 */

const findByFillToken = vi.fn();
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/dal", () => ({
  studentAnamneses: { findByFillToken: (...args: unknown[]) => findByFillToken(...args) },
}));

import { POST } from "@/app/api/anamnesis/fill/confirm/route";

/** The stored number, in the shape a coach typing "+31 (0)6 3605 1199" gets. */
const STORED = "31636051199";

/** Each case gets its own id: confirm attempts are rate-limited per anamnese. */
let seq = 0;
function lookup(phone: string) {
  seq += 1;
  return {
    studentAnamnesis: {
      id: `sa-${seq}`,
      sections: [{ title: "Geral", questions: [{ key: "q1" }] }],
    },
    student: { firstName: "Ana", phone },
    clinicName: "Clínica de Allan",
  };
}

async function confirm(typed: string, stored = STORED) {
  findByFillToken.mockResolvedValueOnce(lookup(stored));
  return POST(
    new Request("http://localhost/api/anamnesis/fill/confirm", {
      method: "POST",
      body: JSON.stringify({ token: "t0ken", phone: typed }),
    }),
    undefined as never,
  );
}

beforeEach(() => findByFillToken.mockReset());

describe("POST /api/anamnesis/fill/confirm", () => {
  it("accepts the number however the aluno types it", async () => {
    for (const typed of [
      "+31 636051199",
      "+31 06 3605 1199",
      "0031636051199",
      "31636051199",
    ]) {
      const res = await confirm(typed);
      expect(res.status, typed).toBe(200);
      expect(await res.json()).toMatchObject({ studentFirstName: "Ana" });
    }
  });

  it("accepts a Brazilian number typed without the country code", async () => {
    const res = await confirm("(11) 99999-0000", "5511999990000");
    expect(res.status).toBe(200);
  });

  it("accepts a number stored before trunk prefixes were canonicalized", async () => {
    const res = await confirm("+31 636051199", "310636051199");
    expect(res.status).toBe(200);
  });

  it("still refuses a different number", async () => {
    const res = await confirm("+31 636061199");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: "O WhatsApp informado não confere. Verifique o número.",
    });
  });

  it("refuses an expired or unknown link before checking the number", async () => {
    findByFillToken.mockResolvedValueOnce(null);
    const res = await POST(
      new Request("http://localhost/api/anamnesis/fill/confirm", {
        method: "POST",
        body: JSON.stringify({ token: "gone", phone: "+31 636051199" }),
      }),
      undefined as never,
    );
    expect(res.status).toBe(410);
  });
});
