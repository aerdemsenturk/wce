import { describe, it, expect } from "vitest";
import {
  stripWikiMarkup,
  stripHtml,
  parseLocation,
  parseInformation,
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

// A realistic file page, used as the baseline for the in-place patch tests.
// The assertions below all check that editing one field leaves every other
// field (and the categories/location) byte-for-byte intact.
const SAMPLE = `{{Information
|description={{en|1=A tabby cat}}{{tr|1=Bir tekir kedi}}
|date=2020-01-01
|source={{own}}
|author=[[User:Jane|Jane]]
|permission=
}}
{{Location|41.0082|28.9784}}
[[Category:Cats]]
[[Category:Animals|Felix]]
`;

describe("stripWikiMarkup", () => {
  it("unwraps wiki links to their display text", () => {
    expect(stripWikiMarkup("[[User:Jane|Jane]]")).toBe("Jane");
    expect(stripWikiMarkup("[[Foo|Bar]]")).toBe("Bar");
    expect(stripWikiMarkup("[[Foo]]")).toBe("Foo");
  });

  it("unwraps external links to their label", () => {
    expect(stripWikiMarkup("[https://example.com label here]")).toBe("label here");
  });

  it("drops template braces, keeping the first token", () => {
    expect(stripWikiMarkup("{{own}}")).toBe("own");
  });

  it("removes bold/italic apostrophes and trims", () => {
    expect(stripWikiMarkup("  '''bold''' and ''italic''  ")).toBe("bold and italic");
  });
});

describe("stripHtml", () => {
  it("removes tags and decodes common entities", () => {
    expect(stripHtml("<p>a&amp;b</p>")).toBe("a&b");
    expect(stripHtml("x&nbsp;&lt;y&gt;&quot;z&quot;")).toBe('x <y>"z"');
  });

  it("collapses runs of whitespace", () => {
    expect(stripHtml("a   \n  b")).toBe("a b");
  });
});

describe("parseLocation", () => {
  it("reads {{Location}} coordinates", () => {
    expect(parseLocation("{{Location|41.0|29.0}}")).toEqual({ lat: 41, lon: 29 });
  });

  it("reads {{Location dec}} and {{Object location}}", () => {
    expect(parseLocation("{{Location dec|1.5|-2.5}}")).toEqual({ lat: 1.5, lon: -2.5 });
    expect(parseLocation("{{Object location|10|20}}")).toEqual({ lat: 10, lon: 20 });
  });

  it("returns null when there is no location template", () => {
    expect(parseLocation("[[Category:Cats]]")).toBeNull();
  });
});

describe("parseInformation", () => {
  it("parses every field plus the location of a typical file page", () => {
    const info = parseInformation(SAMPLE);
    expect(info.descriptions).toEqual([
      { lang: "en", value: "A tabby cat" },
      { lang: "tr", value: "Bir tekir kedi" },
    ]);
    expect(info.date).toBe("2020-01-01");
    expect(info.source).toBe("own");
    expect(info.author).toBe("Jane");
    expect(info.permission).toBeNull();
    expect(info.coordinates).toEqual({ lat: 41.0082, lon: 28.9784 });
  });

  it("treats a description with no language template as undetermined", () => {
    const info = parseInformation("{{Information|description=Just plain text}}");
    expect(info.descriptions).toEqual([{ lang: "und", value: "Just plain text" }]);
  });

  it("returns empty/null fields when there is no Information template", () => {
    const info = parseInformation("[[Category:Cats]]");
    expect(info.descriptions).toEqual([]);
    expect(info.date).toBeNull();
    expect(info.author).toBeNull();
  });
});

describe("withUpdatedDescription", () => {
  it("replaces an existing language block in place, leaving others untouched", () => {
    const out = withUpdatedDescription(SAMPLE, "en", "A ginger cat");
    expect(out).not.toBeNull();
    expect(out).toContain("{{en|1=A ginger cat}}");
    // The other language and every non-description field survive verbatim.
    expect(out).toContain("{{tr|1=Bir tekir kedi}}");
    expect(out).toContain("|date=2020-01-01");
    expect(out).toContain("[[Category:Animals|Felix]]");
    expect(out).toContain("{{Location|41.0082|28.9784}}");
  });

  it("appends a new language block when that language is absent", () => {
    const out = withUpdatedDescription(SAMPLE, "de", "Eine Katze");
    expect(out).toContain("{{en|1=A tabby cat}}");
    expect(out).toContain("{{de|1=Eine Katze}}");
  });

  it("escapes pipe characters so they can't break the template", () => {
    const out = withUpdatedDescription(SAMPLE, "en", "a | b");
    expect(out).toContain("{{en|1=a {{!}} b}}");
  });

  it("returns null when there is no Information description to patch", () => {
    expect(withUpdatedDescription("[[Category:Cats]]", "en", "x")).toBeNull();
  });
});

describe("withUpdatedLocation", () => {
  it("replaces an existing location template in place", () => {
    const out = withUpdatedLocation(SAMPLE, 1.25, 2.5);
    expect(out).toContain("{{Location dec|1.25|2.5}}");
    expect(out).not.toContain("{{Location|41.0082|28.9784}}");
    // Categories untouched.
    expect(out).toContain("[[Category:Cats]]");
  });

  it("inserts after the Information template when the page has no location", () => {
    const noLoc = "{{Information|description={{en|1=x}}}}\n[[Category:Cats]]\n";
    const out = withUpdatedLocation(noLoc, 5, 6);
    expect(out).toContain("}}\n{{Location dec|5|6}}");
    expect(out.indexOf("{{Location dec")).toBeLessThan(out.indexOf("[[Category:Cats]]"));
  });

  it("prepends when there is neither location nor Information template", () => {
    const out = withUpdatedLocation("[[Category:Cats]]\n", 5, 6);
    expect(out).toBe("{{Location dec|5|6}}\n[[Category:Cats]]\n");
  });
});

describe("withRemovedLocation", () => {
  it("removes the location template and its trailing newline", () => {
    const out = withRemovedLocation(SAMPLE);
    expect(out).not.toBeNull();
    expect(out).not.toContain("Location");
    // The surrounding content is preserved and not left with blank-line gaps.
    expect(out).toContain("[[Category:Cats]]");
    expect(out).not.toMatch(/\n{3,}/);
  });

  it("returns null when there is no location template", () => {
    expect(withRemovedLocation("[[Category:Cats]]\n")).toBeNull();
  });
});

describe("withMovedCategory", () => {
  it("rewrites a category link, preserving the sort key", () => {
    const out = withMovedCategory(SAMPLE, "Animals", "Mammals");
    expect(out).toContain("[[Category:Mammals|Felix]]");
    expect(out).not.toContain("[[Category:Animals|Felix]]");
    // The other category is left alone.
    expect(out).toContain("[[Category:Cats]]");
  });

  it("moves a category that has no sort key", () => {
    const out = withMovedCategory(SAMPLE, "Cats", "Felines");
    expect(out).toContain("[[Category:Felines]]");
    expect(out).not.toContain("[[Category:Cats]]");
  });

  it("matches namespace and spacing case-insensitively", () => {
    const out = withMovedCategory("[[category: Cats ]]", "Cats", "Dogs");
    expect(out).toBe("[[Category:Dogs]]");
  });

  it("handles category names with regex-special characters", () => {
    const wt = "[[Category:Foo (bar)]]\n";
    const out = withMovedCategory(wt, "Foo (bar)", "Baz");
    expect(out).toBe("[[Category:Baz]]\n");
  });

  it("returns null when the source category isn't linked", () => {
    expect(withMovedCategory(SAMPLE, "Birds", "Dogs")).toBeNull();
  });
});

describe("withRemovedCategory", () => {
  it("removes a category link and its trailing newline", () => {
    const out = withRemovedCategory(SAMPLE, "Cats");
    expect(out).not.toBeNull();
    expect(out).not.toContain("[[Category:Cats]]");
    expect(out).toContain("[[Category:Animals|Felix]]");
    expect(out).not.toMatch(/\n{3,}/);
  });

  it("returns null when the category isn't linked", () => {
    expect(withRemovedCategory(SAMPLE, "Birds")).toBeNull();
  });
});

describe("withAddedCategory", () => {
  it("appends a new category link at the end", () => {
    const out = withAddedCategory("[[Category:Cats]]\n", "Dogs");
    expect(out).toBe("[[Category:Cats]]\n[[Category:Dogs]]\n");
  });
});

describe("withDeletionNomination", () => {
  it("prepends a {{delete}} tag with an escaped reason and the given date", () => {
    const out = withDeletionNomination(
      "[[Category:Cats]]\n",
      "out of scope | dupe",
      new Date("2026-06-27T12:00:00Z"),
    );
    expect(out).toBe(
      "{{delete|1=out of scope {{!}} dupe|day=27|month=June|year=2026}}\n[[Category:Cats]]\n",
    );
  });
});

describe("buildDeletionRequestSubpage", () => {
  it("builds a {{subst:delete2}} call with the file and escaped reason", () => {
    const out = buildDeletionRequestSubpage("File:Foo.jpg", "out of scope | dupe");
    expect(out).toBe(
      "{{subst:delete2|image=File:Foo.jpg|reason=out of scope {{!}} dupe --~~~~}}",
    );
  });
});

describe("buildUploaderNotice", () => {
  it("builds an {{subst:idw}} notice for the given file", () => {
    const out = buildUploaderNotice("File:Foo.jpg");
    expect(out).toBe("\n\n== Deletion request notice ==\n{{subst:idw|File:Foo.jpg}} ~~~~");
  });
});

describe("buildNewCategoryWikitext", () => {
  it("emits just the parent category link", () => {
    expect(buildNewCategoryWikitext("Cats")).toBe("[[Category:Cats]]\n");
  });
});

describe("parseWikidataQid", () => {
  it("reads the qid out of a {{Wikidata Infobox}} note", () => {
    expect(parseWikidataQid("{{Wikidata Infobox|qid=Q146}}\n[[Category:Cats]]")).toBe("Q146");
  });

  it("returns null when there is no infobox note", () => {
    expect(parseWikidataQid("[[Category:Cats]]")).toBeNull();
  });
});
