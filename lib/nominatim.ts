// Client-side reverse geocoding via our /api/geocode proxy, with a
// sessionStorage cache keyed by "lang:lat,lon" to avoid repeat lookups.

export async function reverseGeocode(
  lat: number,
  lon: number,
  lang: string,
): Promise<string | null> {
  const key = `wce:geo:${lang}:${lat.toFixed(5)},${lon.toFixed(5)}`;

  try {
    const cached = sessionStorage.getItem(key);
    if (cached !== null) return cached || null;
  } catch {
    // sessionStorage may be unavailable; fall through to a network call.
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    lang,
  });
  const res = await fetch(`/api/geocode/reverse?${params}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { name: string | null };

  try {
    sessionStorage.setItem(key, data.name ?? "");
  } catch {
    // ignore quota/availability errors
  }
  return data.name;
}
