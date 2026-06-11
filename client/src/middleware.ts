import { NextResponse, type NextRequest } from "next/server";

import {
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  normalizeLocale,
} from "~/lib/i18n/config";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const existingLocale = normalizeLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  if (!existingLocale) {
    const locale = localeFromAcceptLanguage(
      request.headers.get("accept-language"),
    );
    response.cookies.set(LOCALE_COOKIE, locale, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
