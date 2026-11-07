import { describe, expect, it } from "vitest";
import {
  classifyScope,
  collapsePost,
  decideScopeConfirmed,
  extractPrimaryName,
  findManorAffiliationPhrase,
  isOutsideLatviaBbox,
  parseCoordinates,
  resolveSlugCollisions,
  scanKeywordGroups,
  slugify,
  transliterate,
} from "./rawDatasetTransform";
import type { RawBlogImageRow } from "./rawDatasetTypes";

function row(overrides: Partial<RawBlogImageRow>): RawBlogImageRow {
  return {
    sourceRowNumber: 1,
    postId: "1",
    title: "Test muiža",
    postUrl: "https://example.com/post",
    driveFilename: "",
    driveUrl: "",
    originalImageUrl: "",
    address: "",
    coordinates: "",
    caption: "",
    bodyText: "",
    ...overrides,
  };
}

describe("scanKeywordGroups", () => {
  it("matches manor titles", () => {
    expect(scanKeywordGroups("Ģibotu muiža (Gibdorn, Gibati)")).toContain("manor");
  });

  it("matches standalone pils but not place names ending in -pils", () => {
    expect(scanKeywordGroups("Rundāles pils")).toContain("palace_or_castle_or_hillfort");
    expect(scanKeywordGroups("Senā pils Siguldā")).toContain("palace_or_castle_or_hillfort");
    expect(scanKeywordGroups("Ventspils vēsture")).toEqual([]);
    expect(scanKeywordGroups("Jēkabpils tilts")).toContain("bridge");
    expect(scanKeywordGroups("Jēkabpils tilts")).not.toContain("palace_or_castle_or_hillfort");
    expect(scanKeywordGroups("Mālpils skola")).not.toContain("palace_or_castle_or_hillfort");
  });

  it("matches the other documented keyword groups", () => {
    expect(scanKeywordGroups("Kalna baznīca")).toContain("church");
    expect(scanKeywordGroups("Vecā dzirnavas")).toContain("mill");
    expect(scanKeywordGroups("Pagasta skola")).toContain("school");
    expect(scanKeywordGroups("Vecie kapi")).toContain("cemetery");
    expect(scanKeywordGroups("Dzelzceļa stacija")).toContain("station");
    expect(scanKeywordGroups("Senais tilts")).toContain("bridge");
    expect(scanKeywordGroups("Pilsdrupas pie upes")).toContain("palace_or_castle_or_hillfort");
    expect(scanKeywordGroups("Senas drupas")).toContain("ruin");
  });

  it("returns no groups and allows overlapping matches", () => {
    expect(scanKeywordGroups("Kaut kas pavisam cits")).toEqual([]);
    const overlap = scanKeywordGroups("Muižas skola pie pils");
    expect(overlap).toContain("manor");
    expect(overlap).toContain("school");
    expect(overlap).toContain("palace_or_castle_or_hillfort");
  });
});

describe("classifyScope", () => {
  it("prefers in-scope when any in-scope group matched, even with overlap", () => {
    expect(classifyScope(["manor", "school"])).toBe("in_scope_candidate");
    expect(classifyScope(["palace_or_castle_or_hillfort"])).toBe("in_scope_candidate");
  });

  it("proposes out-of-scope only when no in-scope group matched", () => {
    expect(classifyScope(["school", "church"])).toBe("out_of_scope_candidate");
  });

  it("is ambiguous when no keyword group matched at all", () => {
    expect(classifyScope([])).toBe("ambiguous_no_keyword_match");
  });
});

describe("findManorAffiliationPhrase", () => {
  it("matches an explicit manor-complex-membership phrase", () => {
    expect(findManorAffiliationPhrase("Šis ir muižas komplekss.")).not.toBeNull();
    expect(findManorAffiliationPhrase("Dzirnavas, kas piederēja muižai.")).not.toBeNull();
    expect(findManorAffiliationPhrase("Tā ir bijušās muižas klēts.")).not.toBeNull();
    expect(findManorAffiliationPhrase("Šeit atrodas muižas pils.")).not.toBeNull();
  });

  it("does not match mere proximity to a manor", () => {
    expect(findManorAffiliationPhrase("Ēka atrodas uz dienvidiem no muižas.")).toBeNull();
    expect(findManorAffiliationPhrase("Netālu no muižas ir šī ēka.")).toBeNull();
    expect(findManorAffiliationPhrase("Nekas te nav pieminēts.")).toBeNull();
  });

  it("does not let the 'pils' phrase swallow an unrelated word like the toponym Pilskalne", () => {
    // "Pilskalnes muižnieks" is "[the] Pilskalne [manor's] nobleman" - a
    // place name plus an unrelated noun, not the "pils muižas"/"muižas
    // pils" two-word phrase this pattern is meant to catch.
    expect(findManorAffiliationPhrase("Pilskalnes muižnieks bija zināma persona.")).toBeNull();
  });

  it("still matches the genuine two-word 'pils muižas' / 'muižas pils' phrase", () => {
    expect(findManorAffiliationPhrase("Šeit bija fon Zīversa pils muižu.")).not.toBeNull();
    expect(findManorAffiliationPhrase("Šeit atrodas muižas pils.")).not.toBeNull();
  });

  it("returns the matched phrase text, not just a boolean", () => {
    const phrase = findManorAffiliationPhrase("Šis ir muižas komplekss.");
    expect(phrase).toBe("muižas komplekss");
  });
});

describe("decideScopeConfirmed", () => {
  it("decides in_scope via title_keyword when the title triage already says in-scope", () => {
    const result = decideScopeConfirmed("in_scope_candidate", "irrelevant body text");
    expect(result).toEqual({
      decision: "in_scope",
      basis: "title_keyword",
      bodyTextAffiliationPhraseMatched: null,
    });
  });

  it("reclassifies to in_scope via a body-text affiliation phrase when the title alone did not match", () => {
    const result = decideScopeConfirmed(
      "out_of_scope_candidate",
      "Šī skola ir bijušās muižas ēka.",
    );
    expect(result.decision).toBe("in_scope");
    expect(result.basis).toBe("body_text_affiliation_phrase");
    expect(result.bodyTextAffiliationPhraseMatched).not.toBeNull();
  });

  it("reclassifies an ambiguous title to in_scope via a body-text affiliation phrase", () => {
    const result = decideScopeConfirmed("ambiguous_no_keyword_match", "Ēka, kas piederēja muižai.");
    expect(result.decision).toBe("in_scope");
    expect(result.basis).toBe("body_text_affiliation_phrase");
  });

  it("archives when neither the title nor the body text gives a signal", () => {
    const result = decideScopeConfirmed("out_of_scope_candidate", "Vienkārši vecā skola.");
    expect(result).toEqual({
      decision: "archived_out_of_scope",
      basis: "no_signal_found",
      bodyTextAffiliationPhraseMatched: null,
    });
  });

  it("archives when there is no body text at all and the title didn't match", () => {
    const result = decideScopeConfirmed("ambiguous_no_keyword_match", null);
    expect(result.decision).toBe("archived_out_of_scope");
    expect(result.basis).toBe("no_signal_found");
  });
});

describe("extractPrimaryName", () => {
  it("extracts prefix, alternates and a trailing location hint", () => {
    const result = extractPrimaryName("Bērzu muiža (Bērzmuiža, Bērziņu muiža, Bershof) Bikstos");
    expect(result.primaryName).toBe("Bērzu muiža");
    expect(result.alternateNames).toEqual(["Bērzmuiža", "Bērziņu muiža", "Bershof"]);
    expect(result.locationHint).toBe("Bikstos");
    expect(result.ambiguousParentheses).toBe(false);
  });

  it("keeps the full title, NOT flagged as ambiguous, when there is no parenthetical group at all", () => {
    // Per docs/DAY6_NORMALIZATION_RULES.md section 2's own worked-example
    // table, a title with no "(...)" at all is a normal, common shape, not
    // a defect to queue for manual review - see the extractPrimaryName
    // doc comment and docs/DAY11_DRY_RUN_NOTES.md decision 11.
    const result = extractPrimaryName(
      'Dzelzceļa tilts pie bijušās stacijas "Ozoli" Limbažu novadā',
    );
    expect(result.primaryName).toBe('Dzelzceļa tilts pie bijušās stacijas "Ozoli" Limbažu novadā');
    expect(result.alternateNames).toEqual([]);
    expect(result.locationHint).toBeNull();
    expect(result.ambiguousParentheses).toBe(false);
  });

  it("flags a leading parenthetical group as ambiguous and keeps the full title", () => {
    const result = extractPrimaryName("(Alternate name) Main title");
    expect(result.primaryName).toBe("(Alternate name) Main title");
    expect(result.ambiguousParentheses).toBe(true);
  });

  it("flags an unbalanced parenthetical group as ambiguous and keeps the full title", () => {
    // Regression test for a Day 11 Codex review finding: this used to
    // return ambiguousParentheses: false, identical to the ordinary
    // no-parentheses case, because firstBalancedParenGroup() couldn't tell
    // "never opened" apart from "opened but never closed".
    const result = extractPrimaryName("Some title (unbalanced");
    expect(result.ambiguousParentheses).toBe(true);
    expect(result.primaryName).toBe("Some title (unbalanced");
    expect(result.alternateNames).toEqual([]);
    expect(result.locationHint).toBeNull();
  });

  it("distinguishes an unbalanced group from an ordinary title with no parentheses", () => {
    const noParens = extractPrimaryName("Veca skola Rīgā");
    const unbalanced = extractPrimaryName("Veca skola (Rīgā");
    expect(noParens.ambiguousParentheses).toBe(false);
    expect(unbalanced.ambiguousParentheses).toBe(true);
  });
});

describe("transliterate / slugify", () => {
  it.each([
    ["Ģibotu muiža", "gibotu-muiza"],
    ["Aijažu muiža", "aijazu-muiza"],
    ["Bērzu muiža", "berzu-muiza"],
    ["Maisakrogs", "maisakrogs"],
    ["Grāvendāles skola", "gravendales-skola"],
  ])("slugifies %s to %s", (name, expected) => {
    expect(slugify(name)).toBe(expected);
  });

  it("transliterates all documented diacritics", () => {
    expect(transliterate("āčēģīķļņšūž")).toBe("acegikln" + "s" + "uz");
  });
});

describe("resolveSlugCollisions", () => {
  it("keeps a unique base slug as-is", () => {
    const result = resolveSlugCollisions([
      { externalSourceId: "1", primaryName: "Unique Manor", locationHint: null },
    ]);
    expect(result.get("1")).toBe("unique-manor");
  });

  it("disambiguates colliding base slugs with the location hint, then external id", () => {
    const result = resolveSlugCollisions([
      { externalSourceId: "100", primaryName: "Bērzu muiža", locationHint: "Bikstos" },
      { externalSourceId: "200", primaryName: "Bērzu muiža", locationHint: null },
    ]);
    expect(result.get("100")).toBe("berzu-muiza-bikstos");
    expect(result.get("200")).toBe("berzu-muiza-200");
  });

  it("produces the same assignment regardless of input order", () => {
    const inputs = [
      { externalSourceId: "100", primaryName: "Bērzu muiža", locationHint: "Bikstos" },
      { externalSourceId: "200", primaryName: "Bērzu muiža", locationHint: "Bikstos" },
      { externalSourceId: "50", primaryName: "Something else", locationHint: null },
    ];
    const forward = resolveSlugCollisions(inputs);
    const reversed = resolveSlugCollisions([...inputs].reverse());
    expect([...forward.entries()].sort()).toEqual([...reversed.entries()].sort());
  });

  // Regression tests for a Day 11 Codex review finding: a collision-derived
  // slug could collide with an unrelated record's own unique base slug.
  it("never lets a collision-derived slug collide with an unrelated record's unique base slug", () => {
    // "Foo" + location "Bar" would naturally derive "foo-bar" - but a
    // separate, unrelated "Foo Bar" record's own unique base slug is also
    // literally "foo-bar". The unrelated record must keep "foo-bar"; the
    // colliding "Foo" record must get pushed to a different slug instead.
    const result = resolveSlugCollisions([
      { externalSourceId: "1", primaryName: "Foo", locationHint: "Bar" },
      { externalSourceId: "2", primaryName: "Foo", locationHint: "Baz" },
      { externalSourceId: "3", primaryName: "Foo Bar", locationHint: null },
    ]);

    const slugs = [...result.values()];
    expect(new Set(slugs).size).toBe(slugs.length); // every final slug is globally unique

    expect(result.get("3")).toBe("foo-bar"); // the unrelated unique base keeps the bare form
    expect(result.get("1")).not.toBe("foo-bar");
    expect(result.get("2")).toBe("foo-baz"); // unaffected: "foo-baz" was never contested
  });

  it("resolves the global-uniqueness scenario the same way regardless of input order", () => {
    const inputs = [
      { externalSourceId: "1", primaryName: "Foo", locationHint: "Bar" },
      { externalSourceId: "2", primaryName: "Foo", locationHint: "Baz" },
      { externalSourceId: "3", primaryName: "Foo Bar", locationHint: null },
    ];
    const forward = resolveSlugCollisions(inputs);
    const reversed = resolveSlugCollisions([...inputs].reverse());
    expect([...forward.entries()].sort()).toEqual([...reversed.entries()].sort());
  });

  it("falls back to an incrementing counter when both normal candidates are already reserved", () => {
    const result = resolveSlugCollisions([
      // Reserves "foo-bar" as a unique base slug.
      { externalSourceId: "reserve-a", primaryName: "Foo Bar", locationHint: null },
      // Reserves "foo-5" as a unique base slug.
      { externalSourceId: "reserve-b", primaryName: "Foo 5", locationHint: null },
      // Collision group on base "foo": record "5" wants "foo-bar" (hint
      // "Bar", reserved above) and would otherwise fall back to "foo-5"
      // (its own id-suffixed form, also reserved above) - both taken, so
      // it must fall through to the counter safety net.
      { externalSourceId: "5", primaryName: "Foo", locationHint: "Bar" },
      { externalSourceId: "6", primaryName: "Foo", locationHint: null },
    ]);

    const slugs = [...result.values()];
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(result.get("reserve-a")).toBe("foo-bar");
    expect(result.get("reserve-b")).toBe("foo-5");
    expect(result.get("5")).toBe("foo-5-2");
    expect(result.get("6")).toBe("foo-6");
  });
});

describe("parseCoordinates", () => {
  it("parses a normal lat,lng pair", () => {
    expect(parseCoordinates("56.9496, 24.1052")).toEqual({
      value: { latitude: 56.9496, longitude: 24.1052 },
      unparsedText: null,
    });
  });

  it("treats the placeholder and blank text as no value, not an error", () => {
    expect(parseCoordinates("Koordinātas nav atrastas")).toEqual({
      value: null,
      unparsedText: null,
    });
    expect(parseCoordinates("   ")).toEqual({ value: null, unparsedText: null });
  });

  it("flags genuinely unparseable non-placeholder text", () => {
    const result = parseCoordinates("somewhere near the river");
    expect(result.value).toBeNull();
    expect(result.unparsedText).toBe("somewhere near the river");
  });
});

describe("isOutsideLatviaBbox", () => {
  it("accepts a Riga-area point and rejects a Warsaw-area point", () => {
    expect(isOutsideLatviaBbox({ latitude: 56.9496, longitude: 24.1052 })).toBe(false);
    expect(isOutsideLatviaBbox({ latitude: 52.2297, longitude: 21.0122 })).toBe(true);
  });
});

describe("collapsePost", () => {
  it("prefers a real address/coordinate value over the placeholder found in another image row", () => {
    const rows = [
      row({ address: "Adrese nav atrasta", coordinates: "Koordinātas nav atrastas" }),
      row({ address: "Reāla adrese 1", coordinates: "56.9, 24.1" }),
    ];
    const post = collapsePost("1", rows, { sourceSystem: "manasvietas_blogspot" });
    expect(post.address).toBe("Reāla adrese 1");
    expect(post.addressVariantCount).toBe(2);
    expect(post.coordinates).toEqual({ latitude: 56.9, longitude: 24.1 });
  });

  it("stays null when every row for a post only has the placeholder", () => {
    const rows = [row({ address: "Adrese nav atrasta", coordinates: "Koordinātas nav atrastas" })];
    const post = collapsePost("1", rows, { sourceSystem: "manasvietas_blogspot" });
    expect(post.address).toBeNull();
    expect(post.coordinates).toBeNull();
    expect(post.issues).toContain("missing required field: address/municipality signal (Adrese)");
    expect(post.issues).toContain("missing required fields: latitude, longitude");
  });

  it("takes the longest non-placeholder body text variant and counts the distinct variants", () => {
    const rows = [
      row({ bodyText: "Short text." }),
      row({ bodyText: "A much longer and more detailed historical description." }),
      row({ bodyText: "Teksts nav atrasts." }),
    ];
    const post = collapsePost("1", rows, { sourceSystem: "manasvietas_blogspot" });
    expect(post.bodyText).toBe("A much longer and more detailed historical description.");
    expect(post.bodyTextVariantCount).toBe(3);
  });

  it("always flags the universally-unmapped required fields for this dataset", () => {
    const post = collapsePost("1", [row({})], { sourceSystem: "manasvietas_blogspot" });
    expect(post.issues).toContain(
      "missing required fields: object_type, summary_lv, last_verified_at, municipality",
    );
    expect(post.proposedStatus).toBe("needs_review");
    expect(post.proposedStatusPendingConfirmation).toBe(false);
  });

  it("confirms archived_out_of_scope for an out-of-scope title with no body-text affiliation signal", () => {
    const post = collapsePost(
      "1",
      [row({ title: "Vecā pagasta skola", bodyText: "Vienkārši vecā skola pagastā." })],
      { sourceSystem: "manasvietas_blogspot" },
    );
    expect(post.scopeTriage).toBe("out_of_scope_candidate");
    expect(post.scopeDecision).toBe("archived_out_of_scope");
    expect(post.scopeDecisionBasis).toBe("no_signal_found");
    expect(post.proposedStatus).toBe("archived_out_of_scope");
    expect(post.proposedStatusPendingConfirmation).toBe(false);
  });

  it("reclassifies an out-of-scope title to in_scope when the body text names manor-complex membership", () => {
    const post = collapsePost(
      "1",
      [row({ title: "Vecā pagasta skola", bodyText: "Skola, kas ir bijušās muižas ēka." })],
      { sourceSystem: "manasvietas_blogspot" },
    );
    expect(post.scopeTriage).toBe("out_of_scope_candidate");
    expect(post.scopeDecision).toBe("in_scope");
    expect(post.scopeDecisionBasis).toBe("body_text_affiliation_phrase");
    expect(post.bodyTextAffiliationPhraseMatched).not.toBeNull();
    expect(post.proposedStatus).toBe("needs_review");
    expect(
      post.issues.some((issue) =>
        issue.startsWith("scope decision: in_scope via body-text phrase"),
      ),
    ).toBe(true);
  });

  it("confirms in_scope via title_keyword for an in-scope title, regardless of body text", () => {
    const post = collapsePost("1", [row({ title: "Bērzu muiža" })], {
      sourceSystem: "manasvietas_blogspot",
    });
    expect(post.scopeTriage).toBe("in_scope_candidate");
    expect(post.scopeDecision).toBe("in_scope");
    expect(post.scopeDecisionBasis).toBe("title_keyword");
    expect(post.bodyTextAffiliationPhraseMatched).toBeNull();
  });

  it("extracts a Google Drive file id from the drive hyperlink when present", () => {
    const post = collapsePost(
      "1",
      [row({ driveUrl: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view" })],
      { sourceSystem: "manasvietas_blogspot" },
    );
    expect(post.images[0].externalImageId).toBe("1AbCdEfGhIjKlMnOp");
    expect(post.images[0].externalImageIdSource).toBe("drive_file_id");
  });

  it("falls back to the original image URL, then a content hash, when no drive id is present", () => {
    const withOriginal = collapsePost(
      "1",
      [row({ originalImageUrl: "https://blog.example/img.jpg" })],
      {
        sourceSystem: "manasvietas_blogspot",
      },
    );
    expect(withOriginal.images[0].externalImageIdSource).toBe("original_url");

    const withNeither = collapsePost("1", [row({})], { sourceSystem: "manasvietas_blogspot" });
    expect(withNeither.images[0].externalImageIdSource).toBe("content_hash");
    expect(withNeither.images[0].externalImageId).toHaveLength(16);
  });
});
