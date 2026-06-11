import { relations } from "drizzle-orm";
import { index, pgTableCreator, primaryKey } from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";
import type {
  MatchResult,
  Mode,
  OrchestratorEvent,
} from "~/lib/playground-types";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `worldcupsim_${name}`);

export const posts = createTable(
  "post",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    name: d.varchar({ length: 256 }),
    createdById: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("created_by_idx").on(t.createdById),
    index("name_idx").on(t.name),
  ]
);

export const users = createTable("user", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: d.varchar({ length: 255 }),
  email: d.varchar({ length: 255 }).notNull(),
  emailVerified: d
    .timestamp({
      mode: "date",
      withTimezone: true,
    })
    .$defaultFn(() => /* @__PURE__ */ new Date()),
  image: d.varchar({ length: 255 }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  simulations: many(simulations),
}));

export const accounts = createTable(
  "account",
  (d) => ({
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id),
    type: d.varchar({ length: 255 }).$type<AdapterAccount["type"]>().notNull(),
    provider: d.varchar({ length: 255 }).notNull(),
    providerAccountId: d.varchar({ length: 255 }).notNull(),
    refresh_token: d.text(),
    access_token: d.text(),
    expires_at: d.integer(),
    token_type: d.varchar({ length: 255 }),
    scope: d.varchar({ length: 255 }),
    id_token: d.text(),
    session_state: d.varchar({ length: 255 }),
  }),
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("account_user_id_idx").on(t.userId),
  ]
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessions = createTable(
  "session",
  (d) => ({
    sessionToken: d.varchar({ length: 255 }).notNull().primaryKey(),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id),
    expires: d.timestamp({ mode: "date", withTimezone: true }).notNull(),
  }),
  (t) => [index("t_user_id_idx").on(t.userId)]
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const verificationTokens = createTable(
  "verification_token",
  (d) => ({
    identifier: d.varchar({ length: 255 }).notNull(),
    token: d.varchar({ length: 255 }).notNull(),
    expires: d.timestamp({ mode: "date", withTimezone: true }).notNull(),
  }),
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
);

export const simulations = createTable(
  "simulation",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id),
    matchId: d.integer().notNull(),
    homeId: d.varchar({ length: 128 }).notNull(),
    awayId: d.varchar({ length: 128 }).notNull(),
    mode: d.varchar({ length: 16 }).$type<Mode>().notNull().default("mock"),
    status: d
      .varchar({ length: 32 })
      .$type<"created" | "running" | "completed" | "failed">()
      .notNull()
      .default("created"),
    scoreHome: d.integer().notNull().default(0),
    scoreAway: d.integer().notNull().default(0),
    result: d.jsonb().$type<MatchResult>(),
    error: d.text(),
    archiveKey: d.text(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
    completedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("simulation_user_id_idx").on(t.userId),
    index("simulation_match_id_idx").on(t.matchId),
  ]
);

export const simulationEvents = createTable(
  "simulation_event",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    simulationId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => simulations.id),
    seq: d.integer().notNull(),
    type: d.varchar({ length: 64 }).notNull(),
    payload: d.jsonb().$type<OrchestratorEvent>().notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  }),
  (t) => [
    index("simulation_event_simulation_id_idx").on(t.simulationId),
    index("simulation_event_seq_idx").on(t.simulationId, t.seq),
  ]
);

export const simulationsRelations = relations(simulations, ({ one, many }) => ({
  user: one(users, { fields: [simulations.userId], references: [users.id] }),
  events: many(simulationEvents),
}));

export const simulationEventsRelations = relations(
  simulationEvents,
  ({ one }) => ({
    simulation: one(simulations, {
      fields: [simulationEvents.simulationId],
      references: [simulations.id],
    }),
  })
);
