import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class extends Error {},
}));

const { AiGenerateButton } = await import("@/components/ai/ai-generate-button");

function renderButton() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AiGenerateButton
        studentId="aluno-1"
        kind="workout"
        hasDraft={false}
        defaultObjective={null}
        onGenerated={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("AiGenerateButton — remembered answers", () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetch.mockReset();
    apiFetch.mockImplementation((url: string) => {
      if (url.includes("plan-usage")) {
        return Promise.resolve({ ai: { used: 0, limit: 10 } });
      }
      if (url.includes("anamnesis")) {
        return Promise.resolve({ anamnesis: { status: "completed" } });
      }
      return Promise.resolve({ used: 1, limit: 10, repaired: false });
    });
  });

  it("remembers answers even when no generation was completed", async () => {
    const user = userEvent.setup();
    const { unmount } = renderButton();

    const trigger = await screen.findByRole("button", {
      name: /Gerar treino com IA/,
    });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);

    await user.type(screen.getByLabelText("Objetivo"), "resistência");
    await user.click(screen.getByRole("checkbox", { name: "Academia completa" }));
    // Closed without generating — the coach was interrupted, or thought better
    // of it. The typing still happened and must not be thrown away.
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    unmount();
    renderButton();
    const again = await screen.findByRole("button", {
      name: /Gerar treino com IA/,
    });
    await waitFor(() => expect(again).toBeEnabled());
    await user.click(again);

    expect(screen.getByLabelText("Objetivo")).toHaveValue("resistência");
    expect(
      screen.getByRole("checkbox", { name: "Academia completa" }),
    ).toBeChecked();
  });

  it("brings the answers back on the next open", async () => {
    const user = userEvent.setup();
    const { unmount } = renderButton();

    const trigger = await screen.findByRole("button", {
      name: /Gerar treino com IA/,
    });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);

    await user.clear(screen.getByLabelText("Objetivo"));
    await user.type(screen.getByLabelText("Objetivo"), "força máxima");
    await user.click(screen.getByRole("checkbox", { name: "Halteres" }));
    await user.clear(screen.getByLabelText("Dias por semana"));
    await user.type(screen.getByLabelText("Dias por semana"), "5");

    await user.click(screen.getByRole("button", { name: /^Gerar$/ }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/students/aluno-1/workout/generate",
      expect.anything(),
    ));

    // A fresh mount is the real test: the coach comes back to this screen later.
    unmount();
    renderButton();
    const again = await screen.findByRole("button", {
      name: /Gerar treino com IA/,
    });
    await waitFor(() => expect(again).toBeEnabled());
    await user.click(again);

    expect(screen.getByLabelText("Objetivo")).toHaveValue("força máxima");
    expect(screen.getByLabelText("Dias por semana")).toHaveValue(5);
    expect(screen.getByRole("checkbox", { name: "Halteres" })).toBeChecked();
  });
});
