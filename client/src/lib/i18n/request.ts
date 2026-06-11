import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  normalizeLocale,
  type Locale,
} from "./config";
import { translate, type MessageKey } from "./messages";

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function localeFromRequest(req: Request): Locale {
  return (
    normalizeLocale(cookieValue(req.headers.get("cookie"), LOCALE_COOKIE)) ??
    localeFromAcceptLanguage(req.headers.get("accept-language")) ??
    DEFAULT_LOCALE
  );
}

export function requestTranslator(req: Request, override?: Locale) {
  const locale = override ?? localeFromRequest(req);
  return {
    locale,
    t: (key: MessageKey, values?: Record<string, string | number>) =>
      translate(locale, key, values),
  };
}

export function errorResponse(
  req: Request,
  key: MessageKey,
  status: number,
  override?: Locale,
): Response {
  const { t } = requestTranslator(req, override);
  return Response.json({ error: t(key) }, { status });
}
