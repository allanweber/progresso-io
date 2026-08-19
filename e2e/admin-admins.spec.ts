import { expect, test } from "@playwright/test";

import { waitForMessage } from "./outbox";

/**
 * Admin management (/admin/admins), against the real DB (see scripts/e2e.mjs),
 * on the seeded admin session (admin@progresso.io). Covers the guard rails and
 * the full invite → set-password → activate → remove lifecycle.
 *
 * Serial: the lifecycle test builds on its own state. It only ever creates and
 * deletes a UNIQUE throwaway admin e-mail, and never touches the seeded admin,
 * so it can't race the other admin-project spec.
 */

test.describe.configure({ mode: "serial" });

const SEEDED_ADMIN = "admin@progresso.io";

function uniqueEmail(): string {
  return `admin-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

// Pre-accept the cookie banner so it never overlays controls.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("progresso-cookie-consent", "accepted"),
  );
});

test.describe("admin: administrators", () => {
  test("lists the seeded admin and blocks deleting yourself", async ({ page }) => {
    await page.goto("/admin/admins");

    const row = page.getByRole("row", { name: new RegExp(SEEDED_ADMIN) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Ativo")).toBeVisible();
    await expect(row.getByText("(você)")).toBeVisible();
    // The signed-in admin can't remove their own account.
    await expect(row.getByRole("button", { name: /Excluir/ })).toBeDisabled();
  });

  test("invite → activate → appears active → remove", async ({
    page,
    request,
    browser,
  }) => {
    const email = uniqueEmail();

    // Invite a new admin.
    await page.goto("/admin/admins");
    await page.getByRole("button", { name: "Convidar admin" }).click();
    await page.getByLabel("Nome").fill("Novo Admin");
    await page.getByLabel("E-mail").fill(email);
    await page.getByRole("button", { name: "Enviar convite" }).click();

    // Shows as pending, no user activated yet.
    const pendingRow = page.getByRole("row", { name: new RegExp(email) });
    await expect(pendingRow).toBeVisible();
    await expect(pendingRow.getByText("Pendente")).toBeVisible();

    // The set-password link was e-mailed (captured in the outbox).
    const invite = await waitForMessage(request, email, "admin_invite");
    expect(invite.url).toBeTruthy();

    // Accept in a fresh context: set a password and activate.
    const ctx = await browser.newContext();
    try {
      const p = await ctx.newPage();
      await p.goto(invite.url!);
      await expect(
        p.getByRole("heading", { name: "Ative seu acesso" }),
      ).toBeVisible();
      await p.getByLabel("Senha", { exact: true }).fill("adminsenha123");
      await p.getByLabel("Confirmar senha").fill("adminsenha123");
      await p.getByRole("button", { name: "Ativar acesso" }).click();
      await p.waitForURL(/\/login\?activated=1/);
    } finally {
      await ctx.close();
    }

    // Back on the list, the invitee is now an active admin (no longer pending).
    await page.reload();
    const activeRow = page.getByRole("row", { name: new RegExp(email) });
    await expect(activeRow.getByText("Ativo")).toBeVisible();
    await expect(activeRow.getByText("Pendente")).toBeHidden();

    // Remove them (permanent). Not self, not bootstrap, not the last admin.
    await activeRow.getByRole("button", { name: /Excluir/ }).click();
    await page
      .getByRole("button", { name: "Excluir definitivamente" })
      .click();
    await expect(
      page.getByRole("row", { name: new RegExp(email) }),
    ).toBeHidden();
  });
});
