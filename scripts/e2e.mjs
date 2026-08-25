// Orchestrates the end-to-end suite against a REAL Postgres.
//
// Locally: boots a throwaway PostgreSQL 16 container, migrates it, and seeds a
// verified coach. In CI: set DATABASE_URL to a Postgres service and this skips
// the local container and uses it directly. Either way it then runs Playwright,
// whose webServer (the standalone production server) inherits the env below —
// notably DATABASE_URL and ENABLE_TEST_OUTBOX, which lets the invite→accept test
// read the emailed link.
//
// **Docker, not a system cluster.** This used to `initdb` a cluster under /tmp
// and drive it with `su postgres` — which needs PostgreSQL 16 installed at a
// hard-coded path, a `postgres` system user, and root to reach it. On a normal
// developer machine none of those hold and the run died on `su: user postgres
// does not exist` before a single test. A container needs only Docker, pins the
// server version rather than inheriting whatever the host has, and cannot leave
// a half-initialized cluster behind.
//
// The port is deliberately NOT 5432/5438: the throwaway DB must never be
// confused with the dev database, since this script migrates and seeds it.
//
// Usage: node scripts/e2e.mjs [extra playwright args]
import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";

const PG_IMAGE = "postgres:16-alpine";
const PG_CONTAINER = "progresso-e2e-pg";
const PG_PORT = 5439;
const PG_DB = "progresso_e2e";

const usingExternalDb = Boolean(process.env.DATABASE_URL);
let startedLocalPg = false;

function run(command, args, opts = {}) {
  const res = spawnSync(command, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${res.status}`);
  }
}

/** `-fv` so the container's anonymous data volume goes with it. */
function removeContainer() {
  spawnSync("docker", ["rm", "-fv", PG_CONTAINER], { stdio: "ignore" });
}

function stopLocalPg() {
  if (!startedLocalPg) return;
  removeContainer();
  startedLocalPg = false;
}

/** Block the main thread — this script is deliberately synchronous throughout. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function startLocalPg() {
  const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (docker.status !== 0) {
    throw new Error(
      "The e2e suite needs a Postgres. Either start Docker (this script boots a " +
        `throwaway ${PG_IMAGE} on port ${PG_PORT}) or set DATABASE_URL to a ` +
        "Postgres you are happy to have migrated and seeded.",
    );
  }

  // A previous run killed with SIGKILL leaves the container behind; the whole
  // point is a database with no history, so remove it rather than reuse it.
  removeContainer();

  run("docker", [
    "run", "--detach",
    "--name", PG_CONTAINER,
    "--publish", `${PG_PORT}:5432`,
    "--env", "POSTGRES_PASSWORD=postgres",
    "--env", `POSTGRES_DB=${PG_DB}`,
    PG_IMAGE,
  ]);
  startedLocalPg = true;

  // The container is up long before the server accepts connections, and the
  // entrypoint restarts it once mid-init (it runs the bootstrap on a local-only
  // socket first), so a single early `pg_isready` can pass against a server
  // that is about to go away. Poll until it answers over TCP.
  const deadline = 60;
  for (let i = 0; ; i++) {
    const ready = spawnSync("docker", [
      "exec", PG_CONTAINER,
      "pg_isready", "--host=127.0.0.1", "--username=postgres", `--dbname=${PG_DB}`,
    ]);
    if (ready.status === 0) break;
    if (i >= deadline) {
      spawnSync("docker", ["logs", "--tail", "40", PG_CONTAINER], { stdio: "inherit" });
      throw new Error(`Postgres did not become ready within ${deadline}s`);
    }
    sleep(1000);
  }

  return `postgresql://postgres:postgres@localhost:${PG_PORT}/${PG_DB}`;
}

process.on("exit", stopLocalPg);
process.on("SIGINT", () => {
  stopLocalPg();
  process.exit(130);
});

try {
  let databaseUrl = process.env.DATABASE_URL;
  if (usingExternalDb) {
    console.info("→ Using DATABASE_URL from the environment…");
  } else {
    console.info(`→ Booting a throwaway ${PG_IMAGE} on port ${PG_PORT}…`);
    databaseUrl = startLocalPg();
  }

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? "e2e-secret-0123456789abcdefghijkl",
    // Pinned to the Playwright webServer's origin (see playwright.config.ts) so
    // invite links point at the server under test — overriding any inherited
    // value (e.g. CI's global BETTER_AUTH_URL).
    BETTER_AUTH_URL: "http://localhost:3100",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "admin@progresso.io",
    // Capture invite e-mails so the accept flow is drivable end-to-end.
    ENABLE_TEST_OUTBOX: "true",
    // Resend is pinned OFF, and pinning is the whole point: this used to be a
    // bare comment saying "no RESEND_API_KEY on purpose", which was true of the
    // shell and false of the server. The standalone server loads `.env` at
    // runtime, so the developer's real key reached it anyway and every suite run
    // mailed the outside world for real — the contact spec delivered
    // "Contato via site — Maria Teste" to CONTACT_EMAIL on each run, and every
    // invite spec fired a live send at an `@example.com` fixture, which Resend
    // can only hard-bounce. Bounces at that address are charged to the sending
    // domain's reputation, so the cost was never just a noisy inbox.
    //
    // One key covers every template: `email.tsx` builds its Resend client from
    // this variable alone, and each sender falls back to a console log when it
    // is missing. `captureOutbox` runs BEFORE that check, so the outbox the
    // specs read is unaffected.
    //
    // Empty rather than deleted, for the same reason as the two below.
    RESEND_API_KEY: "",
    // The AI generator is pinned OFF, and it has to be pinned rather than
    // merely left unset: the standalone server loads `.env` from the repo at
    // runtime, so a developer's real key reaches the suite even though the
    // shell never exported it. The specs assert the "Nenhum provedor de IA
    // configurado" copy, so an inherited key turns them red — and a green run
    // would be worse, since it would mean e2e was calling a paid provider.
    // Empty beats deleting: `llmEnv()` trims, and `@next/env` only fills in a
    // key that is *absent* from process.env, so "" survives the .env load.
    LLM_API_KEY: "",
    // Turnstile is pinned OFF for the same reason, and it has to be: the widget
    // is a real Cloudflare challenge, and headless Chromium does not solve one.
    // With a developer's keys inherited from `.env`, every genuine contact-form
    // submission is refused while the *honeypot* test still passes — that check
    // short-circuits before Turnstile is consulted — which reads as "the form
    // broke" rather than "the suite grew a dependency on Cloudflare".
    //
    // The site key is inlined at BUILD time, so it must be pinned for the build
    // step too, not just the server. What e2e covers is therefore the
    // unconfigured path; the verifier's own pass/fail/skip behaviour is proven
    // offline in `tests/turnstile.test.ts`.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    TURNSTILE_SECRET_KEY: "",
  };

  console.info("→ Applying migrations…");
  run("node", ["scripts/migrate.mjs"], { env });

  console.info("→ Seeding a verified coach…");
  // Through the package script, not `tsx src/db/seed.ts` directly: the seed
  // reaches `@/server/observability`, which imports `server-only`. That package
  // throws unless the `react-server` export condition is set, so `db:seed`
  // carries `--conditions=react-server` and this must not bypass it.
  run("pnpm", ["run", "db:seed"], { env });

  // Playwright serves a PRODUCTION build, not `next dev` — a dev server
  // compiles each route on its first request, which cost the suite more wall
  // clock than the whole build does. `.next` is incremental, so a rerun with no
  // source changes is cheap. Skip with E2E_SKIP_BUILD=1 when iterating on specs
  // alone.
  //
  // Specifically the STANDALONE server (next.config.ts sets `output:
  // "standalone"`), which is the artifact that actually gets deployed —
  // `next start` refuses to serve a standalone build anyway. Next only traces
  // server files into it, so the static assets and `public/` have to be copied
  // in by hand; that's documented in the self-hosting guide, not automatic.
  if (process.env.E2E_SKIP_BUILD !== "1") {
    console.info("→ Building the app…");
    run("pnpm", ["build"], { env });
    cpSync("public", ".next/standalone/public", { recursive: true });
    cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  }

  console.info("→ Running Playwright…");
  run("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], { env });
} finally {
  stopLocalPg();
}
