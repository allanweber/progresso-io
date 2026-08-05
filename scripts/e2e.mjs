// Orchestrates the end-to-end suite against a REAL Postgres.
//
// Locally: boots a throwaway PostgreSQL 16 cluster (run as the `postgres`
// system user, since the server refuses to run as root), migrates it, and seeds
// a verified coach. In CI: set DATABASE_URL to a Postgres service and this skips
// the local cluster and uses it directly. Either way it then runs Playwright,
// whose webServer (`next dev`) inherits the env below — notably DATABASE_URL and
// ENABLE_TEST_OUTBOX, which lets the invite→accept test read the emailed link.
//
// Usage: node scripts/e2e.mjs [extra playwright args]
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const PG_BIN = "/usr/lib/postgresql/16/bin";
const PG_ROOT = "/tmp/progresso-e2e-pg";
const PG_DATA = `${PG_ROOT}/data`;
const PG_PORT = 5433;

const usingExternalDb = Boolean(process.env.DATABASE_URL);
let startedLocalPg = false;

function run(command, args, opts = {}) {
  const res = spawnSync(command, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${res.status}`);
  }
}

/** Run a command as the postgres user (the server won't run as root). */
function asPostgres(cmd) {
  run("su", ["postgres", "-c", cmd]);
}

function stopLocalPg() {
  if (!startedLocalPg) return;
  try {
    asPostgres(`${PG_BIN}/pg_ctl -D ${PG_DATA} -w -m immediate stop`);
  } catch {
    /* already stopped */
  }
  try {
    rmSync(PG_ROOT, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  startedLocalPg = false;
}

function startLocalPg() {
  // Fresh cluster each run so state is deterministic.
  if (existsSync(PG_ROOT)) {
    try {
      asPostgres(`${PG_BIN}/pg_ctl -D ${PG_DATA} -w -m immediate stop`);
    } catch {
      /* not running */
    }
    rmSync(PG_ROOT, { recursive: true, force: true });
  }
  run("mkdir", ["-p", `${PG_ROOT}/log`]);
  run("chown", ["-R", "postgres:postgres", PG_ROOT]);

  asPostgres(`${PG_BIN}/initdb -D ${PG_DATA} -U postgres --auth=trust -E UTF8`);
  asPostgres(
    `${PG_BIN}/pg_ctl -D ${PG_DATA} -o '-p ${PG_PORT} -k ${PG_ROOT}' -l ${PG_ROOT}/log/pg.log -w start`,
  );
  asPostgres(`${PG_BIN}/createdb -p ${PG_PORT} -h localhost progresso_e2e`);
  startedLocalPg = true;

  return `postgresql://postgres@localhost:${PG_PORT}/progresso_e2e`;
}

process.on("exit", stopLocalPg);
process.on("SIGINT", () => {
  stopLocalPg();
  process.exit(130);
});

try {
  const databaseUrl = usingExternalDb
    ? process.env.DATABASE_URL
    : startLocalPg();

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
    // No RESEND_API_KEY on purpose: e-mails log to the console + outbox.
  };

  console.info("→ Applying migrations…");
  run("node", ["scripts/migrate.mjs"], { env });

  console.info("→ Seeding a verified coach…");
  run("npx", ["tsx", "src/db/seed.ts"], { env });

  console.info("→ Running Playwright…");
  run("npx", ["playwright", "test", ...process.argv.slice(2)], { env });
} finally {
  stopLocalPg();
}
