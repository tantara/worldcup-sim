import type { Message } from "./types";

/**
 * Prompt assembly — where the KV-cache discipline is enforced.
 *
 * The provider caches on the longest matching **token prefix** of a request.
 * A session's request is always `[system, ...appendOnlyHistory]`, so the cache
 * value is maximized when:
 *
 *   1. The system message is byte-identical on every turn (the "stable prefix").
 *   2. History only ever grows at the tail; earlier turns are never edited.
 *
 * The enemy is *volatile* content in the prefix — a timestamp, a random id, a
 * "current standings" block — because changing one byte high up invalidates
 * every cached token below it. So anything that changes per turn must ride the
 * **tail** of the latest user message, never the system prefix. `composeSystem`
 * builds the frozen prefix; `composeUserTurn` carries the volatile context.
 */

export interface SystemPromptParts {
  /** Durable agent instructions. Must not contain per-turn/volatile content. */
  base: string;
  /**
   * Durable project facts (the "memory" file). Folded into the prefix once so
   * it caches with everything else. Optional.
   */
  memory?: string;
}

const MEMORY_OPEN = "<project-memory>";
const MEMORY_CLOSE = "</project-memory>";

/** Build the stable system message. Call once per session and reuse verbatim. */
export function composeSystem(parts: SystemPromptParts): Message {
  let content = parts.base.trimEnd();
  const memory = parts.memory?.trim();
  if (memory) {
    content += `\n\n${MEMORY_OPEN}\n${memory}\n${MEMORY_CLOSE}`;
  }
  return { role: "system", content };
}

export interface TurnContext {
  /**
   * Volatile, turn-local context (current date, live standings, a plan-mode
   * marker, recent background-job results). Injected at the *tail* of this user
   * turn so it never disturbs the cached prefix. Optional.
   */
  ephemeral?: string;
}

const CTX_OPEN = "<context>";
const CTX_CLOSE = "</context>";

/**
 * Compose a user message. Volatile context is wrapped and placed *after* the
 * user's text — at the very tail of the request — so the entire prefix above it
 * (system + all prior turns) stays cache-stable.
 */
export function composeUserTurn(input: string, ctx?: TurnContext): Message {
  const ephemeral = ctx?.ephemeral?.trim();
  const content = ephemeral
    ? `${input}\n\n${CTX_OPEN}\n${ephemeral}\n${CTX_CLOSE}`
    : input;
  return { role: "user", content };
}
