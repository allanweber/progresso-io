// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantContext } from "@/server/tenant";

const getTenantContext = vi.fn<() => Promise<TenantContext | null>>();
vi.mock("@/server/tenant", () => ({
  getTenantContext: () => getTenantContext(),
}));

const getStudent = vi.fn();
const assignAnamnesis = vi.fn();
vi.mock("@/server/dal", () => ({
  students: { getStudent: (...args: unknown[]) => getStudent(...args) },
  studentAnamneses: {
    assignAnamnesis: (...args: unknown[]) => assignAnamnesis(...args),
  },
}));
vi.mock("@/server/dal/student-anamneses", () => ({
  toStudentAnamnesisDto: (row: unknown) => row,
}));

const sendAnamnesisInvite = vi.fn();
vi.mock("@/server/onboarding", () => ({
  sendAnamnesisInvite: (...args: unknown[]) => sendAnamnesisInvite(...args),
}));

import { PUT } from "@/app/api/students/[id]/anamnesis/template/route";

const COACH: TenantContext = {
  db: {} as TenantContext["db"],
  clinicId: "clinic-1",
  userId: "user-1",
  role: "coach",
};
const ID = "7f8a2b1c-3d4e-4f5a-8b6c-9d0e1f2a3b4c";
const TEMPLATE = "1f8a2b1c-3d4e-4f5a-8b6c-9d0e1f2a3b4c";

function call() {
  return PUT(
    new Request(`http://localhost/api/students/${ID}/anamnesis/template`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anamnesisId: TEMPLATE }),
    }),
    { params: Promise.resolve({ id: ID }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getTenantContext.mockResolvedValue(COACH);
  assignAnamnesis.mockResolvedValue({ ok: true, studentAnamnesis: { id: "a" } });
  sendAnamnesisInvite.mockResolvedValue({ ok: true });
});

describe("PUT /api/students/[id]/anamnesis/template", () => {
  it("prepares a new link for an online student", async () => {
    getStudent.mockResolvedValue({ id: ID, modality: "online" });

    const res = await call();

    expect(res.status).toBe(200);
    expect(sendAnamnesisInvite).toHaveBeenCalledWith(
      COACH,
      ID,
      expect.any(String),
    );
    await expect(res.json()).resolves.toMatchObject({ inviteSent: true });
  });

  it("prepares nothing for an offline student", async () => {
    getStudent.mockResolvedValue({ id: ID, modality: "offline" });

    const res = await call();

    expect(res.status).toBe(200);
    expect(sendAnamnesisInvite).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ inviteSent: false });
  });

  it("keeps the new template when preparing the message fails", async () => {
    getStudent.mockResolvedValue({ id: ID, modality: "online" });
    sendAnamnesisInvite.mockRejectedValue(new Error("down"));

    const res = await call();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ inviteSent: false });
  });
});
