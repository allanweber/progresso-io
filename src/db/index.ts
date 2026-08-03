import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Single shared postgres connection + Drizzle client.
 * Reused across hot reloads in development to avoid exhausting connections.
 */
const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgres> | undefined;
};

const connectionString = process.env.DATABASE_URL;

const client =
  globalForDb.client ??
  (connectionString ? postgres(connectionString) : undefined);

if (process.env.NODE_ENV !== "production" && client) {
  globalForDb.client = client;
}

if (!client) {
  // Fail loudly only when the DB is actually used, not at import time,
  // so the marketing pages can build/run without a database.
  console.warn("DATABASE_URL is not set — database features are disabled.");
}

export const db = client
  ? drizzle(client, { schema, casing: "snake_case" })
  : (undefined as unknown as ReturnType<typeof drizzle>);

export { schema };
