// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantContext } from "@/server/tenant";

const getTenantContext = vi.fn<() => Promise<TenantContext | null>>();
vi.mock("@/server/tenant", () => ({
  getTenantContext: () => getTenantContext(),
}));

const canUseWhatsapp = vi.fn(async () => true);
const markHandedOff = vi.fn();
const dismissQueued = vi.fn();
vi.mock("@/server/dal", () => ({
  plans: { canUseWhatsapp: () => canUseWhatsapp() },
  whatsapp: {
    markHandedOff: (...args: unknown[]) => markHandedOff(...args),
    dismissQueued: (...args: unknown[]) => dismissQueued(...args),
  },
}));

import { POST } from "@/app/api/coach/whatsapp/messages/[id]/route";

const COACH: TenantContext = {
  db: {} as TenantContext["db"],
  clinicId: "clinic-1",
  userId: "user-1",
  role: "coach",
};
const ID = "7f8a2b1c-3d4e-4f5a-8b6c-9d0e1f2a3b4c";

function call(body: unknown, id = ID) {
  return POST(
    new Request(`http://localhost/api/coach/whatsapp/messages/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getTenantContext.mockResolvedValue(COACH);
  canUseWhatsapp.mockResolvedValue(true);
});

describe("POST /api/coach/whatsapp/messages/[id]", () => {
  it("rejects an unknown action before touching the DAL", async () => {
    const res = await call({ action: "send" });
    expect(res.status).toBe(422);
    expect(markHandedOff).not.toHaveBeenCalled();
    expect(dismissQueued).not.toHaveBeenCalled();
  });

  it("refuses a plan without WhatsApp", async () => {
    canUseWhatsapp.mockResolvedValue(false);
    const res = await call({ action: "handoff" });
    expect(res.status).toBe(403);
    expect(markHandedOff).not.toHaveBeenCalled();
  });

  it("answers 404 for a message outside this clinic", async () => {
    markHandedOff.mockResolvedValue(null);
    const res = await call({ action: "handoff" });
    expect(res.status).toBe(404);
    expect(markHandedOff).toHaveBeenCalledWith(COACH, ID);
  });

  it("answers 404 for a malformed id", async () => {
    const res = await call({ action: "handoff" }, "not-a-uuid");
    expect(res.status).toBe(404);
  });

  it("routes each action to its DAL function", async () => {
    markHandedOff.mockResolvedValue({ id: ID, status: "handed_off" });
    dismissQueued.mockResolvedValue({ id: ID, status: "dismissed" });

    expect((await call({ action: "handoff" })).status).toBe(200);
    expect((await call({ action: "dismiss" })).status).toBe(200);
    expect(markHandedOff).toHaveBeenCalledTimes(1);
    expect(dismissQueued).toHaveBeenCalledTimes(1);
  });
});
