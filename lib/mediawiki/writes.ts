import type { Coordinates } from "../types";
import { stripCategoryPrefix, withCategoryPrefix } from "../category";
import { upstreamReadCache } from "../serverCache";
import {
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
} from "../wikitext";
import {
  apiGet,
  apiPost,
  fetchWithRateLimitRetry,
  getAccessToken,
  getCsrfToken,
  COMMONS_API,
  USER_AGENT,
  WIKIDATA_API,
  type Params,
} from "./client";
import { fetchCategoryMeta, getCategoryFiles } from "./reads";

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

  // The new file appears in each target category's grid and file count.
  for (const c of meta.categories) upstreamReadCache.invalidateCategory(c);

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

/** Drop the cached listings a just-changed `[[Category:...]]` link affects:
 * the touched categories' children/grid, and — when the edited page is
 * itself a category page (a re-parenting) — that category's own cached
 * parents listing. */
function invalidateMembershipCaches(
  pageTitle: string,
  ...categories: string[]
): void {
  for (const c of categories) upstreamReadCache.invalidateCategory(c);
  if (/^Category:/i.test(pageTitle)) {
    upstreamReadCache.invalidateCategory(pageTitle);
  }
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
    if (withRemovedCategory(page.wikitext, toCategory) != null) {
      invalidateMembershipCaches(pageTitle, fromCategory, toCategory);
      return;
    }
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
  invalidateMembershipCaches(pageTitle, fromCategory, toCategory);
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
  invalidateMembershipCaches(pageTitle, category);
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
  invalidateMembershipCaches(pageTitle, category);
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

  // The per-file moves invalidated both categories already, but a create
  // with no files (or with every move failing) must still drop the parent's
  // listings and any cached miss for the new category itself.
  upstreamReadCache.invalidateCategory(name);
  upstreamReadCache.invalidateCategory(parentCategory);

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

  // Nudge Commons to register the new connection immediately, and drop our
  // own cached reads (the children listing carries the Wikidata badge).
  await purgeCommonsPage(title, token);
  upstreamReadCache.invalidateCategory(category);
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

  // Nudge Commons to drop the now-removed connection immediately, and drop
  // our own cached reads (the children listing carries the Wikidata badge).
  await purgeCommonsPage(title, token);
  upstreamReadCache.invalidateCategory(category);
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

  // Parents' children listings still show the old name; the route handler
  // invalidates the parent the client was viewing (this function can't see
  // it), and any other parent falls back to the cache TTL.
  upstreamReadCache.invalidateCategory(oldName);
  upstreamReadCache.invalidateCategory(newName);

  return { moved, failed };
}
