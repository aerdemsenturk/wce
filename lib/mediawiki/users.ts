import type { ActivityItem, CategoryFileInfo, UserProfile } from "../types";
import { defaultLocale } from "@/i18n/config";
import { apiGet, apiGetAuthed, COMMONS_API, type Params } from "./client";
import { IMAGEINFO_PROPS, toCategoryFileInfo, type ImageInfoPage } from "./reads";

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
