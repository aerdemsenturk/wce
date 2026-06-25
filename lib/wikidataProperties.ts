// The curated set of Wikidata properties shown in the category quick-edit
// panel — chosen for cultural-heritage categories. Pure data, shared by client
// and server (no API calls), like `category.ts`.
//
// `editable: true` marks item-valued properties WCE can add/remove in v1 (they
// reuse the Wikidata item picker). The rest are shown read-only with a link out
// to Wikidata, since their datatypes (coordinate, time, media) need bespoke
// inputs that are out of scope for now.

export interface WikidataPropertyDef {
  id: string; // e.g. "P31"
  /** Key under the `wikidata.props` i18n namespace. */
  labelKey: string;
  /** Item-valued and editable in-app (false ⇒ read-only display). */
  editable: boolean;
}

export const CURATED_PROPERTIES: WikidataPropertyDef[] = [
  { id: "P31", labelKey: "instanceOf", editable: true },
  { id: "P131", labelKey: "locatedIn", editable: true },
  { id: "P17", labelKey: "country", editable: true },
  { id: "P276", labelKey: "location", editable: true },
  { id: "P189", labelKey: "locationOfDiscovery", editable: true },
  { id: "P361", labelKey: "partOf", editable: true },
  { id: "P195", labelKey: "collection", editable: true },
  { id: "P217", labelKey: "inventoryNumber", editable: false },
  { id: "P1435", labelKey: "heritageDesignation", editable: true },
  { id: "P571", labelKey: "inception", editable: false },
  { id: "P625", labelKey: "coordinates", editable: false },
  { id: "P18", labelKey: "image", editable: false },
];

/** Look up a curated property definition by P-id. */
export function curatedProperty(id: string): WikidataPropertyDef | undefined {
  return CURATED_PROPERTIES.find((p) => p.id === id);
}
