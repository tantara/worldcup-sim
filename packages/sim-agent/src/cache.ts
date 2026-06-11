import type { Message, ToolSpec, Usage } from "./types";

/**
 * Cache diagnostics.
 *
 * The prefix "shape" is the part of every request that must stay byte-stable for
 * the provider's prefix cache to hit: the system message plus the tool specs.
 * `fingerprintPrefix` hashes exactly those bytes so a caller can assert the
 * prefix never drifted within a session — if the fingerprint changes mid-session
 * the cache was silently busted and every turn pays full price.
 */
export function fingerprintPrefix(system: Message, tools: ToolSpec[]): string {
  // Same serialization the provider uses, so the hash tracks the real bytes.
  const canonical = JSON.stringify({
    system: system.content,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  });
  return fnv1a(canonical);
}

/** Fraction of prompt tokens served from cache this call (0..1). */
export function cacheHitRate(usage: Usage): number {
  if (usage.promptTokens <= 0) return 0;
  return usage.cacheHitTokens / usage.promptTokens;
}

/** 32-bit FNV-1a, hex-encoded. Cheap, dependency-free, stable across runtimes. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619, kept in 32-bit range via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
