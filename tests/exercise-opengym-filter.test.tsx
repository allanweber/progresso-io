import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExerciseListItemDto } from "@/lib/exercises";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class extends Error {},
}));

const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/coach/library/exercises",
  useSearchParams: () => searchParams,
}));

const { ExerciseSearch } = await import("@/components/workouts/exercise-search");
const { ExerciseCatalog } = await import("@/components/exercises/exercise-catalog");

const SQUAT: ExerciseListItemDto = {
  id: "ex-1",
  code: "Barbell_Squat",
  name: "Agachamento com barra",
  nameEn: null,
  category: "strength",
  level: "beginner",
  equipment: "barbell",
  primaryMuscles: ["quadriceps"],
  origin: "base",
  thumbnail: null,
};

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const urls = () => apiFetch.mock.calls.map(([url]) => url as string);

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ items: [SQUAT], total: 1, page: 1, pageSize: 8 });
  replace.mockReset();
  searchParams = new URLSearchParams();
});

describe("ExerciseSearch openGym flag", () => {
  it("searches the whole catalog until the flag is ticked", async () => {
    const user = userEvent.setup();
    withClient(<ExerciseSearch onPick={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Buscar exercício/), "agach");
    await screen.findByText("Agachamento com barra");
    expect(urls()).toEqual(["/api/exercises?search=agach&pageSize=8"]);

    await user.click(
      screen.getByRole("checkbox", { name: "Somente exercícios com equivalente no openGym" }),
    );
    await waitFor(() =>
      expect(urls()).toContain("/api/exercises?search=agach&pageSize=8&openGym=1"),
    );
  });

  it("shows the muscle map for a result without an image", async () => {
    const user = userEvent.setup();
    withClient(<ExerciseSearch onPick={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Buscar exercício/), "agach");
    expect(
      await screen.findByRole("img", { name: "Músculos trabalhados: Quadríceps" }),
    ).toBeInTheDocument();
  });
});

describe("ExerciseCatalog openGym flag", () => {
  const catalog = (admin = false) =>
    withClient(
      <ExerciseCatalog
        apiBase="/api/exercises"
        basePath="/coach/library/exercises"
        title="Exercícios"
        admin={admin}
      />,
    );

  it("filters the listing and mirrors the flag into the URL", async () => {
    const user = userEvent.setup();
    catalog();

    await screen.findByText("Agachamento com barra");
    expect(urls().at(-1)).not.toContain("openGym");

    await user.click(screen.getByRole("checkbox", { name: "Somente com equivalente no openGym" }));
    await waitFor(() => expect(urls().at(-1)).toContain("openGym=1"));
    expect(replace).toHaveBeenLastCalledWith("/coach/library/exercises?openGym=1", {
      scroll: false,
    });
  });

  it("restores the flag from the URL", async () => {
    searchParams = new URLSearchParams("openGym=1");
    catalog();

    expect(
      screen.getByRole("checkbox", { name: "Somente com equivalente no openGym" }),
    ).toBeChecked();
    await waitFor(() => expect(urls()[0]).toContain("openGym=1"));
  });

  it("is not offered in the admin catalog", async () => {
    catalog(true);
    await screen.findByText("Agachamento com barra");
    expect(
      screen.queryByRole("checkbox", { name: "Somente com equivalente no openGym" }),
    ).not.toBeInTheDocument();
  });

  it("draws the muscle map on a card without an image", async () => {
    catalog();
    expect(
      await screen.findByRole("img", { name: "Músculos trabalhados: Quadríceps" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("exercise-thumb")).not.toBeInTheDocument();
  });
});

describe("admin ExerciseCatalog openGym link", () => {
  const adminCatalog = () =>
    withClient(
      <ExerciseCatalog apiBase="/api/admin/exercises" basePath="/admin/exercises" title="Exercícios" admin />,
    );

  it("restores the linked/unlinked filter from the URL and sends it to the listing", async () => {
    searchParams = new URLSearchParams("openGym=unlinked");
    adminCatalog();

    expect(screen.getByRole("combobox", { name: "openGym" })).toHaveTextContent(
      "Sem vínculo com o openGym",
    );
    await waitFor(() =>
      expect(urls().find((u) => u.startsWith("/api/admin/exercises?"))).toContain("openGym=unlinked"),
    );
  });

  it("ignores the coach flag value", async () => {
    searchParams = new URLSearchParams("openGym=1");
    adminCatalog();

    expect(screen.getByRole("combobox", { name: "openGym" })).toHaveTextContent("openGym: todos");
    await screen.findByText("Agachamento com barra");
  });

  it("shows the openGym id badge on a linked card", async () => {
    apiFetch.mockResolvedValue({
      items: [{ ...SQUAT, openGymId: "0043", archived: false, clinicName: null }],
      total: 1,
      page: 1,
      pageSize: 24,
    });
    adminCatalog();

    expect(await screen.findByText("openGym #0043")).toBeInTheDocument();
  });
});
