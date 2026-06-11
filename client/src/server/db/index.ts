import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "~/env";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

// `prepare: false` is required through a transaction-mode pooler (Supabase
// :6543), which doesn't support prepared statements; `fetch_types: false` skips
// the type-introspection round-trip on connect. `max: 1` keeps each connection
// to a single socket and `idle_timeout` reaps it shortly after the request that
// opened it goes idle. All are harmless on a direct/local Postgres connection.
const PG_OPTS = {
  prepare: false,
  fetch_types: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 15,
} satisfies Parameters<typeof postgres>[1];

function newDb(): DB {
  return drizzle(postgres(env.DATABASE_URL, PG_OPTS), { schema });
}

// --- development / Node ------------------------------------------------------
// Outside the Workers runtime a socket can live for the whole process, so we
// cache one connection (and avoid exhausting local Postgres across HMR reloads).
const globalForDb = globalThis as unknown as { conn?: postgres.Sql; db?: DB };

function devDb(): DB {
  globalForDb.conn ??= postgres(env.DATABASE_URL, { prepare: false });
  globalForDb.db ??= drizzle(globalForDb.conn, { schema });
  return globalForDb.db;
}

// --- production / Cloudflare Workers -----------------------------------------
// On Workers a TCP socket is bound to the request that opened it; reusing it
// from a later request makes that request hang forever and the runtime kills it
// as "hung" (Error 1101). So we open one connection per request and cache it on
// the request's ExecutionContext (unique per invocation) so every query in the
// same request shares it, then let `idle_timeout` close it afterwards. If no
// request context is available (build-time prerender), fall back to a fresh
// uncached connection.
const reqDbCache = new WeakMap<object, DB>();

function workerDb(): DB {
  let ctxKey: object | undefined;
  try {
    // Throws when there's no active request context (e.g. build-time prerender).
    ctxKey = getCloudflareContext().ctx;
  } catch {
    ctxKey = undefined;
  }
  if (!ctxKey) return newDb();
  let db = reqDbCache.get(ctxKey);
  if (!db) {
    db = newDb();
    reqDbCache.set(ctxKey, db);
  }
  return db;
}

function resolveDb(): DB {
  return env.NODE_ENV === "production" ? workerDb() : devDb();
}

// Exported as a proxy so the connection is resolved per request at query time
// (not bound once at module load). This lets module-load consumers — notably
// the NextAuth Drizzle adapter — capture a stable `db` while each actual query
// runs on the current request's connection.
//
// Properties are returned raw (not bound): drizzle methods are always invoked as
// `db.method()`, so `this` is the proxy and every nested read forwards back to
// the same per-request instance. The `getPrototypeOf` trap is required for the
// adapter's dialect detection — drizzle's `is()` reads
// `Object.getPrototypeOf(db).constructor` (and `db instanceof PgDatabase`), both
// of which must resolve to the real instance's prototype rather than the empty
// proxy target's.
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    return resolveDb()[prop as keyof DB];
  },
  getPrototypeOf() {
    return Object.getPrototypeOf(resolveDb()) as object;
  },
});
