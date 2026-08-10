import type { Metadata } from "next";

import { AnamnesisFillIsland } from "@/components/anamneses/anamnesis-fill-island";

export const metadata: Metadata = {
  title: "Anamnese — Progresso IO",
};

/**
 * Public anamnese fill page (online students). A Server Component reads the token
 * from the query and hands it to the client island, which loads the
 * questionnaire, gates it behind a WhatsApp-number confirm, and submits. No
 * session — the token + the number are the credential.
 */
export default async function AnamnesisFillPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-screen justify-center bg-surface-light px-4 py-10">
      <AnamnesisFillIsland token={token ?? ""} />
    </main>
  );
}
