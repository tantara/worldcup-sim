import "server-only";

import { env } from "~/env";
import { requestTranslator } from "~/lib/i18n/request";

export const ADMIN_SECRET_HEADER = "x-admin-secret";

/** Length-independent constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  let mismatch = a.length === b.length ? 0 : 1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Guards the admin-only / server-to-server simulation endpoints with the shared
 * `ADMIN_TRIGGER_SECRET`. Returns a ready-to-send `Response` when the secret is
 * unconfigured (503) or the request's `x-admin-secret` header is missing/wrong
 * (403); returns `null` when the request is authorized.
 */
export function checkAdminSecret(req: Request): Response | null {
  const { t } = requestTranslator(req);
  const secret = env.ADMIN_TRIGGER_SECRET;
  if (!secret) {
    return Response.json(
      { error: t("api.errors.adminNotConfigured") },
      { status: 503 },
    );
  }
  const provided = req.headers.get(ADMIN_SECRET_HEADER);
  if (!provided || !safeEqual(provided, secret)) {
    return Response.json({ error: t("api.errors.forbidden") }, { status: 403 });
  }
  return null;
}
