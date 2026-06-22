// Parsing of the {{Information}} and {{Location}} templates from a file's
// wikitext, plus position-aware helpers (below) to patch a single field
// in place without disturbing the rest of the page.

export interface LangText {
  lang: string;
  value: string;
}

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface ParsedInformation {
  descriptions: LangText[];
  date: string | null;
  author: string | null;
  source: string | null;
  permission: string | null;
  coordinates: Coordinates | null;
}

/** Strip the most common wiki markup so a value is presentable as plain text. */
export function stripWikiMarkup(input: string): string {
  let s = input;
  // [[User:Foo|Foo]] / [[Foo|Bar]] -> Bar ; [[Foo]] -> Foo
  s = s.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1");
  // [https://... label] -> label
  s = s.replace(/\[(?:https?:)?\/\/\S+\s+([^\]]+)\]/g, "$1");
  // {{own}} and other bare templates -> drop braces, keep first token
  s = s.replace(/\{\{([^}|]+)(?:\|[^}]*)?\}\}/g, "$1");
  // leftover bold/italic apostrophes
  s = s.replace(/'{2,}/g, "");
  return s.trim();
}

/** Strip HTML tags and decode a few common entities (for extmetadata values). */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the absolute [start, end) range of a template's body by name,
 * brace-aware (handles nesting). The range covers the text between the
 * template name and its closing "}}" (exclusive of both brace pairs).
 */
function findTemplateBodyRange(
  text: string,
  name: string,
): { start: number; end: number } | null {
  const re = new RegExp(`\\{\\{\\s*${name}\\b`, "i");
  const m = re.exec(text);
  if (!m) return null;

  let i = m.index + 2; // just after "{{"
  let depth = 1;
  const bodyStart = i;
  while (i < text.length && depth > 0) {
    if (text[i] === "{" && text[i + 1] === "{") {
      depth++;
      i += 2;
      continue;
    }
    if (text[i] === "}" && text[i + 1] === "}") {
      depth--;
      i += 2;
      continue;
    }
    i++;
  }
  return { start: bodyStart, end: i - 2 };
}

/** Find the body of a template by name, brace-aware (handles nesting). */
function extractTemplateBody(text: string, name: string): string | null {
  const range = findTemplateBodyRange(text, name);
  return range ? text.slice(range.start, range.end) : null;
}

/**
 * Split a template body into top-level "|" segments (brace/bracket aware),
 * keeping each segment's absolute [start, end) range in `text` so callers
 * can splice a replacement back in without touching the rest of the page.
 */
function splitTopLevelWithOffsets(
  body: string,
  baseOffset: number,
): { text: string; start: number; end: number }[] {
  const parts: { text: string; start: number; end: number }[] = [];
  let depthCurly = 0;
  let depthSquare = 0;
  let current = "";
  let segStart = baseOffset;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    const next = body[i + 1];
    if (c === "{" && next === "{") {
      depthCurly++;
      current += "{{";
      i++;
      continue;
    }
    if (c === "}" && next === "}") {
      depthCurly--;
      current += "}}";
      i++;
      continue;
    }
    if (c === "[" && next === "[") {
      depthSquare++;
      current += "[[";
      i++;
      continue;
    }
    if (c === "]" && next === "]") {
      depthSquare--;
      current += "]]";
      i++;
      continue;
    }
    if (c === "|" && depthCurly === 0 && depthSquare === 0) {
      parts.push({ text: current, start: segStart, end: baseOffset + i });
      current = "";
      segStart = baseOffset + i + 1;
      continue;
    }
    current += c;
  }
  parts.push({ text: current, start: segStart, end: baseOffset + body.length });
  return parts;
}

/** Split a template body into top-level "|" segments (brace/bracket aware). */
function splitTopLevel(body: string): string[] {
  return splitTopLevelWithOffsets(body, 0).map((p) => p.text);
}

/** Parse named params from a template body (first segment is the name). */
function parseParams(body: string): Map<string, string> {
  const params = new Map<string, string>();
  const segments = splitTopLevel(body);
  // segments[0] is the template name; skip it.
  for (let i = 1; i < segments.length; i++) {
    const eq = segments[i].indexOf("=");
    if (eq === -1) continue;
    const key = segments[i].slice(0, eq).trim().toLowerCase();
    const value = segments[i].slice(eq + 1).trim();
    if (key) params.set(key, value);
  }
  return params;
}

/** Extract per-language descriptions from a description field value. */
function parseDescriptions(value: string): LangText[] {
  const out: LangText[] = [];
  // {{en|1=...}} or {{en|...}} — language code is 2-3 letters.
  const re = /\{\{\s*([a-z]{2,3})\s*\|\s*(?:1\s*=\s*)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const lang = m[1].toLowerCase();
    // Capture from the end of the match to the matching "}}".
    let i = re.lastIndex;
    let depth = 1;
    const startInner = i;
    while (i < value.length && depth > 0) {
      if (value[i] === "{" && value[i + 1] === "{") {
        depth++;
        i += 2;
        continue;
      }
      if (value[i] === "}" && value[i + 1] === "}") {
        depth--;
        i += 2;
        continue;
      }
      i++;
    }
    const inner = value.slice(startInner, i - 2);
    const clean = stripWikiMarkup(inner);
    if (clean) out.push({ lang, value: clean });
    re.lastIndex = i;
  }
  // No language templates? Treat the whole thing as undetermined-language text.
  if (out.length === 0) {
    const clean = stripWikiMarkup(value);
    if (clean) out.push({ lang: "und", value: clean });
  }
  return out;
}

/** Extract the first {{Location}} / {{Object location}} coordinate pair. */
export function parseLocation(text: string): Coordinates | null {
  const re =
    /\{\{\s*(?:location|object location)(?:\s+dec)?\s*\|\s*(-?\d+(?:\.\d+)?)\s*\|\s*(-?\d+(?:\.\d+)?)/i;
  const m = re.exec(text);
  if (!m) return null;
  const lat = Number.parseFloat(m[1]);
  const lon = Number.parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

/** Parse the {{Information}} template (plus location) from file wikitext. */
export function parseInformation(text: string): ParsedInformation {
  const body = extractTemplateBody(text, "Information");
  const params = body ? parseParams(body) : new Map<string, string>();

  const descRaw = params.get("description") ?? "";
  const descriptions = descRaw ? parseDescriptions(descRaw) : [];

  const dateRaw = params.get("date") ?? "";
  const date = dateRaw ? stripWikiMarkup(dateRaw) || null : null;

  const authorRaw = params.get("author") ?? "";
  const author = authorRaw ? stripWikiMarkup(authorRaw) || null : null;

  const sourceRaw = params.get("source") ?? "";
  const source = sourceRaw ? stripWikiMarkup(sourceRaw) || null : null;

  const permissionRaw = params.get("permission") ?? "";
  const permission = permissionRaw ? stripWikiMarkup(permissionRaw) || null : null;

  return {
    descriptions,
    date,
    author,
    source,
    permission,
    coordinates: parseLocation(text),
  };
}

/** Find the absolute [start, end) range of the {{Information}} `description`
 * parameter's value, or null if the template/param isn't present in the
 * expected shape (caller should fall back to "edit on Commons"). */
function findDescriptionValueRange(
  text: string,
): { start: number; end: number } | null {
  const bodyRange = findTemplateBodyRange(text, "Information");
  if (!bodyRange) return null;
  const body = text.slice(bodyRange.start, bodyRange.end);
  const segments = splitTopLevelWithOffsets(body, bodyRange.start);

  // segments[0] is the template name; skip it.
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const eq = seg.text.indexOf("=");
    if (eq === -1) continue;
    const key = seg.text.slice(0, eq).trim().toLowerCase();
    if (key !== "description") continue;
    return { start: seg.start + eq + 1, end: seg.end };
  }
  return null;
}

/** Find the absolute [start, end) range of an existing {{lang|...}} block
 * within a description value, or null if that language isn't present yet. */
function findLangBlockRange(
  value: string,
  lang: string,
): { start: number; end: number } | null {
  const re = new RegExp(`\\{\\{\\s*${lang}\\s*\\|`, "i");
  const m = re.exec(value);
  if (!m) return null;

  let i = m.index + 2;
  let depth = 1;
  while (i < value.length && depth > 0) {
    if (value[i] === "{" && value[i + 1] === "{") {
      depth++;
      i += 2;
      continue;
    }
    if (value[i] === "}" && value[i + 1] === "}") {
      depth--;
      i += 2;
      continue;
    }
    i++;
  }
  return { start: m.index, end: i };
}

/** Escape "|" so it can't be mistaken for a template/param separator. */
function escapeForTemplateParam(value: string): string {
  return value.replace(/\|/g, "{{!}}");
}

/**
 * Patch a single language's description in place, leaving every other part
 * of the wikitext (other languages, date/author/source/permission, location,
 * categories) untouched. Returns null if the page doesn't have a
 * `{{Information|description=...}}` block to patch.
 */
export function withUpdatedDescription(
  wikitext: string,
  lang: string,
  newValue: string,
): string | null {
  const range = findDescriptionValueRange(wikitext);
  if (!range) return null;

  const value = wikitext.slice(range.start, range.end);
  const escaped = escapeForTemplateParam(newValue.trim());

  let newSegment: string;
  if (lang === "und") {
    // No per-language template was found when parsing — the whole value is
    // the (single) description; replace it wholesale.
    newSegment = ` ${escaped}\n`;
  } else {
    const langRange = findLangBlockRange(value, lang);
    const block = `{{${lang}|1=${escaped}}}`;
    if (langRange) {
      newSegment =
        value.slice(0, langRange.start) + block + value.slice(langRange.end);
    } else {
      newSegment = `${value.replace(/\s+$/, "")}\n${block}\n`;
    }
  }

  return wikitext.slice(0, range.start) + newSegment + wikitext.slice(range.end);
}

/** Find the absolute [start, end) range of a `[[Category:Name|sortkey]]`
 * link (any namespace alias casing), or null if that category isn't linked
 * on the page. */
function findCategoryLinkRange(
  text: string,
  category: string,
): { start: number; end: number } | null {
  const escaped = category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\[\\[\\s*Category\\s*:\\s*${escaped}\\s*(\\|[^\\]]*)?\\]\\]`,
    "i",
  );
  const m = re.exec(text);
  if (!m) return null;
  return { start: m.index, end: m.index + m[0].length };
}

/**
 * Replace a page's `[[Category:From]]` link with `[[Category:To]]`,
 * preserving any sort key. Works on both file pages and category pages
 * (a category's own wikitext links to its parent the same way). Returns
 * null if `from` isn't linked on the page.
 */
export function withMovedCategory(
  wikitext: string,
  fromCategory: string,
  toCategory: string,
): string | null {
  const range = findCategoryLinkRange(wikitext, fromCategory);
  if (!range) return null;

  const original = wikitext.slice(range.start, range.end);
  const sortKeyMatch = /\|[^\]]*(?=\]\]$)/.exec(original);
  const sortKey = sortKeyMatch ? sortKeyMatch[0] : "";
  const replacement = `[[Category:${toCategory}${sortKey}]]`;

  return wikitext.slice(0, range.start) + replacement + wikitext.slice(range.end);
}

/** Remove a `[[Category:Name]]` link from a page's wikitext outright (rather
 * than replacing it, as withMovedCategory does). Returns null if `category`
 * isn't linked on the page. */
export function withRemovedCategory(
  wikitext: string,
  category: string,
): string | null {
  const range = findCategoryLinkRange(wikitext, category);
  if (!range) return null;

  let end = range.end;
  if (wikitext[end] === "\n") end += 1;

  return (wikitext.slice(0, range.start) + wikitext.slice(end)).replace(
    /\n{3,}/g,
    "\n\n",
  );
}

/** Add a `[[Category:Name]]` link to a page's wikitext (appended at the end,
 * the conventional place for category links on Commons). */
export function withAddedCategory(wikitext: string, category: string): string {
  const trimmed = wikitext.replace(/\s+$/, "");
  return `${trimmed}\n[[Category:${category}]]\n`;
}

/** Build the wikitext for a brand-new Commons category page: just the
 * parent category link. Any Wikidata link is a real sitelink created
 * separately via `setCategorySitelink`, not written into this wikitext. */
export function buildNewCategoryWikitext(parentCategory: string): string {
  return `[[Category:${parentCategory}]]\n`;
}

const WIKIDATA_NOTE_RE = /\{\{\s*Wikidata Infobox\s*\|\s*qid\s*=\s*([^}|]+?)\s*\}\}\n?/i;

/** Read the qid out of a category's informational `{{Wikidata Infobox}}`
 * note, if present. Older category pages may carry this note from before
 * WCE could create real Wikidata sitelinks — kept as a read-only fallback
 * for `getCategoryWikidataNote`. */
export function parseWikidataQid(wikitext: string): string | null {
  return WIKIDATA_NOTE_RE.exec(wikitext)?.[1]?.trim() ?? null;
}
