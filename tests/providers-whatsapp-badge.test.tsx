import { act, render, screen, waitFor } from "@testing-library/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";

import { Providers } from "@/components/providers";

function Harness({ fetchCount }: { fetchCount: () => Promise<number> }) {
  const badge = useQuery({
    queryKey: ["coach-wa-waiting-count"],
    queryFn: fetchCount,
  });
  const publish = useMutation({ mutationFn: async () => "ok" });
  return (
    <button type="button" onClick={() => publish.mutate()}>
      badge {badge.data ?? "-"}
    </button>
  );
}

it("refreshes the WhatsApp badge after any mutation succeeds", async () => {
  const fetchCount = vi
    .fn<() => Promise<number>>()
    .mockResolvedValueOnce(1)
    .mockResolvedValue(2);

  render(
    <Providers>
      <Harness fetchCount={fetchCount} />
    </Providers>,
  );
  await screen.findByRole("button", { name: "badge 1" });

  await act(async () => {
    screen.getByRole("button").click();
  });

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "badge 2" })).toBeTruthy(),
  );
});

function CacheHarness() {
  const client = useQueryClient();
  const publish = useMutation({ mutationFn: async () => "ok" });
  return (
    <button
      type="button"
      onClick={() => {
        client.setQueryData(["coach-whatsapp"], { queued: [] });
        publish.mutate(undefined, {
          onSuccess: () => {
            const cached = client.getQueryData(["coach-whatsapp"]);
            document.title = cached ? "still cached" : "cleared";
          },
        });
      }}
    >
      publish
    </button>
  );
}

it("drops the cached WhatsApp list after a change on another page", async () => {
  render(
    <Providers>
      <CacheHarness />
    </Providers>,
  );

  await act(async () => {
    screen.getByRole("button", { name: "publish" }).click();
  });

  await waitFor(() => expect(document.title).toBe("cleared"));
});
