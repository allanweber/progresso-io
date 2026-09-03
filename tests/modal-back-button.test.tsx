import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Back must close the modal, not the page under it. On a phone the system Back
 * gesture is how people dismiss anything full-screen, and ours used to unwind
 * the router instead — closing a "tem certeza?" cost you the whole screen
 * behind it.
 */

/** jsdom's history.back() is async; wait for the popstate it produces. */
function goBack() {
  const popped = new Promise<void>((resolve) => {
    window.addEventListener("popstate", () => resolve(), { once: true });
  });
  window.history.back();
  return popped;
}

function OneModal() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Confirmar</DialogTitle>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NestedModals() {
  const [outer, setOuter] = React.useState(false);
  const [inner, setInner] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuter(true)}>
        Abrir
      </button>
      <Dialog open={outer} onOpenChange={setOuter}>
        <DialogContent>
          <DialogTitle>Externo</DialogTitle>
          <button type="button" onClick={() => setInner(true)}>
            Abrir foto
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={inner} onOpenChange={setInner}>
        <DialogContent>
          <DialogTitle>Foto</DialogTitle>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("modais e o botão voltar", () => {
  beforeEach(() => {
    // Every test starts on a page that was itself navigated to, so a stray
    // extra `back()` would be visible as a URL change.
    window.history.replaceState(null, "", "/coach/students/aluno-1");
    window.history.pushState(null, "", "/coach/students/aluno-1/feedback");
  });

  it("fecha o modal em vez de sair da página", async () => {
    const user = userEvent.setup();
    render(<OneModal />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(await screen.findByText("Confirmar")).toBeInTheDocument();

    await goBack();

    await waitFor(() =>
      expect(screen.queryByText("Confirmar")).not.toBeInTheDocument(),
    );
    // Still on the same page: Back was spent on the modal, not the route.
    expect(window.location.pathname).toBe("/coach/students/aluno-1/feedback");
  });

  it("devolve a entrada quando o modal fecha sozinho, para que voltar navegue", async () => {
    const user = userEvent.setup();
    render(<OneModal />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await screen.findByText("Confirmar");
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    await waitFor(() =>
      expect(screen.queryByText("Confirmar")).not.toBeInTheDocument(),
    );
    // The spare entry is unwound as the modal closes, so the next Back is the
    // ordinary one the user expects.
    await waitFor(() =>
      expect(window.location.pathname).toBe(
        "/coach/students/aluno-1/feedback",
      ),
    );

    await goBack();
    await waitFor(() =>
      expect(window.location.pathname).toBe("/coach/students/aluno-1"),
    );
  });

  it("fecha um modal por vez quando estão aninhados", async () => {
    const user = userEvent.setup();
    render(<NestedModals />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.click(await screen.findByRole("button", { name: "Abrir foto" }));
    expect(await screen.findByText("Foto")).toBeInTheDocument();

    await goBack();

    // Only the inner one goes: the outer modal is still the screen behind it.
    await waitFor(() =>
      expect(screen.queryByText("Foto")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Externo")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/coach/students/aluno-1/feedback");

    await goBack();
    await waitFor(() =>
      expect(screen.queryByText("Externo")).not.toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe("/coach/students/aluno-1/feedback");
  });
});
