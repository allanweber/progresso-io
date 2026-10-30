import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExerciseDetailDto } from "@/lib/exercises";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class extends Error {},
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ex-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { ExerciseImages, ExerciseImageButton } = await import(
  "@/components/workouts/exercise-images"
);
const { ExerciseDetail } = await import("@/components/exercises/exercise-detail");

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const DETAIL: ExerciseDetailDto = {
  id: "ex-1",
  code: "exercisedb-0041",
  name: "Elevação frontal com barra",
  nameEn: null,
  description: null,
  category: "strength",
  level: "beginner",
  force: "push",
  mechanic: "isolation",
  equipment: "barbell",
  primaryMuscles: ["shoulders"],
  secondaryMuscles: ["chest"],
  instructions: ["Eleve a barra."],
  instructionsEn: [],
  images: [],
  imageCredits: {},
  origin: "base",
  archived: false,
  openGymId: null,
  substitutes: [],
};

beforeEach(() => apiFetch.mockReset());

describe("ExerciseImages", () => {
  it("draws both sides of the body when the exercise has no image", () => {
    render(<ExerciseImages images={[]} name="Agachamento" primaryMuscles={["quadriceps"]} />);
    const map = screen.getByRole("img", { name: "Músculos trabalhados: Quadríceps" });
    expect(map.querySelectorAll("svg")).toHaveLength(2);
  });

  it("falls back to the muscle map when every image fails to load", () => {
    render(
      <ExerciseImages
        images={["https://img.test/a.jpg"]}
        name="Agachamento"
        primaryMuscles={["quadriceps"]}
      />,
    );
    fireEvent.error(screen.getByAltText("Agachamento"));
    expect(
      screen.getByRole("img", { name: "Músculos trabalhados: Quadríceps" }),
    ).toBeInTheDocument();
  });

  it("keeps the dumbbell placeholder when no muscles are known", () => {
    render(<ExerciseImages images={[]} name="Agachamento" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("ExerciseImageButton", () => {
  it("draws the muscle map instead of the zoom button without a thumbnail", () => {
    withClient(
      <ExerciseImageButton
        exerciseId="ex-1"
        name="Agachamento"
        thumbnail={null}
        primaryMuscles={["quadriceps"]}
      />,
    );
    expect(
      screen.getByRole("img", { name: "Músculos trabalhados: Quadríceps" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the zoom button when there is a thumbnail", () => {
    withClient(
      <ExerciseImageButton
        exerciseId="ex-1"
        name="Agachamento"
        thumbnail="Barbell_Squat/0.jpg"
        primaryMuscles={["quadriceps"]}
      />,
    );
    expect(screen.getByRole("button", { name: "Ampliar imagem de Agachamento" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Músculos trabalhados/ })).not.toBeInTheDocument();
  });
});

describe("ExerciseDetail images", () => {
  const detail = () =>
    withClient(<ExerciseDetail apiBase="/api/exercises" backHref="/coach/library/exercises" />);

  it("credits the author and licence of wger images", async () => {
    apiFetch.mockResolvedValue({
      ...DETAIL,
      images: ["exercisedb-0041/0.png", "exercisedb-0041/1.png"],
      imageCredits: {
        "exercisedb-0041/0.png": {
          author: "philip",
          license: "CC-BY-SA 4",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/deed.en",
          sourceUrl: "https://wger.de/exercise/256/view/",
          aiGenerated: false,
        },
        "exercisedb-0041/1.png": {
          author: "philip",
          license: "CC-BY-SA 4",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/deed.en",
          sourceUrl: "https://wger.de/exercise/256/view/",
          aiGenerated: false,
        },
        "exercisedb-0041/9.png": {
          author: "removed",
          license: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          sourceUrl: "https://wger.de/exercise/1/view/",
          aiGenerated: true,
        },
      },
    });
    detail();

    const credit = (await screen.findByText(/^Imagens:/)).closest("p")!;
    expect(credit).toHaveTextContent("Imagens: philip, CC-BY-SA 4, via wger.de");
    expect(within(credit).getByRole("link", { name: "CC-BY-SA 4" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/deed.en",
    );
    expect(within(credit).getByRole("link", { name: "wger.de" })).toHaveAttribute(
      "href",
      "https://wger.de/exercise/256/view/",
    );
    expect(credit).not.toHaveTextContent("removed");
    expect(screen.queryByRole("img", { name: /Músculos trabalhados/ })).not.toBeInTheDocument();
  });

  it("flags an AI-generated image in the credit", async () => {
    apiFetch.mockResolvedValue({
      ...DETAIL,
      images: ["exercisedb-0041/0.png"],
      imageCredits: {
        "exercisedb-0041/0.png": {
          author: "wger.de",
          license: "CC-BY-SA 4",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/deed.en",
          sourceUrl: "https://wger.de/exercise/256/view/",
          aiGenerated: true,
        },
      },
    });
    detail();
    expect((await screen.findByText(/^Imagens:/)).closest("p")).toHaveTextContent(
      "wger.de (gerada por IA)",
    );
  });

  it("draws the muscle map with a legend when the exercise has no image", async () => {
    apiFetch.mockResolvedValue(DETAIL);
    detail();

    const map = await screen.findByRole("img", { name: "Músculos trabalhados: Ombros" });
    expect(map.querySelectorAll("svg")).toHaveLength(2);
    expect(screen.getByText("Músculo principal")).toBeInTheDocument();
    expect(screen.getByText("Músculo secundário")).toBeInTheDocument();
    expect(screen.queryByText(/^Imagens:/)).not.toBeInTheDocument();
  });
});

describe("ExerciseDetail openGym link", () => {
  const detail = () =>
    withClient(<ExerciseDetail apiBase="/api/admin/exercises" backHref="/admin/exercises" manage="base" />);

  it("shows the linked openGym id", async () => {
    apiFetch.mockResolvedValue({ ...DETAIL, openGymId: "0041" });
    detail();
    expect(await screen.findByText("openGym #0041")).toBeInTheDocument();
  });

  it("says when the exercise has no openGym link", async () => {
    apiFetch.mockResolvedValue(DETAIL);
    detail();
    expect(await screen.findByText("Sem vínculo com o openGym")).toBeInTheDocument();
  });
});
