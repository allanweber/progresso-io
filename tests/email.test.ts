import { afterEach, describe, expect, it, vi } from "vitest";

import { renderOtpEmail, sendOtpEmail } from "@/lib/email";

describe("renderOtpEmail", () => {
  it("embeds the OTP in both HTML and text bodies", async () => {
    const { html, text } = await renderOtpEmail("123456", "email-verification");
    expect(html).toContain("123456");
    expect(text).toContain("123456");
  });

  it("uses a type-specific subject", async () => {
    expect((await renderOtpEmail("000000", "email-verification")).subject).toMatch(
      /Confirme sua conta/,
    );
    expect((await renderOtpEmail("000000", "forget-password")).subject).toMatch(
      /Redefina sua senha/,
    );
    expect((await renderOtpEmail("000000", "sign-in")).subject).toMatch(
      /código de acesso/i,
    );
  });
});

describe("sendOtpEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  it("logs the code (no throw) when Resend is not configured", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(
      sendOtpEmail({ email: "coach@example.com", otp: "654321", type: "sign-in" }),
    ).resolves.toBeUndefined();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("654321"),
    );
  });
});
