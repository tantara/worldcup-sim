import "server-only";

import type { Session } from "next-auth";

import { auth } from "~/server/auth";

export type AuthedUser = Session["user"];

/**
 * Route-handler analog of tRPC's `protectedProcedure`. Resolves the signed-in
 * user, or a ready-to-return 401 `Response` when there is no session.
 *
 * ```ts
 * const gate = await requireUser("Sign in to continue.");
 * if (gate instanceof Response) return gate;
 * const user = gate; // { id, ... }
 * ```
 */
export async function requireUser(
  message = "Sign in to continue.",
): Promise<AuthedUser | Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: message }, { status: 401 });
  }
  return session.user;
}
