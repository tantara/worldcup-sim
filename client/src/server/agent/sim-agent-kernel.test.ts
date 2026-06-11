import { describe, expect, it } from "vitest";

import {
  cacheHitRate,
  emptyUsage,
  sanitizeToolPairing,
  ToolRegistry,
  type Message,
  type Tool,
} from "@worldcupsim/sim-agent";

const echoTool: Tool = {
  name: "echo",
  description: "Echo a message",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
    required: ["message"],
  },
  async execute(args) {
    return typeof args.message === "string" ? args.message : "";
  },
};

describe("sim-agent kernel helpers", () => {
  it("returns tool execution failures as model-readable error results", async () => {
    const registry = new ToolRegistry([echoTool]);

    await expect(registry.execute("missing", "{}", {})).resolves.toEqual({
      result: 'Error: unknown tool "missing".',
      isError: true,
    });
    await expect(registry.execute("echo", "{", {})).resolves.toEqual({
      result: 'Error: arguments for "echo" were not valid JSON: {',
      isError: true,
    });
    await expect(
      registry.execute("echo", '{"message":"hello"}', {}),
    ).resolves.toEqual({
      result: "hello",
      isError: false,
    });
  });

  it("sanitizes histories into valid assistant/tool pair order", () => {
    const messages: Message[] = [
      { role: "user", content: "run it" },
      { role: "tool", content: "too early", toolCallId: "call_early" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call_early", name: "echo", arguments: "{}" },
          { id: "call_ok", name: "echo", arguments: "{}" },
          { id: "call_missing", name: "echo", arguments: "{}" },
        ],
      },
      { role: "tool", content: "ok", toolCallId: "call_ok" },
      { role: "tool", content: "duplicate", toolCallId: "call_ok" },
      { role: "assistant", content: "done" },
    ];

    expect(sanitizeToolPairing(messages)).toEqual([
      { role: "user", content: "run it" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_ok", name: "echo", arguments: "{}" }],
      },
      { role: "tool", content: "ok", toolCallId: "call_ok" },
      { role: "assistant", content: "done" },
    ]);
  });

  it("computes cache hit rate from usage totals", () => {
    expect(cacheHitRate(emptyUsage())).toBe(0);
    expect(
      cacheHitRate({
        promptTokens: 100,
        completionTokens: 10,
        cacheHitTokens: 75,
        cacheMissTokens: 25,
        reasoningTokens: 0,
      }),
    ).toBe(0.75);
  });
});
