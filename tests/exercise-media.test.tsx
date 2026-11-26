import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mediaForSex,
  muscleShares,
  type ExerciseDetailDto,
} from "@/lib/exercises";
import { workoutForSex, type WorkoutExerciseDto } from "@/lib/workouts";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class extends Error {},
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ex-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { ExerciseMedia, ExerciseMediaButton } = await import(
  "@/components/exercises/exercise-media"
);
const { ExerciseDetail } = await import("@/components/exercises/exercise-detail");

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const DETAIL: ExerciseDetailDto = {
  id: "ex-1",
  code: "0025",
  name: "Supino com barra",
  nameEn: "Barbell bench press",
  description: "O supino clássico no banco reto.",
  descriptionEn: "The classic flat-bench press.",
  bodyPart: "chest",
  category: "strength",
  equipment: "barbell",
  machineKind: null,
  target: "pectorals",
  secondaryMuscles: ["triceps", "front delts", "core"],
  mapPrimary: ["chest"],
  mapSecondary: ["triceps", "front-delts", "abs"],
  muscleWeights: { chest: 1, triceps: 0.4, "front-delts": 0.4, abs: 0.2 },
  needs: [],
  hold: false,
  track: null,
  instructions: ["Deite-se no banco.", "Empurre a barra."],
  instructionsEn: ["Lie on the bench.", "Press the bar."],
  image: "still/0025.webp",
  video: "clip/0025.mp4",
  femaleImage: "still/2476.webp",
  femaleVideo: "clip/2476.mp4",
  origin: "base",
  archived: false,
  substitutes: [],
};

beforeEach(() => apiFetch.mockReset());

describe("ExerciseMedia", () => {
  it("shows the still first and plays the looped clip on the play button", () => {
    render(<ExerciseMedia media={DETAIL} name="Supino com barra" />);
    expect(screen.getByTestId("exercise-image").getAttribute("src")).toMatch(/still\/0025\.webp$/);
    expect(screen.queryByTestId("exercise-video")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir vídeo de Supino com barra" }));
    const video = screen.getByTestId("exercise-video");
    expect(video.getAttribute("src")).toMatch(/clip\/0025\.mp4$/);
    expect(video.getAttribute("poster")).toMatch(/still\/0025\.webp$/);
    expect(video).toHaveAttribute("loop");
  });

  it("falls back to the still, then to the muscle map", () => {
    render(
      <ExerciseMedia
        media={DETAIL}
        name="Supino com barra"
        mapPrimary={["chest"]}
      />,
    );
    fireEvent.click(screen.getByTestId("exercise-play"));
    fireEvent.error(screen.getByTestId("exercise-video"));
    expect(screen.queryByTestId("exercise-play")).not.toBeInTheDocument();
    fireEvent.error(screen.getByTestId("exercise-image"));
    expect(screen.getByRole("img", { name: "Músculos trabalhados: Peito" })).toBeInTheDocument();
  });

  it("plays the clip at once when there is no still", () => {
    render(<ExerciseMedia media={{ image: null, video: "clip/0025.mp4" }} name="Supino" />);
    expect(screen.getByTestId("exercise-video")).toBeInTheDocument();
    expect(screen.queryByTestId("exercise-play")).not.toBeInTheDocument();
  });

  it("keeps the dumbbell placeholder without media or muscles", () => {
    render(<ExerciseMedia media={{ image: null, video: null }} name="Supino" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByTestId("exercise-video")).not.toBeInTheDocument();
  });
});

describe("ExerciseMediaButton", () => {
  it("shows a plain placeholder without a still", () => {
    withClient(<ExerciseMediaButton exerciseId="ex-1" name="Supino" image={null} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the clip full size from the thumbnail", async () => {
    apiFetch.mockResolvedValue(DETAIL);
    withClient(<ExerciseMediaButton exerciseId="ex-1" name="Supino" image="still/0025.webp" />);
    fireEvent.click(screen.getByRole("button", { name: "Ampliar imagem de Supino" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reproduzir vídeo de Supino" }));
    const video = await screen.findByTestId("exercise-video");
    expect(video.getAttribute("src")).toMatch(/clip\/0025\.mp4$/);
  });
});

describe("muscle shares and media by sex", () => {
  it("splits the stimulus over the drawn muscles and adds up to about 100%", () => {
    const shares = muscleShares(DETAIL.mapPrimary, DETAIL.mapSecondary, DETAIL.muscleWeights);
    expect(shares.map((s) => [s.label, s.percent, s.primary])).toEqual([
      ["Peito", 50, true],
      ["Tríceps", 20, false],
      ["Deltoide anterior", 20, false],
      ["Abdômen", 10, false],
    ]);
  });

  it("gives a female student the female figure and everyone else the default one", () => {
    expect(mediaForSex(DETAIL, "feminino")).toEqual({
      image: "still/2476.webp",
      video: "clip/2476.mp4",
    });
    expect(mediaForSex(DETAIL, "masculino").video).toBe("clip/0025.mp4");
    expect(mediaForSex({ ...DETAIL, femaleImage: null, femaleVideo: null }, "feminino").video).toBe(
      "clip/0025.mp4",
    );
  });

  it("swaps the media of a whole workout and its substitutes for a female student", () => {
    const exercise = {
      ...DETAIL,
      substitutes: [{ ...DETAIL, exerciseId: "ex-2", source: "library", note: null }],
    } as unknown as WorkoutExerciseDto;
    const out = workoutForSex({ sessions: [{ exercises: [exercise] }] }, "feminino");
    const swapped = out.sessions[0].exercises[0];
    expect(swapped.video).toBe("clip/2476.mp4");
    expect(swapped.femaleVideo).toBeNull();
    expect(swapped.substitutes[0].video).toBe("clip/2476.mp4");
  });
});

describe("ExerciseDetail", () => {
  const detail = () =>
    withClient(<ExerciseDetail apiBase="/api/exercises" backHref="/coach/library/exercises" />);

  it("shows the openGym tags: equipment, body part and muscle shares", async () => {
    apiFetch.mockResolvedValue(DETAIL);
    detail();
    const tags = await screen.findByTestId("exercise-tags");
    expect(within(tags).getByText("Barra")).toBeInTheDocument();
    expect(within(tags).getByText("Peito")).toBeInTheDocument();
    expect(within(tags).getByText("Peito 50%")).toBeInTheDocument();
    expect(within(tags).getByText("Tríceps 20%")).toBeInTheDocument();
    fireEvent.click(within(tags).getByRole("button", { name: "Outros 30%" }));
    expect(within(tags).getByText("Abdômen 10%")).toBeInTheDocument();
    expect(screen.getByText("O supino clássico no banco reto.")).toBeInTheDocument();
  });

  it("shows the steps in pt-BR and switches them to English", async () => {
    apiFetch.mockResolvedValue(DETAIL);
    detail();
    expect(await screen.findByText("Deite-se no banco.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver em inglês" }));
    expect(screen.getByText("Lie on the bench.")).toBeInTheDocument();
    expect(screen.getByText("The classic flat-bench press.")).toBeInTheDocument();
  });

  it("draws the muscle map with a legend when the exercise has no media", async () => {
    apiFetch.mockResolvedValue({ ...DETAIL, image: null, video: null });
    detail();
    const map = await screen.findByRole("img", { name: "Músculos trabalhados: Peito" });
    expect(map.querySelectorAll("svg")).toHaveLength(2);
  });
});
