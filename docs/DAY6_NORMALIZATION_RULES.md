# Day 6 — import scope, normalisation and rejection rules

This is the Day 6 deliverable from `TODO.md`: using `docs/DAY5_COLUMN_MAPPING.md` (Codex's independently verified source profile) as the input, define the import scope, stable-ID and slug rules, row-collapse precedence, duplicate detection, rejected-row handling, and the future per-image relation. Per `TODO.md`'s explicit instruction, this document defines rules only — no migration, importer code or generated rows. Day 7 onward may implement against it.

## 1. Import scope: manors and their affiliated structures, not the full heritage blog

`docs/MVP_SCOPE.md` already defines the product as a **manor-estate directory** ("Manor directory," "Manor detail pages," filters keyed to manor condition/ownership) for visitors, event organisers, buyers and agents — not a general Latvian heritage-sites catalogue. Day 5 found that only about 45% of the 3,716 source posts are manor-titled (`muiž*`), and that churches, mills, schools, cemeteries, stations, bridges and an unclassified 21.2% make up the rest. This mismatch is resolved by scope, not by widening the product:

- **In scope for v1 import:** posts naming a manor estate (`muiž*`), a palace/castle (`pils`, excluding place names like Ventspils/Jēkabpils/Mālpils, as Day 5's word-boundary fix already does), a historical-site ruin or hillfort (`pilsdrupas`, `pilskalns`, `drupas`), and any post whose body text (`Posta sekojošais teksts`) identifies it as a structure within a manor's own grounds or complex — its park, stable, chapel, mill, school or similar outbuilding — even when its title alone would not suggest a manor (for example, Rundāle's own stables or French garden from the Day 4 sample).
- **Out of scope for v1 import, kept in the source archive only:** independent churches, schools, mills, bridges, cemeteries, railway stations, taverns (`krogs`), natural landmarks (rock outcrops/`iezis`), war memorials and similar sites that are not part of a manor complex. These are real, useful data — just for a different product than the one `docs/MVP_SCOPE.md` currently defines. Nothing is deleted; see the archive rule in §5.
- **Title keywords are a triage aid only, never the final classification.** Day 5 found 112 posts matching more than one keyword group and 787 (21.2%) matching none, so a keyword alone cannot decide in-scope vs. out-of-scope or assign `object_type`. Every candidate post must get a one-time human object-type/scope decision before publish — the same discipline `docs/DATA_MODEL.md` already requires for condition and ownership ("Do not infer condition, ownership or commercial services from photographs or old descriptions") extends naturally to this classification too. Keyword matches only generate the review queue; they do not populate `object_type` directly.
- This scope line is a product decision, not a permanent one. If the product later broadens past manors, the archived out-of-scope posts are already mapped (per Day 5) and ready to reconsider without re-scraping anything.

## 2. Stable identity and slug generation

- **Import key (unchanged from Day 5):** `source_system = manasvietas_blogspot`, `external_source_id = Bloga ieraksta Nr.` — confirmed permanent by the dataset owner, zero collisions across 3,716 posts.
- **Primary name extraction:** `name_lv` is derived, not copied verbatim, from `Bloga posta nosaukums`. When a title has a non-empty prefix followed by a complete first parenthetical group, use the trimmed prefix as the primary-name candidate. Treat comma-separated names inside that group as alternate-name candidates, not verified facts. If the parentheses are missing, unbalanced or ambiguous, retain the full title as the candidate and queue it for review. Always keep the exact source title in the raw archive.
- **Trailing location qualifiers are retained, not discarded.** Several titles follow the pattern `Name (alternates) Parish/Municipality`, e.g. `Bērzu muiža (Bērzmuiža, Bērziņu muiža, Bershof) Bikstos` or `Maisakrogs (Maisa krogs, Maisu krogs) Jaunbērzes pagastā`. Text after the closing `)` is a `location_hint`, not part of `name_lv`. It may help disambiguation, but must not automatically populate the current `municipality`: a village, historical district or former municipality is not necessarily the present municipality.
- **Alternate-name relation for Day 8:** preserve name candidates in `object_names` with `object_id`, `name`, `name_type` (`alternate` or `historical`), nullable `language_code`, `verification_status` (`unverified` or `verified`), nullable `source_url` and nullable `verified_at`. Do not add a candidate to public search as verified history merely because it appeared in parentheses.
- **Slug algorithm:** transliterate the primary name's Latvian diacritics to ASCII (ā→a, č→c, ē→e, ģ→g, ī→i, ķ→k, ļ→l, ņ→n, š→s, ū→u, ž→z), lowercase, replace runs of non-alphanumeric characters with a single hyphen, trim leading/trailing hyphens. Worked examples against real titles from the dataset:

  | Source title (`Bloga posta nosaukums`)                                                 | Primary name        | Generated slug            |
  | -------------------------------------------------------------------------------------- | ------------------- | ------------------------- |
  | `Ģibotu muiža (Gibdorn, Gibati)`                                                       | `Ģibotu muiža`      | `gibotu-muiza`            |
  | `Aijažu muiža (Ayasch, Ayzell)`                                                        | `Aijažu muiža`      | `aijazu-muiza`            |
  | `Bērzu muiža (Bērzmuiža, Bērziņu muiža, Bershof) Bikstos`                              | `Bērzu muiža`       | `berzu-muiza`             |
  | `Maisakrogs (Maisa krogs, Maisu krogs) Jaunbērzes pagastā`                             | `Maisakrogs`        | `maisakrogs`              |
  | `Grāvendāles skola (Pārupes skola) Rundāles novadā`                                    | `Grāvendāles skola` | `gravendales-skola`       |
  | `Dzelzceļa tilts pie bijušās stacijas "Ozoli" Limbažu novadā` (no parenthetical group) | full title          | `dzelzcela-tilts-pie-...` |

- **Deterministic collision rule:** calculate base slugs for the complete candidate set before batched writes. A base slug that occurs once keeps the base form. For every member of a colliding group, append its reviewed `location_hint` token when available (e.g. `berzu-muiza-bikstos`); if a slug remains duplicated or has no usable location hint, append the permanent `external_source_id`. Never award the bare slug to whichever row happened to import first: batch size, order and interrupted/resumed runs must produce the same result. Persist the assigned slug and reuse it on later imports.
- **Slugs are immutable once published.** A later name correction changes `name_lv`, never `slug`, matching `docs/DATA_MODEL.md`'s existing rule that "a changed name must not create a second record."

## 3. Row-collapse precedence (within one post)

Each post's 1–56 image rows must collapse into exactly one heritage-object record plus N per-image child records. Rules per field, ordered by how Day 5 found that field actually behaves:

- **Title (`Bloga posta nosaukums`):** identical across every image row of a post in all 3,716 cases (Day 5 found 0 inconsistent). No precedence rule needed.
- **`Adrese`, `Koordinātas`:** Day 5 found these only disagree within a post as a real-value-vs-`*nav atrast*`-placeholder pattern (2 posts for address, 4 for coordinates), never two different real values. Rule: **take any non-placeholder value found in any of the post's rows**; only fall back to null when every row for that post holds the placeholder. This matches Day 5's own "Summary for Day 6" guidance and is why 505 of 509 coordinate-placeholder posts and 26 of 28 address-placeholder posts remain genuinely unresolved after collapsing — those have no real value in any row, not a collapse failure.
- **`Posta sekojošais teksts`:** 12 posts have inconsistent body text across their own image rows, and unlike address/coordinates this is not simply placeholder-vs-real — the text is free-form narrative, so two different rows can legitimately both be "real" (e.g. text extended or revised as the blog post was edited over time). Rule: **take the longest non-placeholder value** as `source_body_text`, but do not publish it automatically as `summary_lv`. Log every distinct variant in the review log (§5); an editor must produce or approve the factual public summary.
- **Per-image columns (`Attēla nosaukums Drive`, `Hipersaite Google Drive`, `Attēla oriģinālā saite blogā`, `Attēla paraksts`):** do not collapse — each unique source image becomes one child record (§6). Extract the Google Drive file ID from a normalised Drive URL and use it as the preferred per-image external identifier. If it is absent, use a normalised original-source URL; if neither exists, retain the row for review and use a deterministic content hash. The export's `Nr.` is ordering metadata, never permanent identity.

## 4. Duplicate detection across posts (not within a post)

Day 5 confirmed zero duplicate `Bloga ieraksta Nr.` values and zero duplicate exact titles across all 3,716 posts, so the import key itself cannot produce accidental duplicate objects. The remaining risk is two _different_ posts describing the _same physical place_ — for example, a manor and a separately blogged post about its own park or stables, which should become a `parent_object_id` link (as in the Day 4 sample's Rundāle palace/park/stables trio), not two unrelated objects, and not a merge either.

- **Duplicate candidates (never auto-merge):** flag two in-scope posts when their normalised primary names match after diacritic/case folding, or when both name and coordinates indicate the same physical object. These go to a duplicate-review queue.
- **Relationship candidates:** separately flag objects within 500 metres of each other for possible estate-complex or parent/child relationships. Proximity alone is not evidence of duplication: parks, houses, stables and neighbouring sites legitimately cluster. Keeping this queue separate prevents valid components from being reviewed as probable duplicates.
- **Resolution is manual, same method as Day 4.** A human reviewer decides, per flagged pair, whether it is the same object (reject the newer post as a duplicate, keeping the better-sourced one), a parent/child relationship (link via `parent_object_id`, per `docs/DATA_MODEL.md`'s cycle-forbidden rule), or two legitimately separate objects near each other (no link). This dataset's scale (a few thousand in-scope candidates once §1's scope filter is applied) keeps a manual pass feasible, consistent with how Day 4's 25-record sample was reviewed.
- No hierarchy signal exists anywhere in the source data (Day 5 confirmed this), so every `parent_object_id` link for this dataset will come from this manual pass, not from an automated rule.

## 5. Rejected-row and archive rules

Every source row is retained in a raw/archive table. The permanent post identity is `(source_system, external_source_id)`; raw image rows use the post identity plus the per-image identifier defined in §3. The export's sequential `Nr.` is retained as `source_row_number` for traceability and sort order, but never used as stable identity because it can change between exports.

Import processing uses distinct states so missing data is not confused with deliberate exclusion:

- `archived_out_of_scope` — intentionally excluded from the current product or Latvia region;
- `needs_review` — potentially in scope, but a required value, classification or conflict is unresolved;
- `ready_for_import` — satisfies the current data contract and has passed its manual decisions;
- `imported` — successfully upserted into the canonical tables.

Under the current `docs/DATA_MODEL.md`, `summary_lv`, municipality, coordinates/location, source URL and verification date are required in `heritage_objects`. A source row may always be archived, but an incomplete candidate remains in staging/review until those requirements are satisfied. It must not silently create a canonical object that violates the contract. If the product later chooses to show incomplete, non-map listings, revise the data contract and add an explicit publication gate before writing the migration.

| Condition                                                                   | Count (per Day 5)                                                       | Disposition                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Out-of-MVP-scope object type (§1)                                           | majority of ~2,025 non-manor-keyword posts, pending manual confirmation | Archived only; `rejection_reason = out_of_scope_object_type`. Revisit if product scope broadens.                                                                                                     |
| Foreign location (13 Poland, 1 Estonia, 1 Lithuania — 15 total)             | 15                                                                      | Imported into the archive with real coordinates; excluded from the Latvia-only public directory/map; `rejection_reason = outside_mvp_region`. Revisit if scope broadens.                             |
| Malformed Latvian coordinates (`Ozoli` railway bridge, `Grāvendāles skola`) | 2                                                                       | `needs_review`; keep original text and `review_reason = coordinates_unverified`; never auto-correct. If otherwise in scope, promote only after verified coordinates satisfy the current contract.    |
| No real coordinate value in any row after collapse                          | 505                                                                     | `needs_review`; retain the candidate in staging and exclude it from canonical/public tables under the current contract until verified.                                                               |
| No real address value in any row after collapse                             | 26                                                                      | Missing address alone is allowed, but a verified current municipality remains required. If municipality cannot be established, use `needs_review`; never derive it blindly from the title qualifier. |
| Within-post body-text variants not selected as the longest value (§3)       | up to 12 posts' extra variants                                          | Preserve all variants and use `needs_review`; this does not discard the selected source body, but an editor still approves `summary_lv`.                                                             |

Rows failing scope (first two rows above) still get a stable `external_source_id` reserved in the archive, so that if they are imported later they reuse the same identity rather than risking a duplicate.

## 6. Future per-image relation

`docs/DATA_MODEL.md` lists "Image records with credit, rights, alt text and derivative sizes" under Recommended fields but has not yet defined its schema. Day 5's four per-image source columns give this dataset's actual shape for that definition:

| Proposed `object_images` field | Source                         | Note                                                                                                                                                                     |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `object_id`                    | (derived)                      | FK to the collapsed heritage object, grouped by `Bloga ieraksta Nr.`.                                                                                                    |
| `external_image_id`            | (derived)                      | Normalised Google Drive file ID when present; otherwise normalised original URL or deterministic fallback hash. Unique with the source/post identity.                    |
| `source_image_url`             | `Attēla oriģinālā saite blogā` | Original source reference. Preserve it for provenance, but do not assume permanent availability or hotlink it as the product asset.                                      |
| `drive_reference_url`          | `Hipersaite Google Drive`      | Preserve the normalised URL as an internal/admin source reference; the extracted file ID is the stable handle. A Drive link is not licence evidence.                     |
| `drive_filename`               | `Attēla nosaukums Drive`       | Informational only.                                                                                                                                                      |
| `caption_lv`                   | `Attēla paraksts`              | Expect null for ~99.9% of rows per Day 5; do not treat absence as an error.                                                                                              |
| `source_attribution_note`      | fixed text, not per-row        | The dataset owner confirmed reuse with source attribution; store a fixed attribution referencing `manasvietas.blogspot.com`. Detailed rights assessment remains pending. |
| `rights_status`                | fixed initial state            | Start as `attribution_required_pending_review`; later rights work may replace it with a more specific status.                                                            |
| `source_row_number`            | `Nr.`                          | Traceability and ordering metadata only; not a stable key.                                                                                                               |
| `is_primary`, `sort_order`     | (derived)                      | One cover image per object; order preserved from `source_row_number` within the post, with a deterministic tie-breaker on `external_image_id`.                           |

This table is a proposal for whoever writes the actual migration (Day 8); it is not itself a migration.

## Open items carried to Day 7+

- The object-type/scope classification (§1) still needs the human review pass before any post is actually promoted to published; this document defines the rule, not the per-post decisions.
- The `object_names` proposal in §2 must be included in the Day 8 migration and reconciled with the search index in `docs/DATA_MODEL.md`.
- The duplicate/hierarchy candidate list (§4) has not been generated yet; it depends on the in-scope set from §1 being decided first.
