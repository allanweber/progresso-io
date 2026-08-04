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

  it("returns the first validation message on failure", () => {
    const result = parseForm(schema, form({ email: "nope", age: "30" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("E-mail inválido.");
  });

  it("catches out-of-range values", () => {
    const result = parseForm(schema, form({ email: "a@b.com", age: "15" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Mínimo 18.");
  });
});
