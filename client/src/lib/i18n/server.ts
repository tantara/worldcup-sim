import "server-only";

import { cookies, headers } from "next/headers";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  normalizeLocale,
  type Locale,
} from "./config";
import { getMessages, translate, type MessageKey } from "./messages";

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  if (cookieLocale) return cookieLocale;

  const headersList = await headers();
  return localeFromAcceptLanguage(headersList.get("accept-language"));
}

export async function getServerTranslations() {
  const locale = await getRequestLocale();
  return {
    locale,
    messages: getMessages(locale),
    t: (key: MessageKey, values?: Record<string, string | number>) =>
      translate(locale, key, values),
  };
}

export function translateError(
  locale: Locale | null | undefined,
  key: MessageKey,
  values?: Record<string, string | number>,
): string {
  return translate(locale ?? DEFAULT_LOCALE, key, values);
}
