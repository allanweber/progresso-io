import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExerciseFormSource } from "@/components/exercises/exercise-form";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class extends Error {},
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

const { ExerciseForm } = await import("@/components/exercises/exercise-form");

const SQUAT: ExerciseFormSource = {
  id: "ex-1",
  name: "Agachamento com halteres",
  nameEn: null,
  description: null,
  descriptionEn: null,
  bodyPart: "upper legs",
  category: "strength",
  equipment: "dumbbell",
  machineKind: null,
  target: "quads",
  secondaryMuscles: [],
  needs: [],
  hold: false,
  instructions: ["Segure os halteres."],
  instructionsEn: [],
  image: null,
};

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExerciseForm
        mode="edit"
        exercise={SQUAT}
        apiBase="/api/exercises"
        imageEndpoint="/api/exercises/images"
        listKey="exercises"
        detailKey="exercise"
        detailPath="/coach/library/exercises"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ exercise: { id: "ex-1" } });
});

describe("ExerciseForm English fields", () => {
  it("saves the English name and steps alongside the PT-BR ones", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Nome em inglês (opcional)"), "Dumbbell Squat");
    const addButtons = screen.getAllByRole("button", { name: "Adicionar passo" });
    expect(addButtons).toHaveLength(2);
    await user.click(addButtons[1]);
    await user.type(screen.getByPlaceholderText("Step 1"), "Hold the dumbbells.");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toBe("/api/exercises/ex-1");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      name: "Agachamento com halteres",
      nameEn: "Dumbbell Squat",
      instructions: ["Segure os halteres."],
      instructionsEn: ["Hold the dumbbells."],
      bodyPart: "upper legs",
      target: "quads",
      machineKind: "",
    });
  });

  it("asks which machine when the equipment is a machine", async () => {
    const user = userEvent.setup();
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ExerciseForm
          mode="edit"
          exercise={{ ...SQUAT, equipment: "leverage machine" }}
          apiBase="/api/exercises"
          imageEndpoint="/api/exercises/images"
          listKey="exercises"
          detailKey="exercise"
          detailPath="/coach/library/exercises"
        />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("Máquina")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Selecione a máquina.")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("prefills the English fields when editing", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ExerciseForm
          mode="edit"
          exercise={{ ...SQUAT, nameEn: "Dumbbell Squat", instructionsEn: ["Hold the dumbbells."] }}
          apiBase="/api/exercises"
          imageEndpoint="/api/exercises/images"
          listKey="exercises"
          detailKey="exercise"
          detailPath="/coach/library/exercises"
        />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("Nome em inglês (opcional)")).toHaveValue("Dumbbell Squat");
    expect(screen.getByPlaceholderText("Step 1")).toHaveValue("Hold the dumbbells.");
  });
});
