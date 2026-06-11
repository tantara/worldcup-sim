export const SUPPORTED_LOCALES = [
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "ja",
  "ko",
  "tr",
  "nl",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "worldcupsim-locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  ja: "日本語",
  ko: "한국어",
  tr: "Türkçe",
  nl: "Nederlands",
};

const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && LOCALE_SET.has(value);
}

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.toLowerCase().split("-")[0];
  return isSupportedLocale(normalized) ? normalized : null;
}

export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;

  const candidates = header
    .split(",")
    .map((part) => {
      const [tag = "", q = "q=1"] = part.trim().split(";");
      const quality = q.trim().startsWith("q=")
        ? Number(q.trim().slice(2))
        : 1;
      return {
        locale: normalizeLocale(tag.trim()),
        quality: Number.isFinite(quality) ? quality : 1,
      };
    })
    .filter((candidate): candidate is { locale: Locale; quality: number } =>
      Boolean(candidate.locale),
    )
    .sort((a, b) => b.quality - a.quality);

  return candidates[0]?.locale ?? DEFAULT_LOCALE;
}
