import "server-only";

import { env } from "~/env";
import type { Mode } from "~/lib/simulator-types";

/**
 * Mock mode is a local-development convenience only. In production every
 * simulation runs live against the DeepSeek API, regardless of the mode a
 * request asks for — so a crafted body can't dodge the real agent path.
 */
export function resolveMode(requested: Mode): Mode {
  return env.NODE_ENV === "production" ? "live" : requested;
}
