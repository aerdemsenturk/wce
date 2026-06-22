// Read-only parsing of the {{Information}} and {{Location}} templates from a
// file's wikitext. v2 will extend this module to patch fields in place.

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
 * Find the body of a template by name, brace-aware (handles nesting).
 * Returns the text between the template name and its closing "}}".
 */
function extractTemplateBody(text: string, name: string): string | null {
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
  // bodyStart..(i-2) is the content between {{...}}
  return text.slice(bodyStart, i - 2);
}

/** Split a template body into top-level "|" segments (brace/bracket aware). */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depthCurly = 0;
  let depthSquare = 0;
  let current = "";
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
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts;
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
