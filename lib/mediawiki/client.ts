// MediaWiki Action API HTTP client shared by every lib/mediawiki/* module:
// upstream rate limiting, response caching, OAuth 2.0 token management and
// CSRF minting. Deliberately framework-free: caching goes through
// lib/serverCache.ts, not Next's fetch cache.

// MediaWiki Action API client. Runs server-side (inside route handlers) so we
// can send a proper User-Agent (Wikimedia requires it) and the OAuth bearer
// token for write calls.
import { upstreamResponseCache } from "@/lib/serverCache";

export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
export const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

// Wikimedia's User-Agent policy asks for a descriptive UA with a way to
// reach the operator (URL + contact) — and treats compliant, authenticated
// clients more leniently in rate-limiting.
export const USER_AGENT =
  "WikimediaCommonsEditor/0.1 (https://github.com/aerdemsenturk/wce; aerdemsenturk@gmail.com)";

export type Params = Record<string, string | number | undefined>;

// --- Rate-limit handling -----------------------------------------------------
//
// Wikimedia rate-limits per IP. Navigating the category tree fires bursts of
// uncached parallel reads (children/parents/cover/grid), which can trip the
// limit and turn every request into a 429. A 429 is rejected before the
// request is processed, so retrying is safe for writes too.

const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_DEFAULT_WAIT_MS = 1_000;
// Don't let a hostile/huge Retry-After pin a route handler for minutes.
const RATE_LIMIT_MAX_WAIT_MS = 5_000;

// Wikimedia's API etiquette asks clients to limit parallelism. One category
// navigation fans out into many upstream calls (children/parents/grid pages/
// preview mosaics); unbounded, that burst is what trips the per-IP throttle.
// Cap concurrent upstream calls and queue the rest — a queued request waits
// for a slot instead of failing.
const MAX_CONCURRENT_UPSTREAM = 4;
let activeUpstream = 0;
const upstreamWaiters: (() => void)[] = [];

async function acquireUpstreamSlot(): Promise<void> {
  if (activeUpstream < MAX_CONCURRENT_UPSTREAM) {
    activeUpstream++;
    return;
  }
  // The releasing call hands its slot straight to the next waiter, so the
  // counter stays as-is when this resolves.
  await new Promise<void>((resolve) => upstreamWaiters.push(resolve));
}

function releaseUpstreamSlot(): void {
  const next = upstreamWaiters.shift();
  if (next) next();
  else activeUpstream--;
}

function retryAfterMs(res: Response): number {
  const header = res.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    const ms = Number.isFinite(seconds)
      ? seconds * 1000
      : new Date(header).getTime() - Date.now();
    if (Number.isFinite(ms) && ms > 0) {
      return Math.min(ms, RATE_LIMIT_MAX_WAIT_MS);
    }
  }
  return RATE_LIMIT_DEFAULT_WAIT_MS;
}

/** `fetch` that respects the concurrency cap, waits out `Retry-After`, and
 * retries on 429 responses. The slot is held through the retry sleeps, which
 * doubles as a global brake while the API is telling us to slow down. */
export async function fetchWithRateLimitRetry(
  input: string | URL,
  init: RequestInit,
): Promise<Response> {
  await acquireUpstreamSlot();
  try {
    let res = await fetch(input, init);
    for (let attempt = 0; res.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs(res)));
      res = await fetch(input, init);
    }
    return res;
  } finally {
    releaseUpstreamSlot();
  }
}

export interface ApiGetOptions {
  /**
   * Skip the response cache entirely. Required for:
   *  - any read-modify-write (the true latest revision is needed, or
   *    MediaWiki's own edit-conflict check using a stale basetimestamp
   *    will misfire);
   *  - category membership/info reads, so a move/rename/create is visible
   *    immediately instead of waiting out the TTL window — those paths are
   *    cached one layer up in upstreamReadCache instead, whose entries the
   *    write paths invalidate per category.
   */
  noStore?: boolean;
}

export async function apiGet(
  base: string,
  params: Params,
  options?: ApiGetOptions,
): Promise<unknown> {
  const url = new URL(base);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const fetchJson = async (): Promise<unknown> => {
    const res = await fetchWithRateLimitRetry(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Api-User-Agent": USER_AGENT,
        ...(await readAuthHeader()),
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`MediaWiki API ${res.status} ${res.statusText}`);
    }
    return res.json();
  };

  // Cache stable, slow-changing upstream responses briefly to be polite to
  // the API; bypass entirely where freshness matters (see ApiGetOptions).
  // The URL carries every parameter (including language), so it is the key;
  // the auth header is process-constant and can't split the key space.
  if (options?.noStore) return fetchJson();
  return upstreamResponseCache.get(url.toString(), fetchJson);
}

// --- OAuth 2.0 access-token management -------------------------------------
//
// Writes authenticate with a Bearer token. Two ways to supply it:
//  - WIKIMEDIA_OAUTH_CLIENT_ID + WIKIMEDIA_OAUTH_CLIENT_SECRET — an owner-only
//    OAuth 2.0 consumer. We mint short-lived access tokens on demand via the
//    client_credentials grant and auto-refresh them before they expire
//    (Wikimedia tokens last ~4h), so the server never needs a hand-pasted
//    token. This is the preferred setup.
//  - WIKIMEDIA_OAUTH_ACCESS_TOKEN — a single pre-issued token, used verbatim.
//    No refresh: it stops working once it expires. Kept as a fallback.
//
// client_id/secret take precedence when both are present.

// Wikimedia's central OAuth 2.0 token endpoint (works for the whole cluster).
const OAUTH_TOKEN_ENDPOINT =
  "https://meta.wikimedia.org/w/rest.php/oauth2/access_token";
// Refresh this far ahead of the real expiry so an in-flight request never
// sends a token that lapses mid-call.
const TOKEN_REFRESH_MARGIN_MS = 60_000;

interface CachedToken {
  token: string;
  /** Epoch ms after which the token should be treated as expired. */
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
// De-dupes concurrent mints so a burst of writes triggers a single request.
let mintInFlight: Promise<CachedToken> | null = null;

function oauthClientCreds(): { id: string; secret: string } | null {
  const id = process.env.WIKIMEDIA_OAUTH_CLIENT_ID;
  const secret = process.env.WIKIMEDIA_OAUTH_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

async function mintAccessToken(creds: {
  id: string;
  secret: string;
}): Promise<CachedToken> {
  const res = await fetch(OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Api-User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.id,
      client_secret: creds.secret,
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
    message?: string;
  } | null;
  if (!res.ok || !data?.access_token) {
    const detail =
      data?.error_description ??
      data?.message ??
      data?.error ??
      `${res.status} ${res.statusText}`;
    throw new Error(`Could not obtain an OAuth access token: ${detail}`);
  }
  // expires_in is seconds (~14400). Fall back to 4h if the server omits it.
  const ttlMs = (data.expires_in ?? 14400) * 1000;
  return { token: data.access_token, expiresAt: Date.now() + ttlMs };
}

/**
 * Resolve a Bearer token for write calls, minting/refreshing it from the
 * client_credentials grant when an owner-only consumer is configured.
 * `forceRefresh` discards any cached token first — used to retry once after
 * an auth failure.
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  const creds = oauthClientCreds();
  if (creds) {
    if (forceRefresh) {
      cachedToken = null;
      mintInFlight = null;
    }
    if (
      cachedToken &&
      cachedToken.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS
    ) {
      return cachedToken.token;
    }
    if (!mintInFlight) {
      mintInFlight = mintAccessToken(creds);
      mintInFlight
        .then((c) => {
          cachedToken = c;
        })
        .catch(() => {})
        .finally(() => {
          mintInFlight = null;
        });
    }
    return (await mintInFlight).token;
  }

  const staticToken = process.env.WIKIMEDIA_OAUTH_ACCESS_TOKEN;
  if (staticToken) return staticToken;

  throw new Error(
    "Wikimedia OAuth is not configured — set WIKIMEDIA_OAUTH_CLIENT_ID and " +
      "WIKIMEDIA_OAUTH_CLIENT_SECRET (or WIKIMEDIA_OAUTH_ACCESS_TOKEN) to enable writes.",
  );
}

/** Whether a failed write can be retried with a freshly-minted token (only
 * the client_credentials path can refresh; a static token can't). */
function canRefreshToken(): boolean {
  return oauthClientCreds() !== null;
}

/**
 * Best-effort Authorization header for read calls. Wikimedia throttles
 * anonymous api.php traffic far more aggressively than OAuth-authenticated
 * traffic (anti-scraping measures), so reads ride the owner token whenever
 * one is configured. A failed mint falls back to anonymous reads instead of
 * breaking the read-only browser.
 */
async function readAuthHeader(): Promise<Record<string, string>> {
  if (!oauthClientCreds() && !process.env.WIKIMEDIA_OAUTH_ACCESS_TOKEN) {
    return {};
  }
  try {
    return { Authorization: `Bearer ${await getAccessToken()}` };
  } catch {
    return {};
  }
}

/**
 * Authenticated POST for write calls (action=edit, tokens, ...). Carries the
 * OAuth 2.0 Bearer token and, when minting from client credentials, retries
 * once with a fresh token if the first attempt is rejected as unauthorized.
 * `token`, when given, is a per-visitor access token (see lib/session.ts)
 * and is used as-is — no owner fallback, no refresh-and-retry, since a 401
 * on it must propagate as a real error rather than silently attributing the
 * write to the owner account instead of the visitor whose session lapsed.
 */
export async function apiPost(base: string, params: Params, token?: string): Promise<unknown> {
  return postWithBearer(base, params, false, token);
}

async function postWithBearer(
  base: string,
  params: Params,
  isRetry: boolean,
  explicitToken?: string,
): Promise<unknown> {
  const token = explicitToken ?? (await getAccessToken(isRetry));

  const body = new URLSearchParams();
  body.set("format", "json");
  body.set("formatversion", "2");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) body.set(key, String(value));
  }

  const res = await fetchWithRateLimitRetry(base, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Api-User-Agent": USER_AGENT,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  // An expired/revoked owner token comes back as 401 — mint a fresh one and
  // retry. Only applies to the implicit owner token; an explicit per-visitor
  // token that 401s falls straight through to the error below.
  if (res.status === 401 && !explicitToken && !isRetry && canRefreshToken()) {
    return postWithBearer(base, params, true);
  }
  if (!res.ok) {
    throw new Error(`MediaWiki API ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * CSRF tokens are per-wiki, not global — a token minted on Commons can't be
 * used to edit Wikidata, even though the OAuth bearer token itself is valid
 * across the whole Wikimedia cluster. Pass WIKIDATA_API when writing there
 * (e.g. wbsetsitelink). `token` must be threaded through to the inner
 * `apiPost` call — otherwise a per-visitor write's CSRF token would be
 * minted under the owner identity instead.
 */
export async function getCsrfToken(base: string = COMMONS_API, token?: string): Promise<string> {
  const data = (await apiPost(
    base,
    {
      action: "query",
      meta: "tokens",
      type: "csrf",
    },
    token,
  )) as { query?: { tokens?: { csrftoken?: string } } };

  const csrfToken = data.query?.tokens?.csrftoken;
  if (!csrfToken) throw new Error("Could not obtain a CSRF token");
  return csrfToken;
}

/**
 * Authenticated GET — same shape as `apiGet`, but attaches the OAuth Bearer
 * token. Used for calls that are read-only against the API but need the
 * token to resolve to "the connected account" (userinfo, usercontribs, the
 * account's own uploads). Never cached: these are dropdown-triggered,
 * low-traffic, and should reflect the latest Commons state rather than
 * `apiGet`'s 5-minute response cache.
 */
export async function apiGetAuthed(base: string, params: Params, explicitToken?: string): Promise<unknown> {
  const token = explicitToken ?? (await getAccessToken());
  const url = new URL(base);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const res = await fetchWithRateLimitRetry(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Api-User-Agent": USER_AGENT,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`MediaWiki API ${res.status} ${res.statusText}`);
  }
  return res.json();
}
