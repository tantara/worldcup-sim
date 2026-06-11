import type { Tool, ToolContext, ToolSpec } from "./types";

/**
 * Holds the agent's tools and runs them.
 *
 * `toSpecs()` returns the wire-facing tool list **sorted by name**. That sort is
 * deliberate: the tool array is part of the cached prefix, so its serialization
 * must be deterministic regardless of registration order or process. Two
 * processes with the same tools must emit byte-identical `tools` JSON or they
 * won't share cache.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(tools: Iterable<Tool> = []) {
    for (const t of tools) this.register(t);
  }

  register(tool: Tool): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get size(): number {
    return this.tools.size;
  }

  /** Wire specs, name-sorted for a stable, cacheable prefix. */
  toSpecs(): ToolSpec[] {
    return [...this.tools.values()]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
  }

  /**
   * Execute a tool by name with a raw JSON argument string (as the model emits
   * it). Errors are caught and returned as a string with `isError: true`, never
   * thrown — a failed tool is feedback for the model, not a crash for the loop.
   */
  async execute(
    name: string,
    argumentsJSON: string,
    ctx: ToolContext,
  ): Promise<{ result: string; isError: boolean }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { result: `Error: unknown tool "${name}".`, isError: true };
    }
    let args: Record<string, unknown>;
    try {
      const trimmed = argumentsJSON.trim();
      args = trimmed === "" ? {} : (JSON.parse(trimmed) as Record<string, unknown>);
    } catch {
      return {
        result: `Error: arguments for "${name}" were not valid JSON: ${argumentsJSON}`,
        isError: true,
      };
    }
    try {
      const result = await tool.execute(args, ctx);
      return { result, isError: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { result: `Error: ${message}`, isError: true };
    }
  }
}
