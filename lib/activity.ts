const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
];

/** GitHub-style relative time ("3 days ago"), localized to the active
 * next-intl locale. Falls back to "just now" for anything under a minute. */
export function formatRelativeTime(timestamp: string, locale: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    const value = Math.floor(diffMs / ms);
    if (value >= 1) return rtf.format(-value, unit);
  }
  return rtf.format(0, "minute");
}
