// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantContext } from "@/server/tenant";

/**
 * What registering a student actually sends.
 *
 * The rule these pin down: an **online** aluno is never created in silence.
 * With an anamnese they get the questionnaire (portal access follows when they
 * submit it); without one there is nothing to wait for, so the access link goes
 * out immediately. Offline students get neither — they never log in.
 *
 * Driven through the route with the session and DAL mocked, because the branch
 * under test lives in the handler: which sender runs for which student is the
 * whole behaviour, and it is invisible from the DAL down.
 */

const getTenantContext = vi.fn<() => Promise<TenantContext | null>>();
vi.mock("@/server/tenant", () => ({ getTenantContext: () => getTenantContext() }));

const sendAnamnesisInvite = vi.fn(async () => ({ ok: true as const }));
const sendPortalInvite = vi.fn(async () => ({ ok: true as const }));
vi.mock("@/server/onboarding", () => ({
  sendAnamnesisInvite: () => sendAnamnesisInvite(),
  sendPortalInvite: () => sendPortalInvite(),
}));

vi.mock("@/server/dal", () => ({
  students: {
    createStudent: vi.fn(async () => ({
      id: "11111111-1111-1111-1111-111111111111",
      firstName: "Ana",
      lastName: "Aluna",
      email: "ana@example.com",
      phone: "5511999990000",
      goal: null,
      status: "active",
      modality: "online",
      coachId: "user-coach",
      userId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findStudentByEmail: vi.fn(async () => null),
    findStudentByPhone: vi.fn(async () => null),
    countStudents: vi.fn(async () => 0),
    listStudents: vi.fn(async () => []),
  },
  plans: {
    getStudentLimit: vi.fn(async () => 100),
    canUseWhatsapp: vi.fn(async () => true),
  },
  studentAnamneses: { assignAnamnesis: vi.fn(async () => ({ ok: true })) },
}));

import { POST } from "@/app/api/students/route";

const COACH: TenantContext = {
  db: {} as TenantContext["db"],
  clinicId: "clinic-1",
  userId: "user-coach",
  role: "coach",
};

const ANAMNESIS_ID = "22222222-2222-4222-8222-222222222222";

async function register(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new Request("http://localhost/api/students", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) } as never,
  );
}

/**
 * The registration payload the form posts. `goal` and `anamnesisId` are always
 * present as strings — empty means "none", which is what the no-anamnese branch
 * receives.
 */
const online = {
  firstName: "Ana",
  lastName: "Aluna",
  email: "ana@example.com",
  phone: "11999990000",
  goal: "",
  anamnesisId: "",
  modality: "online",
};

beforeEach(() => {
  vi.clearAllMocks();
  getTenantContext.mockResolvedValue(COACH);
});

describe("registering a student", () => {
  it("sends the anamnese first when one was chosen", async () => {
    const res = await register({ ...online, anamnesisId: ANAMNESIS_ID });

    expect(res.status).toBe(201);
    expect(sendAnamnesisInvite).toHaveBeenCalledTimes(1);
    // Portal access is NOT sent yet — submitting the questionnaire is what
    // opens it, which is what the student was told to expect.
    expect(sendPortalInvite).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ sent: true });
  });

  /**
   * The regression this file exists for: an online student registered without an
   * anamnese used to receive nothing at all — no e-mail, no WhatsApp — and
   * waited for a "first prescription" trigger the coach had no reason to expect.
   */
  it("invites straight to the platform when there is no anamnese", async () => {
    const res = await register(online);

    expect(res.status).toBe(201);
    expect(sendPortalInvite).toHaveBeenCalledTimes(1);
    expect(sendAnamnesisInvite).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ sent: true });
  });

  it("sends nothing to an offline student", async () => {
    const res = await register({
      firstName: "Bruno",
      lastName: "Presencial",
      email: "",
      phone: "11988880000",
      goal: "",
      anamnesisId: "",
      modality: "in_person",
    });

    expect(res.status).toBe(201);
    expect(sendAnamnesisInvite).not.toHaveBeenCalled();
    expect(sendPortalInvite).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ sent: false });
  });

  it("reports a failed send without failing the registration", async () => {
    // The student exists either way; `sent: false` is what tells the coach to
    // resend rather than silently assuming the aluno was contacted.
    sendPortalInvite.mockResolvedValueOnce({ ok: false } as never);
    const res = await register(online);

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ sent: false });
  });
});
