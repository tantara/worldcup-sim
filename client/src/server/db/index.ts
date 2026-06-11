import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "~/env";
import * as schema from "./schema";

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

// `prepare: false` is required when connecting through a transaction-mode
// connection pooler (e.g. Supabase's pooler on :6543), which doesn't support
// prepared statements. Harmless on a direct/local Postgres connection.
const conn = globalForDb.conn ?? postgres(env.DATABASE_URL, { prepare: false });
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
