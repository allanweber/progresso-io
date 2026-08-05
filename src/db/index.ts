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
  (connectionString
    ? postgres(connectionString, {
        // Resilience for a long-lived pool. Without these, a query that lands
        // on a dead socket — e.g. after the database is restarted or recreated
        // under a running server — hangs indefinitely instead of failing. With
        // them the pool self-heals: connections fail fast, idle ones are
        // dropped, and every connection is recycled periodically.
        connect_timeout: 10, // seconds to establish a connection, then error
        idle_timeout: 20, // close a connection left idle this long
        max_lifetime: 60 * 30, // recycle any connection after 30 minutes
      })
    : undefined);

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

/** The Drizzle client type — accepted by the Data Access Layer. */
export type DB = typeof db;

export { schema };
