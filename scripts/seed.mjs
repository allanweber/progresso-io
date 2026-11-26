import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["scripts/migrate.mjs"]);
run("pnpm", ["exec", "tsx", "--conditions=react-server", "src/db/seed.ts"]);
