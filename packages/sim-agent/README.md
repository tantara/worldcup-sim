# @worldcupsim/sim-agent

A small, **Reasonix-style** LLM agent kernel for TypeScript, tuned to **maximize the provider's prefix (KV) cache**. Provider-neutral, runtime-agnostic (Web `fetch` + streams — runs on Node, Cloudflare Workers, Deno, browser), zero runtime dependencies. DeepSeek-first.

## Why prefix caching

DeepSeek (and OpenAI) cache on the longest matching **token prefix** of a request and bill cached tokens at a fraction of the price. Each session request is `[system, ...history]`, so the cache pays off when:

1. **The prefix is byte-stable** — the system message + tool specs are built once and reused verbatim. No timestamps, ids, or live data in the prefix.
2. **History is append-only** — turns are only ever added at the tail; editing an earlier turn invalidates every cached token below it.
3. **Volatile context rides the tail** — per-turn data (date, standings, plan markers) is appended to the latest *user* message via `composeUserTurn`, never the system prefix.

The kernel enforces all three. `fingerprintPrefix()` lets you assert the prefix never drifted; `cacheHitRate(usage)` shows the payoff per call.

## Usage

```ts
import {
  Agent,
  ToolRegistry,
  createOpenAICompatProvider,
  type Tool,
} from "@worldcupsim/sim-agent";

const provider = createOpenAICompatProvider({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  // baseURL defaults to https://api.deepseek.com, model to deepseek-chat
});

const registry = new ToolRegistry([myTool]);

const agent = new Agent({
  provider,
  registry,
  systemPrompt: "You are ...", // durable, byte-stable
});

// Optionally resume a prior conversation so the cache spans HTTP requests:
// agent.loadHistory(previousMessages);

for await (const event of agent.run("Who would win, Brazil or France?")) {
  if (event.type === "text") process.stdout.write(event.delta);
  if (event.type === "usage") {
    console.log(`\ncache hit ${(event.cacheHitRate * 100).toFixed(0)}%`);
  }
}

// Persist for the next turn (append-only):
const history = agent.messages;
```

## Surface

| Export | Role |
| --- | --- |
| `Agent` | The append-only turn loop; streams `AgentEvent`s. |
| `ToolRegistry` | Holds tools; `toSpecs()` emits a **name-sorted** (deterministic) wire list. |
| `createOpenAICompatProvider` | DeepSeek/OpenAI-compatible streaming provider; normalizes cache hit/miss usage. |
| `composeSystem` / `composeUserTurn` | Build the stable prefix / carry volatile tail context. |
| `fingerprintPrefix` / `cacheHitRate` | Cache diagnostics. |
| `sanitizeToolPairing` | Repair tool-call/result pairing before replaying a history. |

## Defining a tool

```ts
const getTeam: Tool = {
  name: "get_team",
  description: "Look up a national team by id.",
  parameters: {
    type: "object",
    properties: { id: { type: "string", description: "e.g. 'bra'" } },
    required: ["id"],
  },
  async execute(args) {
    return JSON.stringify(lookup(String(args.id)));
  },
};
```

Tools return a string (typically JSON). Throwing is fine — the registry catches it and feeds the error back to the model instead of crashing the loop.
