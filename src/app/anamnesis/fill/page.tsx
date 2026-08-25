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
 *
 * This is an **aluno** surface, so it carries the aluno posture, not the
 * coach's: the Aluno Ground (`#eef1f5`) rather than the coach's Cool Ground,
 * and `.posture-reading`, which lifts the reading rungs one step for a phone
 * held at arm's length. It was the one aluno-facing page still rendering at
 * desk density on the coach's ground.
 */
export default async function AnamnesisFillPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="posture-reading min-h-screen bg-ground-aluno">
      <AnamnesisFillIsland token={token ?? ""} />
    </main>
  );
}
