"use server";

import { getCookieStore } from "@/lib/cookies";
import { isLocale, LOCALE_COOKIE, type Locale } from "./config";

// Server action used by the language toggle to persist the chosen locale.
export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) return;
  const store = await getCookieStore();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
}
