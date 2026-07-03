import type {
  ActivityItem,
  CategoryChildren,
  CategoryFile,
  CategoryFileInfo,
  CategoryWikidata,
  Coordinates,
  Depict,
  FileDetail,
  FileStatus,
  Subcategory,
  UserProfile,
  WikidataItemStatements,
  WikidataPropertyStatements,
} from "./types";
import { stripCategoryPrefix, withCategoryPrefix } from "./category";
import { defaultLocale } from "@/i18n/config";
import { CURATED_PROPERTIES } from "./wikidataProperties";
import {
  parseInformation,
  stripHtml,
  withUpdatedDescription,
  withUpdatedLocation,
  withRemovedLocation,
  withMovedCategory,
  withRemovedCategory,
  withAddedCategory,
  withDeletionNomination,
  buildDeletionRequestSubpage,
  buildUploaderNotice,
  buildNewCategoryWikitext,
  parseWikidataQid,
} from "./wikitext";

export { stripCategoryPrefix, withCategoryPrefix };

// MediaWiki Action API client. Runs server-side (inside route handlers) so we
// can send a proper User-Agent (Wikimedia requires it) and the OAuth bearer
// token for write calls.
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

const USER_AGENT =
  "WikimediaCommonsEditor/0.1 (https://github.com/; read-only browser)";

type Params = Record<string, string | number | undefined>;

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
async function fetchWithRateLimitRetry(
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

interface ApiGetOptions {
  /**
   * Skip Next's fetch cache entirely. Required for:
   *  - any read-modify-write (the true latest revision is needed, or
   *    MediaWiki's own edit-conflict check using a stale basetimestamp
   *    will misfire);
   *  - category membership/info reads, so a move/rename/create is visible
   *    immediately instead of waiting out the revalidate window. Next 16's
   *    on-demand revalidateTag() is stale-while-revalidate (still serves one
   *    stale response after invalidation) and its instant variant,
   *    updateTag(), only works inside Server Actions — neither fits a
   *    Route Handler that needs the *next* read to be guaranteed fresh.
   */
  noStore?: boolean;
}

async function apiGet(
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

  const res = await fetchWithRateLimitRetry(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Api-User-Agent": USER_AGENT,
      ...(await readAuthHeader()),
    },
    // Cache stable, slow-changing upstream responses briefly to be polite to
    // the API; bypass entirely where freshness matters (see ApiGetOptions).
    cache: options?.noStore ? "no-store" : undefined,
    next: options?.noStore ? undefined : { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`MediaWiki API ${res.status} ${res.statusText}`);
  }
  return res.json();
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
async function getAccessToken(forceRefresh = false): Promise<string> {
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
async function apiPost(base: string, params: Params, token?: string): Promise<unknown> {
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
async function getCsrfToken(base: string = COMMONS_API, token?: string): Promise<string> {
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
 * account's own uploads). Always bypasses the fetch cache: these are
 * dropdown-triggered, low-traffic, and should reflect the latest Commons
 * state rather than `apiGet`'s 5-minute revalidate window.
 */
async function apiGetAuthed(base: string, params: Params, explicitToken?: string): Promise<unknown> {
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

// --- Connected account: profile, activity history, uploads -----------------
//
// With no `token` (the owner-only fallback), there's exactly one account to
// resolve, so the username is cached for the life of the server process
// instead of being re-fetched on every activity/uploads call. A per-visitor
// `token` always re-resolves — caching it under the same module-level
// variable would leak one visitor's username into another's request.

let cachedUsername: string | null = null;

/** The OAuth-connected Commons account's profile (editcount, registration). */
async function getCurrentUser(token?: string): Promise<UserProfile> {
  const data = (await apiGetAuthed(
    COMMONS_API,
    {
      action: "query",
      meta: "userinfo",
      uiprop: "editcount|registrationdate",
    },
    token,
  )) as {
    query?: {
      userinfo?: {
        name?: string;
        editcount?: number;
        registrationdate?: string | null;
      };
    };
  };
  const info = data.query?.userinfo;
  if (!info?.name) throw new Error("Could not resolve the connected account");
  if (!token) cachedUsername = info.name;
  return {
    username: info.name,
    editCount: info.editcount ?? 0,
    registrationDate: info.registrationdate ?? null,
    profileUrl: `https://commons.wikimedia.org/wiki/User:${encodeURIComponent(info.name)}`,
  };
}

async function resolveUsername(token?: string): Promise<string> {
  if (!token && cachedUsername) return cachedUsername;
  return (await getCurrentUser(token)).username;
}

interface UserContrib {
  revid: number;
  title: string;
  ns: number;
  timestamp: string;
  comment?: string | null;
  new?: boolean;
  newlen?: number;
  oldlen?: number;
}

/** The connected account's real Commons contribution history. */
async function getUserActivity(
  continueToken?: string,
  limit = 30,
  token?: string,
): Promise<{ items: ActivityItem[]; continueToken: string | null }> {
  const username = await resolveUsername(token);
  const data = (await apiGetAuthed(
    COMMONS_API,
    {
      action: "query",
      list: "usercontribs",
      ucuser: username,
      uclimit: limit,
      ucprop: "title|timestamp|comment|sizediff|flags|ids",
      uccontinue: continueToken,
    },
    token,
  )) as {
    query?: { usercontribs?: UserContrib[] };
    continue?: { uccontinue?: string };
  };

  const items: ActivityItem[] = (data.query?.usercontribs ?? []).map((c) => ({
    id: String(c.revid),
    title: c.title,
    ns: c.ns,
    timestamp: c.timestamp,
    comment: c.comment?.trim() || null,
    isNew: Boolean(c.new),
    sizeDiff:
      typeof c.newlen === "number" && typeof c.oldlen === "number"
        ? c.newlen - c.oldlen
        : null,
    pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(c.title).replace(/%2F/g, "/")}`,
  }));

  return { items, continueToken: data.continue?.uccontinue ?? null };
}

/** Every file `username` has uploaded to Commons (global, not scoped to any
 * one category), in the same `CategoryFileInfo` shape as a category grid —
 * lets the uploads/profile views reuse `FileCard` and the file detail panel
 * unchanged. Uses `generator=allimages` + `prop=imageinfo` rather than
 * `list=allimages` directly — that list module has no width param of its
 * own (`aiurlwidth` is silently ignored), so it can only ever return the
 * full-resolution original; only the generator+imageinfo combination
 * accepts `iiurlwidth` and gives back a real thumbnail. */
async function getUploadsForUsername(
  username: string,
  continueToken: string | undefined,
  limit: number,
  lang: string,
  fetchPage: (params: Params) => Promise<unknown>,
): Promise<{ items: CategoryFileInfo[]; continueToken: string | null }> {
  const data = (await fetchPage({
    action: "query",
    generator: "allimages",
    gaiuser: username,
    gaisort: "timestamp",
    gaidir: "older",
    gailimit: limit,
    gaicontinue: continueToken,
    ...IMAGEINFO_PROPS,
    iiextmetadatalanguage: lang,
  })) as {
    query?: { pages?: ImageInfoPage[] };
    continue?: { gaicontinue?: string };
  };
  const items = (data.query?.pages ?? []).map(toCategoryFileInfo);
  return { items, continueToken: data.continue?.gaicontinue ?? null };
}

async function getUserUploads(
  continueToken?: string,
  limit = 30,
  token?: string,
  lang = defaultLocale,
): Promise<{ items: CategoryFileInfo[]; continueToken: string | null }> {
  const username = await resolveUsername(token);
  return getUploadsForUsername(username, continueToken, limit, lang, (params) =>
    apiGetAuthed(COMMONS_API, params, token),
  );
}

/** Every file an arbitrary account has uploaded to Commons — no login
 * required, for the user-profile view reached from the header search. */
export async function getPublicUserUploads(
  username: string,
  continueToken?: string,
  limit = 30,
  lang = defaultLocale,
): Promise<{ items: CategoryFileInfo[]; continueToken: string | null }> {
  return getUploadsForUsername(username, continueToken, limit, lang, (params) =>
    apiGet(COMMONS_API, params),
  );
}

export { getCurrentUser, getUserActivity, getUserUploads };

interface AllUsersEntry {
  name: string;
  editcount?: number;
}

/** Instant-search Commons accounts by username prefix, for the header's
 * combined category/user search. Unauthenticated — works for any account,
 * not just the connected one. */
export async function searchUsers(
  query: string,
): Promise<{ username: string; editCount: number | null }[]> {
  const data = (await apiGet(COMMONS_API, {
    action: "query",
    list: "allusers",
    auprefix: query,
    aulimit: 8,
    auprop: "editcount",
  })) as { query?: { allusers?: AllUsersEntry[] } };

  return (data.query?.allusers ?? []).map((u) => ({
    username: u.name,
    editCount: u.editcount ?? null,
  }));
}

interface UsersQueryEntry {
  name?: string;
  editcount?: number;
  registration?: string | null;
  missing?: string;
}

/** Public profile for an arbitrary Commons account (no login required),
 * for the user-profile view reached from the header search. */
export async function getPublicUserProfile(username: string): Promise<UserProfile> {
  const data = (await apiGet(COMMONS_API, {
    action: "query",
    list: "users",
    ususers: username,
    usprop: "editcount|registration",
  })) as { query?: { users?: UsersQueryEntry[] } };

  const info = data.query?.users?.[0];
  if (!info?.name || info.missing !== undefined) {
    throw new Error("User not found");
  }
  return {
    username: info.name,
    editCount: info.editcount ?? 0,
    registrationDate: info.registration ?? null,
    profileUrl: `https://commons.wikimedia.org/wiki/User:${encodeURIComponent(info.name)}`,
  };
}

interface CategoryMember {
  pageid: number;
  title: string;
  timestamp?: string;
}

interface CategoryInfo {
  files?: number;
  subcats?: number;
  wikibaseItem?: string;
}

interface QueryPage {
  title: string;
  missing?: boolean;
  categoryinfo?: CategoryInfo;
  pageprops?: { wikibase_item?: string };
}

/**
 * Run a paginated `generator=...` query and collect each returned page's
 * categoryinfo (file/subcat counts) + Wikidata item. The generator delivers
 * the category listing and its per-page info in one request, replacing the
 * previous list-titles-then-batch-info round trips. Prop data can arrive
 * split across continuation batches, so pages are merged by title.
 */
async function collectCategoryInfoPages(
  params: Params,
): Promise<Map<string, CategoryInfo>> {
  const result = new Map<string, CategoryInfo>();
  let cont: Record<string, string> | undefined;

  do {
    const data = (await apiGet(
      COMMONS_API,
      {
        action: "query",
        prop: "categoryinfo|pageprops",
        ppprop: "wikibase_item",
        ...params,
        ...(cont ?? {}),
      },
      { noStore: true },
    )) as {
      query?: { pages?: QueryPage[] };
      continue?: Record<string, string>;
    };

    for (const page of data.query?.pages ?? []) {
      const existing = result.get(page.title);
      result.set(page.title, {
        ...existing,
        ...page.categoryinfo,
        wikibaseItem: page.pageprops?.wikibase_item ?? existing?.wikibaseItem,
      });
    }
    cont = data.continue;
  } while (cont);

  return result;
}

/** Resolve Wikidata labels for a collected info map and shape it into the
 * sorted `Subcategory[]` both the children and parents listings return. */
async function subcategoriesFromInfo(
  infoMap: Map<string, CategoryInfo>,
  lang: string,
): Promise<Subcategory[]> {
  const qids = [
    ...new Set(
      [...infoMap.values()]
        .map((info) => info.wikibaseItem)
        .filter((id): id is string => id != null),
    ),
  ];
  const labels = await fetchWikidataLabels(qids, lang);

  return [...infoMap.entries()]
    .map(([title, info]) => {
      const qid = info.wikibaseItem ?? null;
      return {
        title,
        name: stripCategoryPrefix(title),
        files: info.files ?? null,
        subcats: info.subcats ?? null,
        wikidata: qid ? { id: qid, label: labels.get(qid) ?? null } : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Wikidata item + file count for a single category. */
async function fetchCategoryMeta(category: string): Promise<{
  files: number | null;
  wikibaseItem: string | null;
}> {
  const data = (await apiGet(
    COMMONS_API,
    {
      action: "query",
      titles: withCategoryPrefix(category),
      prop: "categoryinfo|pageprops",
      ppprop: "wikibase_item",
    },
    { noStore: true },
  )) as { query?: { pages?: QueryPage[] } };

  const page = data.query?.pages?.[0];
  return {
    files: page?.categoryinfo?.files ?? null,
    wikibaseItem: page?.pageprops?.wikibase_item ?? null,
  };
}

/** Resolve a Wikidata item's label, preferring the requested language. */
async function fetchWikidataLabelAndDescription(
  qid: string,
  lang: string,
): Promise<{ label: string | null; description: string | null }> {
  const data = (await apiGet(WIKIDATA_API, {
    action: "wbgetentities",
    ids: qid,
    props: "labels|descriptions",
    languages: `${lang}|en`,
  })) as {
    entities?: Record<
      string,
      {
        labels?: Record<string, { value: string }>;
        descriptions?: Record<string, { value: string }>;
      }
    >;
  };

  const entity = data.entities?.[qid];
  const labels = entity?.labels;
  const descriptions = entity?.descriptions;
  return {
    label: labels?.[lang]?.value ?? labels?.en?.value ?? null,
    description: descriptions?.[lang]?.value ?? descriptions?.en?.value ?? null,
  };
}

/** Batch-resolve Wikidata labels (up to 50 ids per request). */
async function fetchWikidataLabels(
  ids: string[],
  lang: string,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = (await apiGet(WIKIDATA_API, {
      action: "wbgetentities",
      ids: batch.join("|"),
      props: "labels",
      languages: `${lang}|en`,
    })) as {
      entities?: Record<
        string,
        { labels?: Record<string, { value: string }> }
      >;
    };
    for (const id of batch) {
      const labels = data.entities?.[id]?.labels;
      out.set(id, labels?.[lang]?.value ?? labels?.en?.value ?? null);
    }
  }
  return out;
}

interface DepictSnak {
  snaktype?: string;
  datavalue?: { value?: { id?: string } };
}
interface DepictStatement {
  id?: string; // claim GUID
  mainsnak?: DepictSnak;
  rank?: string;
}

/** Read depicts (P180) statements from a file's Structured Data (M-id). */
async function getDepicts(pageid: number, lang: string): Promise<Depict[]> {
  const mid = `M${pageid}`;
  const data = (await apiGet(COMMONS_API, {
    action: "wbgetentities",
    ids: mid,
    props: "claims",
  })) as {
    entities?: Record<
      string,
      {
        statements?: Record<string, DepictStatement[]>;
        claims?: Record<string, DepictStatement[]>;
      }
    >;
  };

  const entity = data.entities?.[mid];
  const statements = entity?.statements ?? entity?.claims;
  const p180 = statements?.P180 ?? [];

  const entries: { id: string; statementId: string }[] = [];
  for (const st of p180) {
    if (st.mainsnak?.snaktype !== "value") continue;
    const id = st.mainsnak.datavalue?.value?.id;
    if (id && st.id && !entries.some((e) => e.id === id)) {
      entries.push({ id, statementId: st.id });
    }
  }
  if (entries.length === 0) return [];

  const labels = await fetchWikidataLabels(entries.map((e) => e.id), lang);
  return entries.map((e) => ({
    id: e.id,
    label: labels.get(e.id) ?? null,
    statementId: e.statementId,
  }));
}

/** Add a P180 (depicts) claim to a file's Structured Data (M-id). */
export async function addDepict(
  pageid: number,
  qid: string,
  token?: string,
): Promise<{ statementId: string }> {
  const csrf = await getCsrfToken(COMMONS_API, token);
  const value = JSON.stringify({
    "entity-type": "item",
    "numeric-id": Number(qid.slice(1)),
    id: qid,
  });
  const data = (await apiPost(
    COMMONS_API,
    {
      action: "wbcreateclaim",
      entity: `M${pageid}`,
      property: "P180",
      snaktype: "value",
      value,
      token: csrf,
    },
    token,
  )) as { error?: { code?: string; info?: string }; claim?: { id?: string } };

  if (data.error) {
    console.error("addDepict wbcreateclaim error:", JSON.stringify(data.error));
    throw new Error(data.error.info ?? data.error.code ?? "Could not add depicts statement");
  }
  const statementId = data.claim?.id;
  if (!statementId) throw new Error("Could not add depicts statement");
  return { statementId };
}

/** Remove a depicts (or any) Wikibase claim by its statement GUID. */
export async function removeDepict(statementId: string, token?: string): Promise<void> {
  const csrf = await getCsrfToken(COMMONS_API, token);
  const data = (await apiPost(
    COMMONS_API,
    {
      action: "wbremoveclaims",
      claim: statementId,
      token: csrf,
    },
    token,
  )) as { error?: { code?: string; info?: string } };

  if (data.error) {
    throw new Error(data.error.info ?? data.error.code ?? "Could not remove depicts statement");
  }
}

/** Search Wikidata items by label, for the add-depict autocomplete. */
export async function searchWikidataItems(
  query: string,
  lang: string,
): Promise<{ id: string; label: string; description: string | null }[]> {
  const data = (await apiGet(WIKIDATA_API, {
    action: "wbsearchentities",
    search: query,
    language: lang,
    type: "item",
    limit: 8,
  })) as {
    search?: { id: string; label?: string; description?: string }[];
  };

  return (data.search ?? []).map((r) => ({
    id: r.id,
    label: r.label ?? r.id,
    description: r.description ?? null,
  }));
}

// --- Wikidata item quick-edit (curated category statements) ----------------

interface WikibaseSnak {
  snaktype?: string;
  datatype?: string;
  datavalue?: { type?: string; value?: unknown };
}
interface WikibaseStatement {
  id?: string;
  mainsnak?: WikibaseSnak;
}

/** Format a single year-month-day out of a Wikidata time value, honoring its
 * precision (year / month / day) so we don't show a fake "00" month or day. */
function formatWikidataTime(value: { time?: string; precision?: number }): string | null {
  const time = value.time;
  if (!time) return null;
  const sign = time.startsWith("-") ? "-" : "";
  const [datePart] = time.replace(/^[+-]/, "").split("T");
  const [y, m, d] = datePart.split("-");
  const precision = value.precision ?? 11;
  if (precision >= 11) return `${sign}${y}-${m}-${d}`;
  if (precision === 10) return `${sign}${y}-${m}`;
  return `${sign}${Number(y)}`; // year (or coarser — we still show the year)
}

/** Reduce one statement's main snak to a display shape. Item values defer label
 * resolution (itemId only); other datatypes are formatted to a string now. */
function parseStatementSnak(
  snak: WikibaseSnak,
): { kind: "item" | "other"; itemId: string | null; display: string | null } | null {
  const dv = snak.datavalue;
  if (!dv) return null;
  switch (dv.type) {
    case "wikibase-entityid": {
      const id = (dv.value as { id?: string } | undefined)?.id ?? null;
      return id ? { kind: "item", itemId: id, display: null } : null;
    }
    case "globecoordinate": {
      const v = dv.value as { latitude?: number; longitude?: number } | undefined;
      if (typeof v?.latitude !== "number" || typeof v?.longitude !== "number") return null;
      const round = (n: number) => Math.round(n * 1e5) / 1e5;
      return { kind: "other", itemId: null, display: `${round(v.latitude)}, ${round(v.longitude)}` };
    }
    case "time": {
      const display = formatWikidataTime(dv.value as { time?: string; precision?: number });
      return display ? { kind: "other", itemId: null, display } : null;
    }
    case "monolingualtext": {
      const text = (dv.value as { text?: string } | undefined)?.text ?? null;
      return text ? { kind: "other", itemId: null, display: text } : null;
    }
    case "quantity": {
      const amount = (dv.value as { amount?: string } | undefined)?.amount;
      return amount ? { kind: "other", itemId: null, display: amount.replace(/^\+/, "") } : null;
    }
    case "string": {
      return typeof dv.value === "string"
        ? { kind: "other", itemId: null, display: dv.value }
        : null;
    }
    default:
      return null;
  }
}

/** Read the curated set of statements off a category's Wikidata item, in the
 * fixed curated order. Item values come back with resolved labels; other
 * datatypes (coordinate/time/string/...) as a formatted display string. */
export async function getWikidataItemStatements(
  qid: string,
  lang: string,
): Promise<WikidataItemStatements> {
  // Bypass the fetch cache: this is read so the quick-edit panel can show the
  // item's current statements, including ones WCE just published. The default
  // 5-minute revalidate window would otherwise serve the pre-edit claims back
  // right after a publish.
  const data = (await apiGet(
    WIKIDATA_API,
    {
      action: "wbgetentities",
      ids: qid,
      props: "claims",
    },
    { noStore: true },
  )) as { entities?: Record<string, { claims?: Record<string, WikibaseStatement[]> }> };

  const claims = data.entities?.[qid]?.claims ?? {};

  const itemIds = new Set<string>();
  const raw: {
    property: string;
    values: { statementId: string; kind: "item" | "other"; itemId: string | null; display: string | null }[];
  }[] = [];

  for (const def of CURATED_PROPERTIES) {
    const statements = claims[def.id];
    if (!statements?.length) continue;
    const values: typeof raw[number]["values"] = [];
    for (const st of statements) {
      if (st.mainsnak?.snaktype !== "value" || !st.id) continue;
      const parsed = parseStatementSnak(st.mainsnak);
      if (!parsed) continue;
      if (parsed.kind === "item" && parsed.itemId) itemIds.add(parsed.itemId);
      values.push({ statementId: st.id, ...parsed });
    }
    if (values.length) raw.push({ property: def.id, values });
  }

  const labels = await fetchWikidataLabels([...itemIds], lang);
  const properties: WikidataPropertyStatements[] = raw.map((group) => ({
    property: group.property,
    values: group.values.map((v) => ({
      statementId: v.statementId,
      kind: v.kind,
      itemId: v.itemId,
      label: v.kind === "item" ? (v.itemId ? labels.get(v.itemId) ?? null : null) : v.display,
    })),
  }));

  return { qid, properties };
}

/** Add an item-valued claim (e.g. P31) to a Wikidata item. Mirrors `addDepict`
 * but targets a Q-item on Wikidata rather than an M-id on Commons. */
export async function addWikidataItemStatement(
  qid: string,
  property: string,
  valueQid: string,
  token?: string,
): Promise<{ statementId: string }> {
  const csrf = await getCsrfToken(WIKIDATA_API, token);
  const value = JSON.stringify({
    "entity-type": "item",
    "numeric-id": Number(valueQid.slice(1)),
    id: valueQid,
  });
  const data = (await apiPost(
    WIKIDATA_API,
    {
      action: "wbcreateclaim",
      entity: qid,
      property,
      snaktype: "value",
      value,
      summary: "Add statement via WCE",
      token: csrf,
    },
    token,
  )) as { error?: { code?: string; info?: string }; claim?: { id?: string } };

  if (data.error) {
    console.error("addWikidataItemStatement wbcreateclaim error:", JSON.stringify(data.error));
    throw new Error(data.error.info ?? data.error.code ?? "Could not add Wikidata statement");
  }
  const statementId = data.claim?.id;
  if (!statementId) throw new Error("Could not add Wikidata statement");
  return { statementId };
}

/** Remove a Wikidata claim by its statement GUID (item-side counterpart of
 * `removeDepict`, which removes Commons SDC claims). */
export async function removeWikidataItemStatement(
  statementId: string,
  token?: string,
): Promise<void> {
  const csrf = await getCsrfToken(WIKIDATA_API, token);
  const data = (await apiPost(
    WIKIDATA_API,
    {
      action: "wbremoveclaims",
      claim: statementId,
      summary: "Remove statement via WCE",
      token: csrf,
    },
    token,
  )) as { error?: { code?: string; info?: string } };

  if (data.error) {
    throw new Error(data.error.info ?? data.error.code ?? "Could not remove Wikidata statement");
  }
}

/** Everything the sidebar needs to render one category's children. */
export async function getCategoryChildren(
  category: string,
  lang: string,
): Promise<CategoryChildren> {
  const normalized = withCategoryPrefix(category);

  const [infoMap, meta] = await Promise.all([
    collectCategoryInfoPages({
      generator: "categorymembers",
      gcmtitle: normalized,
      gcmtype: "subcat",
      gcmlimit: 500,
    }),
    fetchCategoryMeta(normalized),
  ]);

  const subcategories = await subcategoriesFromInfo(infoMap, lang);

  let wikidata: CategoryWikidata | null = null;
  if (meta.wikibaseItem) {
    const { label, description } = await fetchWikidataLabelAndDescription(
      meta.wikibaseItem,
      lang,
    );
    wikidata = { id: meta.wikibaseItem, label, description };
  }

  return {
    category: normalized,
    subcategories,
    files: meta.files,
    wikidata,
  };
}

/**
 * Parent categories a category page is itself filed under (its own visible
 * `[[Category:...]]` links), enriched with the same file/subcat counts and
 * Wikidata badge as subcategories. Used by the sidebar to show a category's
 * ancestors above the tree root.
 */
export async function getCategoryParents(
  category: string,
  lang: string,
): Promise<Subcategory[]> {
  const infoMap = await collectCategoryInfoPages({
    generator: "categories",
    titles: withCategoryPrefix(category),
    gclshow: "!hidden",
    gcllimit: 500,
  });

  if (infoMap.size === 0) return [];
  return subcategoriesFromInfo(infoMap, lang);
}

interface ExtMetaValue {
  value?: string;
}
type ExtMetadata = Record<string, ExtMetaValue>;

interface ImageInfo {
  url?: string;
  descriptionurl?: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  size?: number;
  mediatype?: string;
  timestamp?: string;
  extmetadata?: ExtMetadata;
}

interface ImageInfoPage {
  pageid: number;
  title: string;
  index?: number; // relevance order in search results
  imageinfo?: ImageInfo[];
}

/** Non-empty trimmed extmetadata value, or undefined. */
function metaValue(ext: ExtMetadata | undefined, key: string): string | undefined {
  const raw = ext?.[key]?.value;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function deriveStatus(ext: ExtMetadata | undefined): FileStatus {
  return {
    description: metaValue(ext, "ImageDescription") !== undefined,
    date:
      metaValue(ext, "DateTimeOriginal") !== undefined ||
      metaValue(ext, "DateTime") !== undefined,
    author:
      metaValue(ext, "Artist") !== undefined ||
      metaValue(ext, "Credit") !== undefined,
    license:
      metaValue(ext, "LicenseShortName") !== undefined ||
      metaValue(ext, "License") !== undefined ||
      metaValue(ext, "UsageTerms") !== undefined,
    location:
      metaValue(ext, "GPSLatitude") !== undefined &&
      metaValue(ext, "GPSLongitude") !== undefined,
  };
}

const GRID_MAX_FILES = 600; // cap per category to keep the grid responsive

/** Map one imageinfo page (from a generator query) to a grid file. */
function toCategoryFileInfo(page: ImageInfoPage): CategoryFileInfo {
  const info = page.imageinfo?.[0];
  const ext = info?.extmetadata;
  const status = deriveStatus(ext);
  const missingCount = Object.values(status).filter((v) => !v).length;
  const year = info?.timestamp
    ? new Date(info.timestamp).getUTCFullYear()
    : null;

  return {
    pageid: page.pageid,
    title: page.title,
    name: page.title.replace(/^File:/i, ""),
    descriptionUrl:
      info?.descriptionurl ??
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(
        page.title.replace(/ /g, "_"),
      )}`,
    thumbUrl: info?.thumburl ?? null,
    thumbWidth: info?.thumbwidth ?? null,
    thumbHeight: info?.thumbheight ?? null,
    size: info?.size ?? null,
    mediatype: info?.mediatype ?? null,
    uploadYear: Number.isFinite(year as number) ? year : null,
    status,
    missingCount,
  };
}

const IMAGEINFO_PROPS = {
  prop: "imageinfo",
  iiprop: "url|size|mediatype|timestamp|extmetadata",
  iiurlwidth: 320,
} as const;

/**
 * Files in a category with enough metadata to render the grid (thumbnail,
 * size, upload year, status dots). Uses a generator so file listing and
 * imageinfo come back together, paginated.
 */
export async function getCategoryGrid(
  category: string,
  lang: string,
): Promise<CategoryFileInfo[]> {
  const files: CategoryFileInfo[] = [];
  let cont: Record<string, string> | undefined;

  do {
    const data = (await apiGet(
      COMMONS_API,
      {
        action: "query",
        generator: "categorymembers",
        gcmtitle: withCategoryPrefix(category),
        gcmtype: "file",
        gcmlimit: 50,
        ...IMAGEINFO_PROPS,
        iiextmetadatalanguage: lang,
        ...(cont ?? {}),
      },
      { noStore: true },
    )) as {
      query?: { pages?: ImageInfoPage[] };
      continue?: Record<string, string>;
    };

    for (const page of data.query?.pages ?? []) {
      files.push(toCategoryFileInfo(page));
    }
    cont = data.continue;
  } while (cont && files.length < GRID_MAX_FILES);

  return files;
}

const PREVIEW_THUMB_LIMIT = 4;

/**
 * Thumbnail URLs only, for the small preview grid on a category card.
 * Deliberately skips extmetadata (descriptions/license/etc.) — the full
 * `getCategoryGrid` payload is overkill when only `thumbUrl` is shown.
 */
export async function getCategoryPreviewThumbs(
  category: string,
): Promise<string[]> {
  // Served from the 5-minute cache (unlike the other membership reads): a
  // mosaic that lags a just-published move is invisible enough that paying
  // one upstream request per category card isn't worth the freshness.
  const data = (await apiGet(COMMONS_API, {
    action: "query",
    generator: "categorymembers",
    gcmtitle: withCategoryPrefix(category),
    gcmtype: "file",
    gcmlimit: PREVIEW_THUMB_LIMIT,
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: 320,
  })) as { query?: { pages?: ImageInfoPage[] } };

  return (data.query?.pages ?? [])
    .map((page) => page.imageinfo?.[0]?.thumburl)
    .filter((url): url is string => Boolean(url));
}

/** Wide enough that a full-bleed banner stretched across a desktop viewport
 * doesn't visibly pixelate, without fetching a near-original-resolution file
 * just to crop most of it away. */
const COVER_IMAGE_WIDTH = 1200;

/**
 * A single, wider thumbnail for the category header's cover banner —
 * deliberately a separate request from `getCategoryPreviewThumbs` (used by
 * the small card mosaic) so that bumping the banner's resolution doesn't
 * also inflate every thumbnail in the card grid.
 */
export async function getCategoryCoverImage(
  category: string,
): Promise<string | null> {
  // Served from the 5-minute cache for the same reason as the preview
  // mosaic: a briefly stale banner is an acceptable trade for the traffic.
  const data = (await apiGet(COMMONS_API, {
    action: "query",
    generator: "categorymembers",
    gcmtitle: withCategoryPrefix(category),
    gcmtype: "file",
    gcmlimit: 1,
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: COVER_IMAGE_WIDTH,
  })) as { query?: { pages?: ImageInfoPage[] } };

  return data.query?.pages?.[0]?.imageinfo?.[0]?.thumburl ?? null;
}

/**
 * Full-text file search (CirrusSearch), optionally scoped to a category via
 * the `incategory:` keyword. Returns the same shape as the category grid.
 */
export async function searchFiles(
  query: string,
  category: string | null,
  lang: string,
): Promise<CategoryFileInfo[]> {
  const scoped = category
    ? `${query} incategory:"${stripCategoryPrefix(category)}"`
    : query;

  const data = (await apiGet(COMMONS_API, {
    action: "query",
    generator: "search",
    gsrsearch: scoped,
    gsrnamespace: 6, // File namespace
    gsrlimit: 60,
    ...IMAGEINFO_PROPS,
    iiextmetadatalanguage: lang,
  })) as { query?: { pages?: ImageInfoPage[] } };

  // Search results carry an "index" for relevance ordering; preserve it.
  const pages = [...(data.query?.pages ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  return pages.map(toCategoryFileInfo);
}

interface CategorySearchPage {
  title: string;
  index?: number;
  categoryinfo?: CategoryInfo;
}

/** Instant-search existing Commons categories by title, for the
 * add-category autocomplete (file detail panel, "+ kategori"). */
export async function searchCategories(
  query: string,
): Promise<{ name: string; files: number | null }[]> {
  const data = (await apiGet(COMMONS_API, {
    action: "query",
    generator: "search",
    gsrsearch: `intitle:${query}`,
    gsrnamespace: 14, // Category namespace
    gsrlimit: 8,
    prop: "categoryinfo",
  })) as { query?: { pages?: CategorySearchPage[] } };

  const pages = [...(data.query?.pages ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  return pages.map((page) => ({
    name: stripCategoryPrefix(page.title),
    files: page.categoryinfo?.files ?? null,
  }));
}

/** List files directly contained in a category. */
export async function getCategoryFiles(
  category: string,
): Promise<CategoryFile[]> {
  const files: CategoryFile[] = [];
  let cmcontinue: string | undefined;

  do {
    const data = (await apiGet(
      COMMONS_API,
      {
        action: "query",
        list: "categorymembers",
        cmtitle: withCategoryPrefix(category),
        cmtype: "file",
        cmprop: "title|timestamp|ids",
        cmlimit: 500,
        cmcontinue,
      },
      { noStore: true },
    )) as {
      query?: { categorymembers?: CategoryMember[] };
      continue?: { cmcontinue?: string };
    };

    for (const m of data.query?.categorymembers ?? []) {
      files.push({
        pageid: m.pageid,
        title: m.title,
        name: m.title.replace(/^File:/i, ""),
        timestamp: m.timestamp ?? null,
      });
    }
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue);

  return files;
}

interface RevisionSlot {
  content?: string;
}
interface Revision {
  slots?: { main?: RevisionSlot };
}
interface FileCategory {
  title: string;
}
interface Coordinate {
  lat?: number;
  lon?: number;
}
interface FileDetailPage extends ImageInfoPage {
  revisions?: Revision[];
  categories?: FileCategory[];
  coordinates?: Coordinate[];
}

/** Full detail for one file: wikitext-parsed fields + extmetadata fallback. */
export async function getFileDetail(
  title: string,
  lang: string,
): Promise<FileDetail | null> {
  const fileTitle = /^File:/i.test(title) ? title : `File:${title}`;

  const data = (await apiGet(
    COMMONS_API,
    {
      action: "query",
      titles: fileTitle,
      prop: "revisions|imageinfo|categories|coordinates",
      rvprop: "content",
      rvslots: "main",
      iiprop: "url|size|extmetadata|mediatype",
      iiurlwidth: 800,
      iiextmetadatalanguage: lang,
      clshow: "!hidden",
      cllimit: 50,
      colimit: 10,
    },
    // Bypass the 5-min server cache: a just-published description/location/
    // depict/category edit must be visible the next time the panel opens,
    // not after the revalidate window. The client-side fileDetailCache still
    // dedupes within a session and is invalidated on writes.
    { noStore: true },
  )) as { query?: { pages?: FileDetailPage[] } };

  const page = data.query?.pages?.[0];
  if (!page || page.pageid == null) return null;

  const info = page.imageinfo?.[0];
  const ext = info?.extmetadata;
  const wikitext = page.revisions?.[0]?.slots?.main?.content ?? "";
  const parsed = parseInformation(wikitext);

  // Descriptions: prefer wikitext (multilingual); fall back to extmetadata.
  let descriptions = parsed.descriptions;
  if (descriptions.length === 0) {
    const extDesc = metaValue(ext, "ImageDescription");
    if (extDesc) descriptions = [{ lang, value: stripHtml(extDesc) }];
  }

  const date =
    parsed.date ??
    (metaValue(ext, "DateTimeOriginal")
      ? stripHtml(metaValue(ext, "DateTimeOriginal")!)
      : null);

  const author =
    parsed.author ??
    (metaValue(ext, "Artist") ? stripHtml(metaValue(ext, "Artist")!) : null);

  const licenseShort = metaValue(ext, "LicenseShortName");
  const licenseUrl = metaValue(ext, "LicenseUrl");

  const categories = (page.categories ?? []).map((c) =>
    stripCategoryPrefix(c.title),
  );

  // Coordinates: GeoData primary coordinate, else wikitext {{Location}}.
  let coordinates = parsed.coordinates;
  const geo = page.coordinates?.[0];
  if (geo?.lat != null && geo?.lon != null) {
    coordinates = { lat: geo.lat, lon: geo.lon };
  }

  const depicts = await getDepicts(page.pageid, lang);

  return {
    pageid: page.pageid,
    title: page.title,
    name: page.title.replace(/^File:/i, ""),
    descriptionUrl:
      info?.descriptionurl ??
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(
        page.title.replace(/ /g, "_"),
      )}`,
    mediaId: `M${page.pageid}`,
    thumbUrl: info?.thumburl ?? null,
    thumbWidth: info?.thumbwidth ?? null,
    thumbHeight: info?.thumbheight ?? null,
    size: info?.size ?? null,
    descriptions,
    date,
    author,
    license: { short: licenseShort ?? null, url: licenseUrl ?? null },
    categories,
    coordinates,
    depicts,
  };
}

interface EditResponse {
  edit?: { result?: string; nochange?: boolean };
  error?: { code?: string; info?: string };
}

interface PageWikitext {
  pageid: number;
  wikitext: string;
  timestamp: string | undefined;
}

/** Fetch a page's current wikitext + revision timestamp (for basetimestamp,
 * which guards against clobbering a concurrent edit). */
async function fetchPageWikitext(title: string): Promise<PageWikitext | null> {
  const data = (await apiGet(
    COMMONS_API,
    {
      action: "query",
      titles: title,
      prop: "revisions",
      rvprop: "content|timestamp",
      rvslots: "main",
    },
    { noStore: true },
  )) as {
    query?: {
      pages?: {
        pageid?: number;
        revisions?: { timestamp?: string; slots?: { main?: { content?: string } } }[];
      }[];
    };
  };

  const page = data.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const wikitext = revision?.slots?.main?.content;
  if (page?.pageid == null || wikitext == null) return null;
  return { pageid: page.pageid, wikitext, timestamp: revision?.timestamp };
}

async function postEdit(
  title: string,
  text: string,
  summary: string,
  basetimestamp: string | undefined,
  extra?: Params,
  token?: string,
): Promise<void> {
  const csrf = await getCsrfToken(COMMONS_API, token);
  const result = (await apiPost(
    COMMONS_API,
    {
      action: "edit",
      title,
      text,
      summary,
      basetimestamp,
      token: csrf,
      ...extra,
    },
    token,
  )) as EditResponse;

  if (result.error) {
    throw new Error(result.error.info ?? result.error.code ?? "Edit failed");
  }
  if (result.edit?.result !== "Success") {
    throw new Error("Edit failed");
  }
}

/** Thrown by `appendToPage` so callers can branch on the MediaWiki API error
 * code (e.g. "articleexists") without string-matching the message. */
class MediaWikiEditError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

/** Append wikitext to a page (creating it if it doesn't exist), used for the
 * deletion-request subpage, the dated deletion log, and uploader talk-page
 * notices — all additive edits where there's nothing to clobber, so no
 * basetimestamp is needed. */
async function appendToPage(
  title: string,
  appendtext: string,
  summary: string,
  token?: string,
  opts?: { createonly?: boolean },
): Promise<void> {
  const csrf = await getCsrfToken(COMMONS_API, token);
  const result = (await apiPost(
    COMMONS_API,
    {
      action: "edit",
      title,
      appendtext,
      summary,
      token: csrf,
      ...(opts?.createonly ? { createonly: 1 } : {}),
    },
    token,
  )) as EditResponse;

  if (result.error) {
    throw new MediaWikiEditError(
      result.error.info ?? result.error.code ?? "Edit failed",
      result.error.code,
    );
  }
  if (result.edit?.result !== "Success") {
    throw new MediaWikiEditError("Edit failed");
  }
}

/** Find the username that created a page (its first revision) — for a file
 * page, that's the uploader, since Commons creates the page on upload. */
async function getPageCreator(title: string): Promise<string | null> {
  const data = (await apiGet(
    COMMONS_API,
    {
      action: "query",
      titles: title,
      prop: "revisions",
      rvprop: "user",
      rvdir: "newer",
      rvlimit: 1,
    },
    { noStore: true },
  )) as { query?: { pages?: { revisions?: { user?: string }[] }[] } };

  return data.query?.pages?.[0]?.revisions?.[0]?.user ?? null;
}

/**
 * Patch a single language's description in the {{Information}} template on
 * a file page. Throws if the page doesn't have that template/param in the
 * expected shape — callers should fall back to "edit on Commons" in that
 * case rather than guessing at a rewrite.
 */
export async function editFileDescription(
  title: string,
  lang: string,
  value: string,
  token?: string,
): Promise<void> {
  const fileTitle = /^File:/i.test(title) ? title : `File:${title}`;

  const page = await fetchPageWikitext(fileTitle);
  if (!page) {
    throw new Error("File not found");
  }

  const updated = withUpdatedDescription(page.wikitext, lang, value);
  if (updated == null) {
    throw new Error(
      "This page's description isn't in a format WCE can edit in place — use 'Edit on Commons'.",
    );
  }

  await postEdit(fileTitle, updated, "Update description via WCE", page.timestamp, undefined, token);
}

/**
 * Set a file's {{Location dec|lat|lon}} coordinates, replacing any existing
 * location template or inserting a new one.
 */
export async function editFileLocation(
  title: string,
  lat: number,
  lon: number,
  token?: string,
): Promise<void> {
  const fileTitle = /^File:/i.test(title) ? title : `File:${title}`;

  const page = await fetchPageWikitext(fileTitle);
  if (!page) {
    throw new Error("File not found");
  }

  const updated = withUpdatedLocation(page.wikitext, lat, lon);
  await postEdit(fileTitle, updated, "Add location via WCE", page.timestamp, undefined, token);
}

// Allowlisted license tokens → the Commons template they expand to. Keeping
// this server-side and closed means the client can't inject arbitrary wikitext
// through the license field.
const LICENSE_TEMPLATES: Record<string, string> = {
  "cc-by-sa-4.0": "{{Cc-by-sa-4.0}}",
  "cc-by-4.0": "{{Cc-by-4.0}}",
  "cc0": "{{Cc-zero}}",
  "pd-self": "{{PD-self}}",
};

export interface UploadMeta {
  /** Target file name, with extension, without the "File:" prefix. */
  filename: string;
  description: string;
  /** Language code the description is written in (wraps it in {{<lang>|…}}). */
  descriptionLang: string;
  date: string;
  author: string;
  source: string;
  /** One of LICENSE_TEMPLATES' keys. */
  license: string;
  /** Category names (with or without the "Category:" prefix). */
  categories: string[];
  /** GPS coordinates read from the photo's EXIF data, if present. */
  location?: Coordinates | null;
}

/** MediaWiki rejects these characters in titles; strip them so a user-typed
 * file name can't produce an invalid (or wikitext-injecting) target. */
function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[#<>[\]|{}/:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Standard Commons file-description page: {{Information}} + a license
 * template + category links, built from structured metadata. */
/** Hidden maintenance category every WCE upload is tagged with, for tracking — not a content category. */
const WCE_UPLOAD_TRACKING_CATEGORY = "Uploaded with WCE";

function buildFilePageWikitext(meta: UploadMeta): string {
  const licenseTpl =
    LICENSE_TEMPLATES[meta.license] ?? LICENSE_TEMPLATES["cc-by-sa-4.0"];
  const lang = /^[a-z]{2,3}(-[a-z]+)?$/i.test(meta.descriptionLang)
    ? meta.descriptionLang.toLowerCase()
    : "en";
  const desc = meta.description.trim();
  const description = desc ? `{{${lang}|1=${desc}}}` : "";
  const source = meta.source.trim() || "{{own}}";
  const author = meta.author.trim();
  const categories = [
    ...meta.categories.map((c) => stripCategoryPrefix(c).trim()).filter(Boolean),
    WCE_UPLOAD_TRACKING_CATEGORY,
  ];

  const lines = [
    "=={{int:filedesc}}==",
    "{{Information",
    `|description=${description}`,
    `|date=${meta.date.trim()}`,
    `|source=${source}`,
    `|author=${author}`,
    "}}",
  ];
  if (meta.location) {
    lines.push(`{{Location dec|${meta.location.lat}|${meta.location.lon}}}`);
  }
  lines.push("", "=={{int:license-header}}==", licenseTpl);
  if (categories.length > 0) {
    lines.push("");
    for (const c of categories) lines.push(`[[Category:${c}]]`);
  }
  return lines.join("\n");
}

/**
 * Upload a single new file to Commons via action=upload (multipart). Builds
 * the description page from `meta`, refuses uploads that collide with an
 * existing file or duplicate one already on Commons (rather than silently
 * overwriting), and returns the created page title on success.
 */
export async function uploadFile(
  file: Blob,
  meta: UploadMeta,
  token?: string,
): Promise<{ title: string }> {
  const filename = sanitizeFilename(meta.filename);
  if (!filename || !/\.[A-Za-z0-9]+$/.test(filename)) {
    throw new Error(
      "Invalid file name — include an extension, e.g. \"My photo.jpg\".",
    );
  }

  const csrf = await getCsrfToken(COMMONS_API, token);
  const bearer = token ?? (await getAccessToken());
  const text = buildFilePageWikitext({ ...meta, filename });

  const form = new FormData();
  form.set("action", "upload");
  form.set("format", "json");
  form.set("formatversion", "2");
  form.set("filename", filename);
  form.set("comment", "Upload via WCE");
  form.set("text", text);
  form.set("token", csrf);
  form.set("file", file, filename);

  // No explicit Content-Type: fetch derives the multipart boundary from FormData.
  const res = await fetchWithRateLimitRetry(COMMONS_API, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Api-User-Agent": USER_AGENT,
      Authorization: `Bearer ${bearer}`,
    },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`MediaWiki API ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    upload?: {
      result?: string;
      filename?: string;
      warnings?: Record<string, unknown>;
    };
    error?: { info?: string; code?: string };
  };

  if (data.error) {
    throw new Error(data.error.info ?? data.error.code ?? "Upload failed");
  }

  const result = data.upload?.result;
  if (result === "Warning") {
    const warnings = Object.keys(data.upload?.warnings ?? {});
    if (warnings.includes("exists")) {
      throw new Error(`A file named "${filename}" already exists on Commons.`);
    }
    if (warnings.includes("duplicate")) {
      throw new Error("This file is a duplicate of one already on Commons.");
    }
    throw new Error(`Upload blocked: ${warnings.join(", ") || "warning"}`);
  }
  if (result !== "Success") {
    throw new Error("Upload failed");
  }

  return { title: `File:${data.upload?.filename ?? filename}` };
}

/** Nominate a file for deletion review on Commons (Commons:Deletion
 * requests), following COM:DR's "Listing a request manually" steps: tag the
 * file, create the deletion-request subpage, list it in the dated deletion
 * log, and notify the uploader. The last step is best-effort — a missing or
 * unnotifiable uploader shouldn't block an otherwise-valid request. */
export async function nominateFileDeletion(
  title: string,
  reason: string,
  token?: string,
): Promise<void> {
  const fileTitle = /^File:/i.test(title) ? title : `File:${title}`;
  const drTitle = `Commons:Deletion requests/${fileTitle}`;

  const page = await fetchPageWikitext(fileTitle);
  if (!page) {
    throw new Error("File not found");
  }

  const now = new Date();
  const updated = withDeletionNomination(page.wikitext, reason, now);
  await postEdit(fileTitle, updated, "Nominate for deletion via WCE", page.timestamp, undefined, token);

  try {
    await appendToPage(
      drTitle,
      buildDeletionRequestSubpage(fileTitle, reason),
      "Creating deletion request via WCE",
      token,
      { createonly: true },
    );
  } catch (err) {
    if (err instanceof MediaWikiEditError && err.code === "articleexists") {
      throw new Error("This file already has an open deletion request.");
    }
    throw err;
  }

  const logTitle = `Commons:Deletion requests/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}`;
  await appendToPage(logTitle, `\n{{${drTitle}}}`, "Listing deletion request via WCE", token);

  try {
    const uploader = await getPageCreator(fileTitle);
    if (uploader) {
      await appendToPage(
        `User talk:${uploader}`,
        buildUploaderNotice(fileTitle),
        "Notify uploader of deletion request via WCE",
        token,
      );
    }
  } catch {
    // Best-effort — the DR is already valid without the notification.
  }
}

/** Remove a file's {{Location}}/{{Object location}} template outright. */
export async function removeFileLocation(title: string, token?: string): Promise<void> {
  const fileTitle = /^File:/i.test(title) ? title : `File:${title}`;

  const page = await fetchPageWikitext(fileTitle);
  if (!page) {
    throw new Error("File not found");
  }

  const updated = withRemovedLocation(page.wikitext);
  if (updated == null) {
    throw new Error("Page has no location to remove");
  }

  await postEdit(fileTitle, updated, "Remove location via WCE", page.timestamp, undefined, token);
}

/**
 * Move a page's category membership: replace `[[Category:from]]` with
 * `[[Category:to]]` on `pageTitle`'s own wikitext. Works for both file
 * pages (`File:...`) and category pages (`Category:...`, i.e. re-parenting
 * a subcategory) — both link to their categories the same way.
 */
export async function moveCategoryMembership(
  pageTitle: string,
  fromCategory: string,
  toCategory: string,
  token?: string,
): Promise<void> {
  const page = await fetchPageWikitext(pageTitle);
  if (!page) throw new Error("Page not found");

  const updated = withMovedCategory(page.wikitext, fromCategory, toCategory);
  if (updated == null) {
    // Not categorized under `fromCategory` — either it never was, or an
    // earlier publish attempt already completed this exact move (and a
    // mixed-result retry is replaying it). Treat the latter as success so
    // a retry converges instead of failing forever on work already done.
    if (withRemovedCategory(page.wikitext, toCategory) != null) return;
    throw new Error(`Page isn't categorized under "${fromCategory}"`);
  }

  await postEdit(
    pageTitle,
    updated,
    `Move from Category:${fromCategory} to Category:${toCategory} via WCE`,
    page.timestamp,
    undefined,
    token,
  );
}

/** Add a `[[Category:X]]` link to a page that isn't already categorized
 * under it. Throws if the link is already present. */
export async function addCategoryMembership(
  pageTitle: string,
  category: string,
  token?: string,
): Promise<void> {
  const page = await fetchPageWikitext(pageTitle);
  if (!page) throw new Error("Page not found");

  if (withRemovedCategory(page.wikitext, category) != null) {
    throw new Error(`Page is already categorized under "${category}"`);
  }

  const updated = withAddedCategory(page.wikitext, category);
  await postEdit(pageTitle, updated, `Add to Category:${category} via WCE`, page.timestamp, undefined, token);
}

/** Remove a page's `[[Category:X]]` link outright (rather than moving it to
 * another category, as moveCategoryMembership does). */
export async function removeCategoryMembership(
  pageTitle: string,
  category: string,
  token?: string,
): Promise<void> {
  const page = await fetchPageWikitext(pageTitle);
  if (!page) throw new Error("Page not found");

  const updated = withRemovedCategory(page.wikitext, category);
  if (updated == null) {
    throw new Error(`Page isn't categorized under "${category}"`);
  }

  await postEdit(
    pageTitle,
    updated,
    `Remove from Category:${category} via WCE`,
    page.timestamp,
    undefined,
    token,
  );
}

export interface CreateCategoryResult {
  moved: string[];
  failed: { title: string; error: string }[];
  wikidataError?: string;
}

/**
 * Create a new Commons category page under `parentCategory`, optionally
 * linking it to an existing Wikidata item via a real sitelink, then
 * recategorize each selected file into it (removing the old
 * `parentCategory` link from each, mirroring drag-and-drop "move"
 * semantics). Individual file failures don't abort the whole operation —
 * they're reported back so the caller can show which ones need a manual
 * retry.
 */
export async function createCategoryFromSelection(
  name: string,
  parentCategory: string,
  fileTitles: string[],
  wikidataQid?: string | null,
  token?: string,
): Promise<CreateCategoryResult> {
  const categoryTitle = withCategoryPrefix(name);

  const csrf = await getCsrfToken(COMMONS_API, token);
  const createResult = (await apiPost(
    COMMONS_API,
    {
      action: "edit",
      title: categoryTitle,
      text: buildNewCategoryWikitext(parentCategory),
      summary: "Create category via WCE",
      createonly: 1,
      token: csrf,
    },
    token,
  )) as EditResponse;

  if (createResult.error) {
    // "articleexists" means an earlier publish attempt already created this
    // page (a mixed-result retry is replaying it) — continue to the
    // sitelink/file steps below instead of failing the whole retry forever.
    if (createResult.error.code !== "articleexists") {
      throw new Error(
        createResult.error.info ?? createResult.error.code ?? "Could not create category",
      );
    }
  }

  let wikidataError: string | undefined;
  if (wikidataQid) {
    try {
      await setCategorySitelink(name, wikidataQid, token);
    } catch (err) {
      wikidataError = err instanceof Error ? err.message : "Wikidata link failed";
    }
  }

  const moved: string[] = [];
  const failed: { title: string; error: string }[] = [];
  for (const title of fileTitles) {
    try {
      await moveCategoryMembership(title, parentCategory, name, token);
      moved.push(title);
    } catch (err) {
      failed.push({
        title,
        error: err instanceof Error ? err.message : "Edit failed",
      });
    }
  }

  return { moved, failed, wikidataError };
}

/** Resolve the Wikidata id to prefill in the edit-category modal: prefer the
 * real sitelink (pageprops `wikibase_item`, same source as the sidebar's
 * WikidataBadge) and fall back to the informational `{{Wikidata Infobox}}`
 * note in the page's wikitext, which older category pages may carry from
 * before WCE could create real sitelinks. */
export async function getCategoryWikidataNote(
  category: string,
): Promise<string | null> {
  const title = withCategoryPrefix(category);
  const [meta, page] = await Promise.all([
    fetchCategoryMeta(title),
    fetchPageWikitext(title),
  ]);
  if (meta.wikibaseItem) return meta.wikibaseItem;
  return page ? parseWikidataQid(page.wikitext) : null;
}

interface SitelinkResponse {
  error?: { code?: string; info?: string };
}

/** Best-effort purge of a Commons page with `forcelinkupdate`, so the Wikibase
 * client re-reads its just-changed Wikidata connection now instead of waiting
 * out the repo→client change-dispatch lag. Without this, the `wikibase_item`
 * pageprop (and so the sidebar badge) can stay stale for many minutes after a
 * sitelink is set/cleared. Non-fatal — the link is already correct on Wikidata
 * regardless. */
async function purgeCommonsPage(title: string, token?: string): Promise<void> {
  try {
    await apiPost(
      COMMONS_API,
      {
        action: "purge",
        titles: title,
        forcelinkupdate: 1,
      },
      token,
    );
  } catch {
    // Ignore: the connection still propagates on its own eventually.
  }
}

/** Create or repoint the `commonswiki` sitelink on a Wikidata item to point
 * at this category page — the real bidirectional link, as opposed to the
 * informational `{{Wikidata Infobox}}` note. Fails if that item already has
 * a commonswiki sitelink pointing elsewhere (Wikidata enforces one sitelink
 * per wiki per item) or if `qid` doesn't exist. */
export async function setCategorySitelink(
  category: string,
  qid: string,
  token?: string,
): Promise<void> {
  const title = withCategoryPrefix(category);
  const csrf = await getCsrfToken(WIKIDATA_API, token);
  const data = (await apiPost(
    WIKIDATA_API,
    {
      action: "wbsetsitelink",
      id: qid,
      linksite: "commonswiki",
      linktitle: title,
      summary: "Link via WCE",
      token: csrf,
    },
    token,
  )) as SitelinkResponse;

  if (data.error) {
    throw new Error(
      data.error.info ?? data.error.code ?? "Could not set Wikidata sitelink",
    );
  }

  // Nudge Commons to register the new connection immediately.
  await purgeCommonsPage(title, token);
}

/** Remove the `commonswiki` sitelink from whichever Wikidata item currently
 * points at this category, if any. */
export async function clearCategorySitelink(category: string, token?: string): Promise<void> {
  const title = withCategoryPrefix(category);
  const meta = await fetchCategoryMeta(title);
  if (!meta.wikibaseItem) return;

  const csrf = await getCsrfToken(WIKIDATA_API, token);
  const data = (await apiPost(
    WIKIDATA_API,
    {
      action: "wbsetsitelink",
      id: meta.wikibaseItem,
      linksite: "commonswiki",
      summary: "Unlink via WCE",
      token: csrf,
    },
    token,
  )) as SitelinkResponse;

  if (data.error) {
    throw new Error(
      data.error.info ?? data.error.code ?? "Could not remove Wikidata sitelink",
    );
  }

  // Nudge Commons to drop the now-removed connection immediately.
  await purgeCommonsPage(title, token);
}

interface MoveResponse {
  move?: { from?: string; to?: string };
  error?: { code?: string; info?: string };
}

export interface RenameCategoryResult {
  moved: string[];
  failed: { title: string; error: string }[];
}

/**
 * Rename a category: moves the `Category:` page itself (Commons leaves a
 * redirect at the old title automatically), then recategorizes every file
 * directly in it from the old name to the new one — without this, the
 * files would still display under the old title via the redirect, which is
 * considered poor practice on Commons. Subcategories are intentionally left
 * untouched (out of scope — see the limited blast radius of a single
 * rename action).
 */
export async function renameCategory(
  oldName: string,
  newName: string,
  token?: string,
): Promise<RenameCategoryResult> {
  const csrf = await getCsrfToken(COMMONS_API, token);
  const moveResult = (await apiPost(
    COMMONS_API,
    {
      action: "move",
      from: withCategoryPrefix(oldName),
      to: withCategoryPrefix(newName),
      reason: "Rename via WCE",
      token: csrf,
    },
    token,
  )) as MoveResponse;

  if (moveResult.error) {
    // "missingtitle" on `from` means an earlier publish attempt already
    // completed this exact move (a mixed-result retry is replaying it) —
    // confirm the destination exists and continue to the file step below
    // instead of failing the whole retry forever.
    const alreadyMoved =
      moveResult.error.code === "missingtitle" &&
      (await fetchPageWikitext(withCategoryPrefix(newName))) != null;
    if (!alreadyMoved) {
      throw new Error(
        moveResult.error.info ?? moveResult.error.code ?? "Could not rename category",
      );
    }
  }

  const files = await getCategoryFiles(oldName);
  const moved: string[] = [];
  const failed: { title: string; error: string }[] = [];
  for (const file of files) {
    try {
      await moveCategoryMembership(file.title, oldName, newName, token);
      moved.push(file.title);
    } catch (err) {
      failed.push({
        title: file.title,
        error: err instanceof Error ? err.message : "Edit failed",
      });
    }
  }

  return { moved, failed };
}
