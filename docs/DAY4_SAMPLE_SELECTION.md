# Day 4 — representative sample records

This is the Day 4 deliverable from `TODO.md`: "Select 20-30 representative records across object types, hierarchies, complete, incomplete and unusual cases." It is manual data review, not application code — its output is raw material for Day 5 (mapping these columns onto the `docs/DATA_MODEL.md` fields) and Day 6 (normalisation, stable IDs and duplicate-detection rules).

The sample lives at [`data/sample/day4-representative-records.csv`](../data/sample/day4-representative-records.csv) — 25 real Latvian heritage objects selected from public sources. Fifteen records currently rely on English Wikipedia as their only cited source, while ten use tourism, museum or news sources. It is a candidate-selection artifact, not a verified or publishable dataset: nothing in it should be imported or displayed as-is without independent authoritative verification during Days 5–6.

## Why this file is not yet clean data

Per `docs/DATA_MODEL.md`'s data-quality rules, unknown values are left blank rather than guessed, inferred, or defaulted. That rule was followed strictly here, which is why the coverage looks uneven — that unevenness is the point: it is an honest preview of what Day 5/6 will actually need to handle, not a defect to silently fix before committing.

## Coverage achieved

- **Object types (25 total):** `palace_or_castle` 11, `manor_estate` 6, `manor_house` 3, `ruin_or_historical_site` 3, `park_or_garden` 1, `outbuilding` 1. `other_heritage_object` was not needed — the outbuilding and ruin/historical-site records already exercise the "beyond manor_estate" requirement.
- **Hierarchy links (2 parent → child links):** Rundāles pils → its park and its stables. `parent_object_id` values temporarily contain the parent slug until UUIDs exist. Cēsu and Siguldas medieval/new castles are deliberately left unlinked: they belong to the same complexes, but the newer manor buildings are not valid parents of the older castles. Day 6 must decide whether a separate complex/grouping relation is required.
- **A deliberate non-link:** Mežotnes pilskalns (an ancient hillfort) sits near Mežotnes pils but is **not** linked to it via `parent_object_id` — it predates the manor by centuries and is interpreted as a separate heritage trail. This is included on purpose, as a worked example of a hierarchy judgement call for Day 6 rather than something to "fix."
- **Completeness mix:** every record has identity, type, a research summary and at least one source, while deliberately uncertain coordinates, condition and ownership fields remain blank. This is realistic for the dataset Days 5–6 will face at scale; no record should yet be treated as publication-ready.
- **Unusual cases (~9 records):** disputed/variant family-name spelling (Alūksnes Jaunā pils: "Fittinghof" vs. "Vietinghoff" across sources); an infobox-vs-body-text condition conflict (Dundagas pils: "Preserved" tag contradicted by described fire damage); conflicting construction dates and even conflicting first names for the same noble in one source (Vecauces pils); ownership-in-flux records (Mežotnes pils facing a possible 2024 state sale; Kazdangas pils given roughly a year in 2025 to find a viable future before possible repatriation to the state); unexpected current uses (Vecauces pils as an active university research farm with a robotic dairy; Krimuldas muiža as a rehabilitation hospital); and an eight-family, four-century ownership chain at Lielstraupes pils that stress-tests the `historical_owner_families` many-to-many relation.

## Known limitations of this sample

English-language Wikipedia was the most consistently structured source, but it is not an authoritative primary source and accounts for 15 of the 25 rows. Tourism and news pages also describe use or presentation, not necessarily legal ownership or current structural condition. Days 5–6 must add source-quality levels, distinguish source access from factual verification and require an authoritative source before ownership, condition or cadastral data can be published.

This sample is small and English-source-biased by construction — it is meant to stress the data model's edge cases, not to statistically represent the full 5,000+ object collection. Day 5 should still pull a second, independently-selected batch directly from whatever existing dataset(s) the project already has, so the column mapping is grounded in the real source data's actual shape, not only in this hand-researched set.

## Column reference

The CSV resembles the target contract but is intentionally a research-stage file rather than a database export:

- `historical_owner_families` is a single semicolon-separated text column here, standing in for the real many-to-many relation described in the data model.
- `parent_object_id` holds a `slug` (e.g. `rundales-pils`) rather than a UUID, since no database rows exist yet; Day 6 should decide how slugs map to the real generated IDs during import.
- `summary_research_en` contains English research notes and must not be imported into the Latvian public field `summary_lv` without translation and editorial review.
- `source_accessed_at` records when the cited page was consulted; it is not equivalent to `last_verified_at` in the publication contract.

The controlled values in `object_type`, `condition_category` and `ownership_type` follow `docs/DATA_MODEL.md`. A blank cell means "unknown" — never "no" or a default.

## Cadastral cross-reference columns

The empty `cadastre_references` column is a staging placeholder. The canonical model uses a separate relation because Kadastrs distinguishes a property's cadastral number from land-unit, building and premises-group cadastral designations, and an estate may need several references. Values must come from an official lookup or dataset match; never derive them from approximate coordinates.
