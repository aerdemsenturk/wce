import { getRequestConfig } from "next-intl/server";
import { getCookieStore } from "@/lib/cookies";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

// next-intl WITHOUT i18n routing: the active locale comes from a cookie,
// so there is no `[locale]` segment in the URL.
export default getRequestConfig(async () => {
  const store = await getCookieStore();
  const cookieLocale = store.get(LOCALE_COOKIE);
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
