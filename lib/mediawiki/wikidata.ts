import type {
  WikidataItemStatements,
  WikidataPropertyStatements,
} from "../types";
import { CURATED_PROPERTIES } from "../wikidataProperties";
import { apiGet, apiPost, getCsrfToken, WIKIDATA_API } from "./client";

/** Resolve a Wikidata item's label, preferring the requested language. */
export async function fetchWikidataLabelAndDescription(
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

/** Batch-resolve Wikidata labels (up to 50 ids per request). Batches run in
 * parallel; the global upstream concurrency gate keeps the fan-out polite. */
export async function fetchWikidataLabels(
  ids: string[],
  lang: string,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));

  await Promise.all(
    batches.map(async (batch) => {
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
    }),
  );
  return out;
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
