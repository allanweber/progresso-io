import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExerciseListItemDto, ExerciseListResponse } from "@/lib/exercises";

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
  code: "0043",
  name: "Agachamento com barra",
  nameEn: "Barbell full squat",
  bodyPart: "upper legs",
  category: "strength",
  equipment: "barbell",
  target: "quads",
  origin: "base",
  image: "still/0043.webp",
};

function page(over: Partial<ExerciseListResponse> = {}): ExerciseListResponse {
  return {
    items: [SQUAT],
    total: 1,
    page: 1,
    pageSize: 40,
    facets: { categories: ["strength", "cardio"], equipment: ["barbell", "dumbbell"] },
    counts: { base: 5632, clinic: 2 },
    ...over,
  };
}

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const urls = () => apiFetch.mock.calls.map(([url]) => url as string);

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue(page());
  replace.mockReset();
  searchParams = new URLSearchParams();
});

describe("ExerciseCatalog", () => {
  const catalog = () =>
    withClient(
      <ExerciseCatalog
        apiBase="/api/exercises"
        basePath="/coach/library/exercises"
        createHref="/coach/library/exercises/new"
      />,
    );

  it("lists rows as name plus target and equipment, with the library count", async () => {
    catalog();
    const row = await screen.findByTestId("exercise-row");
    expect(row).toHaveTextContent("Agachamento com barra");
    expect(row).toHaveTextContent("Quadríceps · Barra");
    expect(row).toHaveAttribute("href", "/coach/library/exercises/ex-1");
    expect(screen.getByTestId("exercise-library-count")).toHaveTextContent(
      "5.632 exercícios com animação + 2 próprios",
    );
    expect(screen.getByRole("link", { name: /Criar exercício próprio/ })).toHaveAttribute(
      "href",
      "/coach/library/exercises/new",
    );
  });

  it("filters by a body-part chip and mirrors it into the URL", async () => {
    const user = userEvent.setup();
    catalog();
    await screen.findByTestId("exercise-row");

    await user.click(screen.getByRole("button", { name: "Coxas e glúteos" }));
    await waitFor(() => expect(urls().at(-1)).toContain("bodyPart=upper+legs"));
    expect(replace).toHaveBeenLastCalledWith("/coach/library/exercises?bodyPart=upper+legs", {
      scroll: false,
    });
    expect(screen.getByRole("status", { name: "1 exercícios" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Coxas e glúteos" }));
    await waitFor(() => expect(urls().at(-1)).not.toContain("bodyPart"));
  });

  it("offers only the facets the listing returns in the Filters dialog", async () => {
    const user = userEvent.setup();
    catalog();
    await screen.findByTestId("exercise-row");

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Cardio" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Yoga" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Halteres" }));
    await waitFor(() => expect(urls().at(-1)).toContain("equipment=dumbbell"));
    await user.click(within(dialog).getByRole("button", { name: "Pronto" }));

    const chip = screen.getByRole("button", { name: "Remover filtro: Halteres" });
    await user.click(chip);
    await waitFor(() => expect(urls().at(-1)).not.toContain("equipment"));
  });

  it("restores the filters from the URL", async () => {
    searchParams = new URLSearchParams("bodyPart=chest&category=cardio");
    catalog();
    await waitFor(() => expect(urls()[0]).toContain("bodyPart=chest"));
    expect(urls()[0]).toContain("category=cardio");
    expect(screen.getByRole("button", { name: "Peito" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Remover filtro: Cardio" })).toBeInTheDocument();
  });

  it("switches between rows and cards", async () => {
    const user = userEvent.setup();
    catalog();
    await screen.findByTestId("exercise-row");
    await user.click(screen.getByRole("button", { name: "Ver em cartões" }));
    expect(screen.getByRole("button", { name: "Ver em lista" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("loads the next page when asked", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("page=2")
          ? page({ page: 2, total: 41, items: [{ ...SQUAT, id: "ex-2", name: "Agachamento frontal" }] })
          : page({ total: 41 }),
      ),
    );
    catalog();
    await screen.findByTestId("exercise-row");
    await user.click(screen.getByRole("button", { name: "Mostrar mais" }));
    expect(await screen.findByText("Agachamento frontal")).toBeInTheDocument();
    expect(screen.getAllByTestId("exercise-row")).toHaveLength(2);
  });
});

describe("ExerciseSearch", () => {
  it("searches by text and by a body-part chip", async () => {
    const user = userEvent.setup();
    withClient(<ExerciseSearch onPick={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Buscar exercício/), "agach");
    await screen.findByText("Agachamento com barra");
    expect(screen.getByText("Quadríceps · Barra")).toBeInTheDocument();
    expect(urls()).toEqual(["/api/exercises?search=agach&pageSize=20"]);

    await user.click(screen.getByRole("button", { name: "Coxas e glúteos" }));
    await waitFor(() =>
      expect(urls()).toContain("/api/exercises?search=agach&bodyPart=upper+legs&pageSize=20"),
    );
  });

  it("lists a body part without any text", async () => {
    const user = userEvent.setup();
    withClient(<ExerciseSearch onPick={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Peito" }));
    await screen.findByText("Agachamento com barra");
    expect(urls()).toEqual(["/api/exercises?bodyPart=chest&pageSize=20"]);
  });
});
