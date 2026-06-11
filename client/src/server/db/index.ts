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

// On Cloudflare Workers each isolate gets its own module-level client. The
// driver defaults (pool of 10, no idle timeout, a type-introspection query on
// every new connection) made each isolate open a burst of slow connections and
// hold them indefinitely; under load that overwhelmed the Supabase transaction
// pooler and requests blocked forever, which the Workers runtime kills as a
// "hung" request (Error 1101). Skipping the introspection round-trip
// (`fetch_types: false`) and releasing idle connections (`idle_timeout`) fixes
// the connection storm; a small bounded pool keeps the heaviest pages (which
// issue a few sequential queries per request) from serializing on a single
// connection while staying well under the pooler's client limit.
//
// `prepare: false` is required through a transaction-mode pooler (Supabase
// :6543), which doesn't support prepared statements. All of these are harmless
// on a direct/local Postgres connection.
const conn =
  globalForDb.conn ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    fetch_types: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
  });
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
