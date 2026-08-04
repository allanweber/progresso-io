import { describe, expect, it } from "vitest";

import { parseForm, z } from "@/lib/validation";

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.")),
  age: z.coerce.number().int().min(18, "Mínimo 18."),
});

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("parseForm", () => {
  it("returns typed, normalized data on success", () => {
    const result = parseForm(schema, form({ email: " ME@X.COM ", age: "30" }));
    expect(result).toEqual({ success: true, data: { email: "me@x.com", age: 30 } });
  });

  it("returns per-field messages on failure", () => {
    const result = parseForm(schema, form({ email: "nope", age: "15" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors).toEqual({
        email: "E-mail inválido.",
        age: "Mínimo 18.",
      });
    }
  });

  it("keys the message by the failing field", () => {
    const result = parseForm(schema, form({ email: "a@b.com", age: "15" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.fieldErrors).toEqual({ age: "Mínimo 18." });
  });
});
