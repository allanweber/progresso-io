import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExerciseMuscleMap } from "@/components/exercises/exercise-muscle-map";

function fills(container: HTMLElement) {
  return [...container.querySelectorAll("polygon")].map((p) => p.getAttribute("style") ?? "");
}

describe("ExerciseMuscleMap", () => {
  it("highlights the primary muscles stronger than the secondary ones", () => {
    const { container } = render(
      <ExerciseMuscleMap primary={["chest"]} secondary={["triceps"]} />,
    );
    const styles = fills(container);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(styles.filter((s) => s.includes("fill: var(--primary)"))).toHaveLength(2);
    expect(styles.filter((s) => s.includes("color-mix"))).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Músculos trabalhados: Peito" })).toBeInTheDocument();
  });

  it("shows the side of the body where the primary muscles are", () => {
    const back = render(<ExerciseMuscleMap primary={["hamstrings", "glutes"]} />).container;
    expect(fills(back).filter((s) => s.includes("fill: var(--primary)")).length).toBeGreaterThan(0);

    const front = render(<ExerciseMuscleMap primary={["quadriceps"]} />).container;
    expect(fills(front).filter((s) => s.includes("fill: var(--primary)"))).toHaveLength(6);
  });

  it("draws both sides when asked", () => {
    const { container } = render(<ExerciseMuscleMap primary={["lats"]} both />);
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });
});
