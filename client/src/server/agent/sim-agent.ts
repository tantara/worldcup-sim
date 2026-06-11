import "server-only";

import {
  Agent,
  ToolRegistry,
  createOpenAICompatProvider,
} from "@worldcupsim/sim-agent";
import { env } from "~/env";
import { DEFAULT_LOCALE, type Locale } from "~/lib/i18n/config";
import { translate } from "~/lib/i18n/messages";
import { TEAMS } from "~/lib/teams";
import { worldCupTools } from "./tools";

/**
 * Durable, byte-stable system prompt — the cached prefix head. It must not
 * contain anything volatile (no dates, ids, live state). The team roster below
 * IS durable project data, so it's safe to fold in and it lets the model skip a
 * `list_teams` round-trip for the common case.
 */
const SYSTEM_PROMPT = `You are the World Cup Simulation Assistant for an interactive soccer sim.

You help users explore hypothetical matches and tournaments between national teams. When a user asks who would win, or to run a match, USE the tools — never invent a scoreline. Report the final score and narrate the key moments (goals, cards) from the returned events. Outcomes are stochastic; if asked "what usually happens", simulate the fixture a few times and summarize the spread.

Be concise and concrete. Refer to teams by name and flag. Do not claim real-world results — everything here is simulated.`;

/**
 * Project memory folded into the prefix once (stays cache-stable across the
 * whole session). Built deterministically from the static team list.
 */
const TEAM_MEMORY = [
  "Available teams (id — name, rating):",
  ...TEAMS.map((t) => `- ${t.id} — ${t.name} ${t.flag} (${t.rating})`),
].join("\n");

/**
 * Build a fresh agent. Stateless per request: the caller restores prior history
 * via `agent.loadHistory(...)` so the provider's prefix cache spans requests.
 *
 * `sessionId` is the conversation's stable id, generated client-side once per
 * chat (a uuid) and replayed on every turn. It becomes the provider `user_id`
 * (`${sessionId}:assistant`), pinning the conversation to one DeepSeek KVCache
 * partition so the warm prefix actually survives across separate HTTP requests.
 *
 * Throws if the LLM key is unset — the route turns that into a 503.
 */
export function createSimAgent(
  sessionId?: string,
  locale: Locale = DEFAULT_LOCALE,
): Agent {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Add it to .env to use the sim-agent.",
    );
  }

  const provider = createOpenAICompatProvider({
    apiKey: env.DEEPSEEK_API_KEY,
    baseURL: env.DEEPSEEK_BASE_URL,
    model: env.DEEPSEEK_MODEL,
    userId: sessionId ? `${sessionId}:assistant` : undefined,
  });

  return new Agent({
    provider,
    registry: new ToolRegistry(worldCupTools),
    systemPrompt: `${SYSTEM_PROMPT}\n\n${translate(locale, "agent.localeInstruction")}`,
    memory: TEAM_MEMORY,
    temperature: 0.7,
  });
}
