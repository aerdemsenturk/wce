import { describe, it, expect } from "vitest";
import { overlayWikidataStatements, type PendingChange } from "./pendingChanges";
import type { WikidataPropertyStatements } from "./types";

const BASE: WikidataPropertyStatements[] = [
  {
    property: "P31",
    values: [{ statementId: "Q42$abc", kind: "item", itemId: "Q5", label: "human" }],
  },
];

function addChange(over: Partial<Extract<PendingChange, { type: "addWikidataStatement" }>> = {}): PendingChange {
  return {
    id: "c1",
    type: "addWikidataStatement",
    qid: "Q42",
    category: "Cats",
    property: "P31",
    valueQid: "Q146",
    valueLabel: "house cat",
    label: "add",
    ...over,
  };
}

describe("overlayWikidataStatements", () => {
  it("appends a pending value to an existing property group", () => {
    const out = overlayWikidataStatements("Q42", BASE, [addChange()]);
    const p31 = out.find((g) => g.property === "P31")!;
    expect(p31.values).toHaveLength(2);
    expect(p31.values[1]).toEqual({
      statementId: "pending",
      kind: "item",
      itemId: "Q146",
      label: "house cat",
    });
  });

  it("creates a new property group when the property is absent", () => {
    const out = overlayWikidataStatements("Q42", BASE, [
      addChange({ property: "P17", valueQid: "Q43", valueLabel: "Turkey" }),
    ]);
    expect(out.find((g) => g.property === "P17")?.values[0].itemId).toBe("Q43");
  });

  it("does not duplicate a value already present in the base", () => {
    const out = overlayWikidataStatements("Q42", BASE, [addChange({ valueQid: "Q5" })]);
    expect(out.find((g) => g.property === "P31")!.values).toHaveLength(1);
  });

  it("ignores changes scoped to a different item", () => {
    const out = overlayWikidataStatements("Q42", BASE, [addChange({ qid: "Q999" })]);
    expect(out).toEqual(BASE);
  });

  it("removes a value by statement id and drops the group when it empties", () => {
    const out = overlayWikidataStatements("Q42", BASE, [
      {
        id: "r1",
        type: "removeWikidataStatement",
        qid: "Q42",
        category: "Cats",
        property: "P31",
        statementId: "Q42$abc",
        valueLabel: "human",
        label: "remove",
      },
    ]);
    expect(out).toEqual([]);
  });

  it("does not mutate the base array", () => {
    const snapshot = JSON.parse(JSON.stringify(BASE));
    overlayWikidataStatements("Q42", BASE, [addChange()]);
    expect(BASE).toEqual(snapshot);
  });
});
